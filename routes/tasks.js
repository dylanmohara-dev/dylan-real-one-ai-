import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'
import { effortFieldsForCreate, effortFieldsForUpdate, EffortEstimateValidationError } from '../lib/effortEstimate.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ tasks: loadData('tasks') })
})

router.post('/', async (req, res) => {
  try {
    const { title, priority, dueDate, reminder, completed, category } = req.body
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Task title is required' })
    }
    const tasks = loadData('tasks')
    const task = {
      id: Date.now().toString(),
      title: title.trim(),
      priority: priority || 'medium',
      dueDate: dueDate || '',
      reminder: reminder || 'none',
      category: category || 'general',
      completed: Boolean(completed),
      createdAt: new Date().toISOString(),
      ...effortFieldsForCreate(req.body),
    }
    // Best-effort real-calendar write -- see lib/calendarAutoSync.js.
    // Mutates `task` in place with the link fields before it's saved below.
    await syncCalendarEvent(task, { title: task.title, date: task.dueDate, mode: task.category })
    tasks.push(task)
    saveData('tasks', tasks)
    res.json({ task })
  } catch (error) {
    if (error instanceof EffortEstimateValidationError) return res.status(400).json({ error: error.message })
    console.error(error)
    res.status(500).json({ error: 'Could not save task' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { fields, clear } = effortFieldsForUpdate(req.body)
    const tasks = loadData('tasks')
    const index = tasks.findIndex((task) => task.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Task not found' })
    tasks[index] = { ...tasks[index], ...fields, id: tasks[index].id }
    if (clear) {
      delete tasks[index].estimatedEffortMinutes
      delete tasks[index].estimatedEffortProvenance
    }
    // Effort changes describe work, not the all-day calendar event. Avoid
    // rewriting that external event when effort is the only edited field.
    const effortOnly = Object.keys(req.body).length === 1 && Object.hasOwn(req.body, 'estimatedEffortMinutes')
    if (!effortOnly) {
      await syncCalendarEvent(tasks[index], { title: tasks[index].title, date: tasks[index].dueDate, mode: tasks[index].category })
    }
    saveData('tasks', tasks)
    res.json({ task: tasks[index] })
  } catch (error) {
    if (error instanceof EffortEstimateValidationError) return res.status(400).json({ error: error.message })
    console.error(error)
    res.status(500).json({ error: 'Could not update task' })
  }
})

router.delete('/:id', async (req, res) => {
  const tasks = loadData('tasks')
  const task = tasks.find((t) => t.id === req.params.id)
  if (task) await clearCalendarEvent(task)
  const remaining = tasks.filter((t) => t.id !== req.params.id)
  saveData('tasks', remaining)
  res.json({ success: true })
})

// Restores a previously-deleted task exactly as it was -- used to bring
// back a deleted test's study-plan sessions (which deleteTest cascades
// away) as part of undoing that delete. See classes.js's /restore for why
// this takes the full record rather than reusing the create route.
router.post('/restore', async (req, res) => {
  const record = req.body.task
  if (!record?.id || !record?.title) {
    return res.status(400).json({ error: 'A full task record with id and title is required' })
  }
  const tasks = loadData('tasks')
  if (tasks.some((t) => t.id === record.id)) {
    return res.json({ task: record })
  }
  // See assignments.js's /restore -- drop the stale real-calendar link
  // from before the delete, so this creates a fresh event instead of
  // retrying an update against one that's already gone.
  delete record.calendarEventUrl
  delete record.calendarEventEtag
  delete record.calendarEventUid
  await syncCalendarEvent(record, { title: record.title, date: record.dueDate, mode: record.category })
  tasks.push(record)
  saveData('tasks', tasks)
  res.json({ task: record })
})

export default router
