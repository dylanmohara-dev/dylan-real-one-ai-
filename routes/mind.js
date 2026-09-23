import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

router.get('/habits', (req, res) => {
  res.json({ habits: loadData('mind_habits') })
})

// Every habit used to be forced into the same box: a plain daily
// yes/no checkbox. That's wrong for a habit like "gym" or "call mom"
// that's realistically 2-3x/week, not every single day -- Dylan's own
// "can't track the kind of habits you want" complaint. frequency lets a
// habit opt into a weekly target (timesPerWeek, clamped 2-6) instead of
// the daily-only default; MindPage.jsx branches its streak math on
// this field.
router.post('/habits', (req, res) => {
  try {
    const { name, frequency, timesPerWeek } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A habit name is required' })
    }
    const habits = loadData('mind_habits')
    const isWeekly = frequency === 'weekly'
    const habit = {
      id: Date.now().toString(),
      name: name.trim(),
      active: true,
      frequency: isWeekly ? 'weekly' : 'daily',
      ...(isWeekly ? { timesPerWeek: Math.min(6, Math.max(2, Number(timesPerWeek) || 3)) } : {}),
      createdAt: new Date().toISOString(),
    }
    habits.push(habit)
    saveData('mind_habits', habits)
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
    const habits = loadData('mind_habits')
    const index = habits.findIndex((h) => h.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Habit not found' })
    }
    habits[index] = { ...habits[index], ...req.body, id: habits[index].id }
    // A habit switched back to daily shouldn't keep a stale timesPerWeek
    // sitting on it -- harmless today (daily's own code path never reads
    // it), but leaving it there is exactly the kind of imprecise leftover
    // state that turns into a real bug the next time this schema changes.
    if (habits[index].frequency !== 'weekly') {
      delete habits[index].timesPerWeek
    }
    saveData('mind_habits', habits)
    res.json({ habit: habits[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update habit' })
  }
})

router.delete('/habits/:id', (req, res) => {
  const habits = loadData('mind_habits')
  const remaining = habits.filter((h) => h.id !== req.params.id)
  saveData('mind_habits', remaining)
  const completions = loadData('mind_completions')
  const remainingCompletions = completions.filter((c) => c.habitId !== req.params.id)
  saveData('mind_completions', remainingCompletions)
  res.json({ success: true })
})

// Completions: one row per habit per day it was actually done. No row at
// all means "not done" -- there's no explicit false state to keep in sync,
// which is also why toggling just adds or removes the one row instead of
// flipping a boolean.
router.get('/completions', (req, res) => {
  res.json({ completions: loadData('mind_completions') })
})

router.post('/completions/toggle', (req, res) => {
  try {
    const { habitId, date } = req.body
    if (!habitId || !date) {
      return res.status(400).json({ error: 'A habit and date are required' })
    }
    const completions = loadData('mind_completions')
    const existingIndex = completions.findIndex((c) => c.habitId === habitId && c.date === date)

    let done
    if (existingIndex === -1) {
      completions.push({ id: Date.now().toString(), habitId, date, createdAt: new Date().toISOString() })
      done = true
    } else {
      completions.splice(existingIndex, 1)
      done = false
    }
    saveData('mind_completions', completions)
    res.json({ done, date: date || todayKey() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update completion' })
  }
})

export default router
