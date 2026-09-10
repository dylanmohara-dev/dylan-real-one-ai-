import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ classes: loadData('classes') })
})

// level: 'regular' | 'honors' | 'ap' -- drives the GPA weighting bonus in
// SchoolPage.jsx (Honors +0.5, AP/IB +1.0, the standard US convention).
// Defaults to 'regular' so every existing class (created before this
// field existed) reads the same as an explicitly-regular one.
const VALID_LEVELS = ['regular', 'honors', 'ap']

router.post('/', (req, res) => {
  try {
    const { name, level } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Class name is required' })
    }
    const classes = loadData('classes')
    const schoolClass = {
      id: Date.now().toString(),
      name: name.trim(),
      level: VALID_LEVELS.includes(level) ? level : 'regular',
      // Non-academic periods (Study Hall, Lunch) can be created like any
      // other class and then excluded from GPA math individually --
      // simpler than a separate "is this even a class" concept.
      excludeFromGpa: false,
      createdAt: new Date().toISOString(),
    }
    classes.push(schoolClass)
    saveData('classes', classes)
    res.json({ class: schoolClass })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save class' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const classes = loadData('classes')
    const index = classes.findIndex((c) => c.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Class not found' })
    }
    const updates = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      updates.name = req.body.name.trim()
    }
    if (VALID_LEVELS.includes(req.body.level)) {
      updates.level = req.body.level
    }
    if (typeof req.body.excludeFromGpa === 'boolean') {
      updates.excludeFromGpa = req.body.excludeFromGpa
    }
    classes[index] = { ...classes[index], ...updates }
    saveData('classes', classes)
    res.json({ class: classes[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update class' })
  }
})

router.delete('/:id', (req, res) => {
  const classes = loadData('classes')
  const remaining = classes.filter((c) => c.id !== req.params.id)
  saveData('classes', remaining)
  const assignments = loadData('assignments').filter((a) => a.classId !== req.params.id)
  saveData('assignments', assignments)

  const allTests = loadData('tests')
  const deletedTestIds = new Set(allTests.filter((t) => t.classId === req.params.id).map((t) => t.id))
  const tests = allTests.filter((t) => t.classId !== req.params.id)
  saveData('tests', tests)

  // Deleting a class cascades to its tests -- and any study-plan tasks
  // generated for those tests would otherwise be left pointing at a test
  // that no longer exists.
  if (deletedTestIds.size) {
    const tasks = loadData('tasks').filter((t) => !deletedTestIds.has(t.studyPlanFor))
    saveData('tasks', tasks)
  }

  res.json({ success: true })
})

export default router
