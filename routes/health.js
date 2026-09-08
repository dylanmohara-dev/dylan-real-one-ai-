import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()
const CATEGORIES = ['sleep', 'food', 'water', 'activity']

router.get('/', (req, res) => {
  res.json({ entries: loadData('health') })
})

router.post('/', (req, res) => {
  try {
    const { category, value, note } = req.body

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + CATEGORIES.join(', ') })
    }
    if (!value?.toString().trim()) {
      return res.status(400).json({ error: 'value is required' })
    }

    const entries = loadData('health')
    const entry = {
      id: Date.now().toString(),
      category,
      value: value.toString().trim(),
      note: (note || '').trim(),
      createdAt: new Date().toISOString(),
    }

    entries.push(entry)
    saveData('health', entries)
    res.json({ entry })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save health entry' })
  }
})

router.delete('/:id', (req, res) => {
  const entries = loadData('health')
  const remaining = entries.filter((entry) => entry.id !== req.params.id)
  saveData('health', remaining)
  res.json({ success: true })
})

export default router
