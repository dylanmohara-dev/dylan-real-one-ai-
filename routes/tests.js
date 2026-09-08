import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ tests: loadData('tests') })
})

router.post('/', (req, res) => {
  try {
    const { classId, title, date } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const tests = loadData('tests')
    const test = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      date: date || '',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    tests.push(test)
    saveData('tests', tests)
    res.json({ test })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save test' })
  }
})

router.put('/:id', (req, res) => {
  const tests = loadData('tests')
  const index = tests.findIndex((t) => t.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Test not found' })
  }
  tests[index] = { ...tests[index], ...req.body, id: tests[index].id }
  saveData('tests', tests)
  res.json({ test: tests[index] })
})

router.delete('/:id', (req, res) => {
  const tests = loadData('tests')
  const remaining = tests.filter((t) => t.id !== req.params.id)
  saveData('tests', remaining)
  res.json({ success: true })
})

export default router
