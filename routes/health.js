import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { addToTrash } from '../lib/trashStore.js'

const router = Router()
const CATEGORIES = ['sleep', 'food', 'water', 'activity']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

router.get('/', (req, res) => {
  res.json({ entries: loadData('health') })
})

router.post('/', (req, res) => {
  try {
    const { category, value, note, amount, date } = req.body

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + CATEGORIES.join(', ') })
    }
    if (!value?.toString().trim()) {
      return res.status(400).json({ error: 'value is required' })
    }
    if (date && !DATE_PATTERN.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }

    const entries = loadData('health')
    const entry = {
      id: Date.now().toString(),
      category,
      value: value.toString().trim(),
      note: (note || '').trim(),
      date: date || todayKey(),
      createdAt: new Date().toISOString(),
    }

    // Only stored when a real positive number came through -- old entries
    // (and any new food entry) simply have no `amount` field, and every
    // consumer of it already treats a missing amount as "not counted."
    const numericAmount = Number(amount)
    if (Number.isFinite(numericAmount) && numericAmount > 0) {
      entry.amount = numericAmount
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
  const deleted = entries.find((entry) => entry.id === req.params.id)
  const remaining = entries.filter((entry) => entry.id !== req.params.id)
  saveData('health', remaining)
  if (deleted) {
    addToTrash({ mode: 'health', kind: 'health-entry', label: `${deleted.category}: ${deleted.value}`, snapshot: deleted })
  }
  res.json({ success: true })
})

const NUMERIC_CATEGORIES = ['sleep', 'water', 'activity']

router.get('/goals', (req, res) => {
  res.json({ goals: loadData('health_goals', {}) })
})

router.post('/goals', (req, res) => {
  try {
    const { category, goal } = req.body
    if (!NUMERIC_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + NUMERIC_CATEGORIES.join(', ') })
    }

    const goals = loadData('health_goals', {})
    const numericGoal = Number(goal)

    if (!numericGoal || numericGoal <= 0) {
      delete goals[category]
    } else {
      goals[category] = numericGoal
    }

    saveData('health_goals', goals)
    res.json({ goals })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save health goal' })
  }
})

export default router
