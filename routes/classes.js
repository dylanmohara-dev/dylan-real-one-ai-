import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ classes: loadData('classes') })
})

router.post('/', (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Class name is required' })
    }
    const classes = loadData('classes')
    const schoolClass = {
      id: Date.now().toString(),
      name: name.trim(),
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

router.delete('/:id', (req, res) => {
  const classes = loadData('classes')
  const remaining = classes.filter((c) => c.id !== req.params.id)
  saveData('classes', remaining)
  const assignments = loadData('assignments').filter((a) => a.classId !== req.params.id)
  saveData('assignments', assignments)
  const tests = loadData('tests').filter((t) => t.classId !== req.params.id)
  saveData('tests', tests)
  res.json({ success: true })
})

export default router
