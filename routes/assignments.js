import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'
import { addToTrash } from '../lib/trashStore.js'

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
  if (assignment) {
    addToTrash({ mode: 'school', kind: 'assignment', label: `Assignment: ${assignment.title}`, snapshot: assignment })
    await clearCalendarEvent(assignment)
  }
  const remaining = assignments.filter((a) => a.id !== req.params.id)
  saveData('assignments', remaining)
  res.json({ success: true })
})

// Restores a previously-deleted assignment exactly as it was, including
// fields POST / never accepts on create (completed, grade) -- see
// classes.js's /restore for why this needs the full record rather than
// reusing the create route.
router.post('/restore', async (req, res) => {
  const record = req.body.assignment
  if (!record?.id || !record?.title || !record?.classId) {
    return res.status(400).json({ error: 'A full assignment record with id, title and classId is required' })
  }
  const assignments = loadData('assignments')
  if (assignments.some((a) => a.id === record.id)) {
    return res.json({ assignment: record })
  }
  // The snapshot was taken before delete ran clearCalendarEvent on the
  // live record, so it still carries the OLD (now-deleted) real-calendar
  // link. Reusing that link would make syncCalendarEvent try to update an
  // event that no longer exists -- a silent, permanent failure (see the
  // "stuck record" note in lib/calendarAutoSync.js). Dropping the stale
  // link first forces a clean create instead.
  delete record.calendarEventUrl
  delete record.calendarEventEtag
  delete record.calendarEventUid
  await syncCalendarEvent(record, { title: record.title, date: record.dueDate, mode: 'school' })
  assignments.push(record)
  saveData('assignments', assignments)
  res.json({ assignment: record })
})

export default router
