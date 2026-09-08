import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ assignments: loadData('assignments') })
})

router.post('/', (req, res) => {
  try {
    const { classId, title, dueDate } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const assignments = loadData('assignments')
    const assignment = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      dueDate: dueDate || '',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    assignments.push(assignment)
    saveData('assignments', assignments)
    res.json({ assignment })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save assignment' })
  }
})

router.put('/:id', (req, res) => {
  const assignments = loadData('assignments')
  const index = assignments.findIndex((a) => a.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' })
  }
  assignments[index] = { ...assignments[index], ...req.body, id: assignments[index].id }
  saveData('assignments', assignments)
  res.json({ assignment: assignments[index] })
})

router.delete('/:id', (req, res) => {
  const assignments = loadData('assignments')
  const remaining = assignments.filter((a) => a.id !== req.params.id)
  saveData('assignments', remaining)
  res.json({ success: true })
})

export default router
