import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Exercises: a small personal library ("Bench Press", "Squat", ...). Not
// prescriptive -- Dylan defines his own, no built-in exercise database.
router.get('/exercises', (req, res) => {
  res.json({ exercises: loadData('gym_exercises') })
})

router.post('/exercises', (req, res) => {
  try {
    const { name, category } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Exercise name is required' })
    }
    const exercises = loadData('gym_exercises')
    const exercise = {
      id: Date.now().toString(),
      name: name.trim(),
      category: category?.trim() || '',
      createdAt: new Date().toISOString(),
    }
    exercises.push(exercise)
    saveData('gym_exercises', exercises)
    res.json({ exercise })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save exercise' })
  }
})

router.delete('/exercises/:id', (req, res) => {
  const exercises = loadData('gym_exercises')
  const remaining = exercises.filter((e) => e.id !== req.params.id)
  saveData('gym_exercises', remaining)
  // Logs for a deleted exercise are left alone deliberately -- they're
  // still real history of a workout that happened, even if the exercise
  // itself is no longer in the active library.
  res.json({ success: true })
})

// Logs: one entry per exercise per session -- "on this date, this
// exercise, these sets." sets is [{ reps, weight }], both plain numbers.
router.get('/logs', (req, res) => {
  res.json({ logs: loadData('gym_logs') })
})

router.post('/logs', (req, res) => {
  try {
    const { exerciseId, date, sets } = req.body
    if (!exerciseId) {
      return res.status(400).json({ error: 'exerciseId is required' })
    }
    if (!Array.isArray(sets) || !sets.length) {
      return res.status(400).json({ error: 'At least one set is required' })
    }
    const cleanSets = sets.map((s) => ({
      reps: Number(s.reps) || 0,
      weight: Number(s.weight) || 0,
    }))
    const logs = loadData('gym_logs')
    const log = {
      id: Date.now().toString(),
      exerciseId,
      date: date || new Date().toISOString().slice(0, 10),
      sets: cleanSets,
      createdAt: new Date().toISOString(),
    }
    logs.push(log)
    saveData('gym_logs', logs)
    res.json({ log })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save workout log' })
  }
})

router.put('/logs/:id', (req, res) => {
  const logs = loadData('gym_logs')
  const index = logs.findIndex((l) => l.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Log not found' })
  }
  logs[index] = { ...logs[index], ...req.body, id: logs[index].id }
  saveData('gym_logs', logs)
  res.json({ log: logs[index] })
})

router.delete('/logs/:id', (req, res) => {
  const logs = loadData('gym_logs')
  const remaining = logs.filter((l) => l.id !== req.params.id)
  saveData('gym_logs', remaining)
  res.json({ success: true })
})

export default router
