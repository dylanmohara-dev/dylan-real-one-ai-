import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'

const router = Router()

// Category drives grade weighting in SchoolPage.jsx's classAverage --
// a flat average of every graded item treated the same regardless of
// whether it's a $5 worksheet or a final exam was a real, previously-
// documented gap (see the comment this replaces in that file). Defaults
// to 'homework' since that's what most assignments actually are; 'test'
// (routes/tests.js) and 'quiz'/'project' exist for the other cases.
const ASSIGNMENT_CATEGORIES = ['homework', 'quiz', 'test', 'project']

router.get('/', (req, res) => {
  res.json({ assignments: loadData('assignments') })
})

router.post('/', async (req, res) => {
  try {
    const { classId, title, dueDate, category } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const assignments = loadData('assignments')
    const assignment = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      dueDate: dueDate || '',
      category: ASSIGNMENT_CATEGORIES.includes(category) ? category : 'homework',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    // Best-effort real-calendar write -- see lib/calendarAutoSync.js.
    await syncCalendarEvent(assignment, { title: assignment.title, date: assignment.dueDate, mode: 'school' })
    assignments.push(assignment)
    saveData('assignments', assignments)
    res.json({ assignment })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save assignment' })
  }
})

router.put('/:id', async (req, res) => {
  const assignments = loadData('assignments')
  const index = assignments.findIndex((a) => a.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' })
  }
  assignments[index] = { ...assignments[index], ...req.body, id: assignments[index].id }
  await syncCalendarEvent(assignments[index], { title: assignments[index].title, date: assignments[index].dueDate, mode: 'school' })
  saveData('assignments', assignments)
  res.json({ assignment: assignments[index] })
})

router.delete('/:id', async (req, res) => {
  const assignments = loadData('assignments')
  const assignment = assignments.find((a) => a.id === req.params.id)
  if (assignment) await clearCalendarEvent(assignment)
  const remaining = assignments.filter((a) => a.id !== req.params.id)
  saveData('assignments', remaining)
  res.json({ success: true })
})

export default router
