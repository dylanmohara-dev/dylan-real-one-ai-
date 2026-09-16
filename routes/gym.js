import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Bare local YYYY-MM-DD -- NOT toISOString().slice(0, 10), which reads off
// UTC. Same bug class already found and fixed in skills.js, discipline.js,
// reading.js, family.js, and finance.js this session -- an evening
// workout logged with no explicit date gets tagged as tomorrow's date in
// any US timezone, corrupting the very week-plan/log adherence comparison
// this pass adds below.
function todayKeyLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

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

router.put('/exercises/:id', (req, res) => {
  const exercises = loadData('gym_exercises')
  const index = exercises.findIndex((e) => e.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Exercise not found' })
  }
  // Generic merge, same shape as the routines/logs PUT below -- used today
  // to set or clear a simple progression program (targetSets, targetReps,
  // progressionIncrement) without a dedicated endpoint for it. Leaving a
  // field out of the body leaves that field untouched.
  exercises[index] = { ...exercises[index], ...req.body, id: exercises[index].id }
  saveData('gym_exercises', exercises)
  res.json({ exercise: exercises[index] })
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
      date: date || todayKeyLocal(),
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
  // wherever it was assigned, in the same request that deletes it. Same
  // cleanup for any per-date override pointing at it.
  const weekPlan = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
  let changed = false
  for (const day of WEEKDAYS) {
    if (weekPlan[day] === req.params.id) {
      weekPlan[day] = null
      changed = true
    }
  }
  if (changed) saveData('gym_week_plan', weekPlan)

  const overrides = loadData('gym_week_plan_overrides', {})
  let overridesChanged = false
  for (const date of Object.keys(overrides)) {
    if (overrides[date] === req.params.id) {
      delete overrides[date]
      overridesChanged = true
    }
  }
  if (overridesChanged) saveData('gym_week_plan_overrides', overrides)

  res.json({ success: true })
})

// Week plan: which routine (if any) is scheduled for each day of the week.
// A single settings object, not a list -- monday..sunday, each either a
// routine id or null ("rest / no routine scheduled").
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
export const DEFAULT_WEEK_PLAN = Object.fromEntries(WEEKDAYS.map((day) => [day, null]))

router.get('/week-plan', (req, res) => {
  const stored = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
  // Merge over the default so a week-plan file saved before some future
  // day key existed (or a hand-edited/partial file) never crashes the
  // frontend on a missing key -- every day always comes back defined.
  res.json({ weekPlan: { ...DEFAULT_WEEK_PLAN, ...stored }, overrides: loadData('gym_week_plan_overrides', {}) })
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

// Per-date overrides: a fixed Mon-Sun -> routine mapping assumes training
// repeats identically every calendar week forever, tied to weekday names.
// That's wrong for a rotating split (Push/Pull/Legs/Rest, cycling
// regardless of which weekday it lands on) or just a day where Dylan
// swaps what he's doing -- Dylan's own "routines/week plan don't fit your
// training" complaint. An override for one specific date takes priority
// over that date's weekday routine without touching the recurring
// template; posting a null/empty routineId clears the override.
router.post('/week-plan/override', (req, res) => {
  try {
    const { date, routineId } = req.body || {}
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' })
    }
    const overrides = loadData('gym_week_plan_overrides', {})
    if (routineId) {
      overrides[date] = routineId
    } else {
      delete overrides[date]
    }
    saveData('gym_week_plan_overrides', overrides)
    res.json({ overrides })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save week plan override' })
  }
})

// Day notes: one freeform note per date -- "how did today go," not tied
// to any single exercise. Upsert by date: saving again for a date that
// already has a note replaces it; saving an empty note deletes the row
// instead of keeping an empty one sitting around.
router.get('/day-notes', (req, res) => {
  res.json({ dayNotes: loadData('gym_day_notes') })
})

router.post('/day-notes', (req, res) => {
  try {
    const { date, note } = req.body
    if (!date) {
      return res.status(400).json({ error: 'date is required' })
    }
    const trimmed = (note || '').trim()
    const dayNotes = loadData('gym_day_notes')
    const index = dayNotes.findIndex((n) => n.date === date)

    if (!trimmed) {
      if (index !== -1) {
        dayNotes.splice(index, 1)
        saveData('gym_day_notes', dayNotes)
      }
      return res.json({ dayNote: null })
    }

    if (index === -1) {
      const dayNote = { id: Date.now().toString(), date, note: trimmed, createdAt: new Date().toISOString() }
      dayNotes.push(dayNote)
      saveData('gym_day_notes', dayNotes)
      return res.json({ dayNote })
    }

    dayNotes[index] = { ...dayNotes[index], note: trimmed, updatedAt: new Date().toISOString() }
    saveData('gym_day_notes', dayNotes)
    res.json({ dayNote: dayNotes[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save day note' })
  }
})

export default router
