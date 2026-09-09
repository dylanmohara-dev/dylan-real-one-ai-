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

// Routines: a named, reusable list of exercises ("Push Day" -> [Bench
// Press, Overhead Press, Tricep Pushdown]). Just the exercise list, not a
// prescribed sets/reps scheme -- the point is "which exercises today,"
// not a rigid program (same flexibility-over-rigidity call the initial
// Gym mode design made, backed by the same habit-tracking research).
router.get('/routines', (req, res) => {
  res.json({ routines: loadData('gym_routines') })
})

router.post('/routines', (req, res) => {
  try {
    const { name, exerciseIds } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Routine name is required' })
    }
    const routines = loadData('gym_routines')
    const routine = {
      id: Date.now().toString(),
      name: name.trim(),
      exerciseIds: Array.isArray(exerciseIds) ? exerciseIds : [],
      createdAt: new Date().toISOString(),
    }
    routines.push(routine)
    saveData('gym_routines', routines)
    res.json({ routine })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save routine' })
  }
})

router.put('/routines/:id', (req, res) => {
  const routines = loadData('gym_routines')
  const index = routines.findIndex((r) => r.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Routine not found' })
  }
  routines[index] = { ...routines[index], ...req.body, id: routines[index].id }
  saveData('gym_routines', routines)
  res.json({ routine: routines[index] })
})

router.delete('/routines/:id', (req, res) => {
  const routines = loadData('gym_routines')
  const remaining = routines.filter((r) => r.id !== req.params.id)
  saveData('gym_routines', remaining)

  // A day still pointing at a routine that no longer exists would silently
  // break the "today's workout" view -- clear it out of the week plan
  // wherever it was assigned, in the same request that deletes it.
  const weekPlan = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
  let changed = false
  for (const day of WEEKDAYS) {
    if (weekPlan[day] === req.params.id) {
      weekPlan[day] = null
      changed = true
    }
  }
  if (changed) saveData('gym_week_plan', weekPlan)

  res.json({ success: true })
})

// Week plan: which routine (if any) is scheduled for each day of the week.
// A single settings object, not a list -- monday..sunday, each either a
// routine id or null ("rest / no routine scheduled").
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DEFAULT_WEEK_PLAN = Object.fromEntries(WEEKDAYS.map((day) => [day, null]))

router.get('/week-plan', (req, res) => {
  const stored = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
  // Merge over the default so a week-plan file saved before some future
  // day key existed (or a hand-edited/partial file) never crashes the
  // frontend on a missing key -- every day always comes back defined.
  res.json({ weekPlan: { ...DEFAULT_WEEK_PLAN, ...stored } })
})

router.post('/week-plan', (req, res) => {
  try {
    const body = req.body || {}
    const stored = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
    const weekPlan = { ...DEFAULT_WEEK_PLAN, ...stored }
    for (const day of WEEKDAYS) {
      if (day in body) weekPlan[day] = body[day] || null
    }
    saveData('gym_week_plan', weekPlan)
    res.json({ weekPlan })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save week plan' })
  }
})

export default router
