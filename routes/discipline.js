import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

router.get('/habits', (req, res) => {
  res.json({ habits: loadData('discipline_habits') })
})

router.post('/habits', (req, res) => {
  try {
    const { name } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A habit name is required' })
    }
    const habits = loadData('discipline_habits')
    const habit = {
      id: Date.now().toString(),
      name: name.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    }
    habits.push(habit)
    saveData('discipline_habits', habits)
    res.json({ habit })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save habit' })
  }
})

// Archiving (active: false) instead of deleting keeps past completions
// meaningful -- a habit Dylan quit shouldn't erase the record of the days
// he actually did it. It just stops showing up on today's checklist for
// new completions.
router.put('/habits/:id', (req, res) => {
  try {
    const habits = loadData('discipline_habits')
    const index = habits.findIndex((h) => h.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Habit not found' })
    }
    habits[index] = { ...habits[index], ...req.body, id: habits[index].id }
    saveData('discipline_habits', habits)
    res.json({ habit: habits[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update habit' })
  }
})

router.delete('/habits/:id', (req, res) => {
  const habits = loadData('discipline_habits')
  const remaining = habits.filter((h) => h.id !== req.params.id)
  saveData('discipline_habits', remaining)
  const completions = loadData('discipline_completions')
  const remainingCompletions = completions.filter((c) => c.habitId !== req.params.id)
  saveData('discipline_completions', remainingCompletions)
  res.json({ success: true })
})

// Completions: one row per habit per day it was actually done. No row at
// all means "not done" -- there's no explicit false state to keep in sync,
// which is also why toggling just adds or removes the one row instead of
// flipping a boolean.
router.get('/completions', (req, res) => {
  res.json({ completions: loadData('discipline_completions') })
})

router.post('/completions/toggle', (req, res) => {
  try {
    const { habitId, date } = req.body
    if (!habitId || !date) {
      return res.status(400).json({ error: 'A habit and date are required' })
    }
    const completions = loadData('discipline_completions')
    const existingIndex = completions.findIndex((c) => c.habitId === habitId && c.date === date)

    let done
    if (existingIndex === -1) {
      completions.push({ id: Date.now().toString(), habitId, date, createdAt: new Date().toISOString() })
      done = true
    } else {
      completions.splice(existingIndex, 1)
      done = false
    }
    saveData('discipline_completions', completions)
    res.json({ done, date: date || todayKey() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update completion' })
  }
})

export default router
