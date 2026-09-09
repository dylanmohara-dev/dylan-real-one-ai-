import { Router } from 'express'
import fs from 'fs'
import { connect, listUpcomingEvents, listEventsInRange, isConnected, clearCredentials } from '../lib/appleCalendar.js'
import { loadData } from '../lib/dataStore.js'

const router = Router()

function logCalendarError(label, error) {
  const line = `${new Date().toISOString()} ${label}: ${error?.stack || error?.message || JSON.stringify(error)}\n\n`
  console.error(line)
  try {
    fs.appendFileSync(new URL('../calendar-error.log', import.meta.url), line)
  } catch {}
}

router.get('/status', (req, res) => {
  res.json({ connected: isConnected() })
})

router.post('/connect', async (req, res) => {
  try {
    const { appleId, appPassword } = req.body
    const result = await connect({ appleId, appPassword })
    res.json({ success: true, ...result })
  } catch (error) {
    logCalendarError('CONNECT_FAILED', error)
    res.status(400).json({ error: error?.message || 'Connection failed — check the server log.' })
  }
})

router.get('/events', async (req, res) => {
  try {
    const events = await listUpcomingEvents({ maxResults: 25 })
    res.json({ events })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/disconnect', (req, res) => {
  clearCredentials()
  res.json({ success: true })
})


/*
  One call that fills a month grid with EVERYTHING, which is the whole point
  of the calendar page — iCloud events plus every dated thing the app itself
  owns. Aggregated here rather than on the client so the grid makes one
  request instead of six, and so a dead iCloud connection still returns all
  the local items instead of an empty month.

  Every item comes back in one flat shape: { id, kind, mode, title, date,
  time, meta }. `mode` is what drives the colour in the grid.
*/
router.get('/month', async (req, res) => {
  const year = Number(req.query.year)
  const month = Number(req.query.month) // 1-12

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year and month (1-12) are required' })
  }

  const rangeStart = new Date(year, month - 1, 1, 0, 0, 0)
  const rangeEnd = new Date(year, month, 0, 23, 59, 59)
  const items = []

  const dayKey = (value) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const inRange = (key) => Boolean(key) && key >= dayKey(rangeStart) && key <= dayKey(rangeEnd)

  // --- iCloud events. Never let a calendar problem empty the whole month.
  let calendarError = null
  if (isConnected()) {
    try {
      const events = await listEventsInRange({ start: rangeStart, end: rangeEnd })
      for (const event of events) {
        const key = dayKey(event.start)
        if (!inRange(key)) continue
        items.push({
          id: `event-${event.id}`,
          kind: 'event',
          mode: 'calendar',
          title: event.title,
          date: key,
          time: event.allDay
            ? null
            : new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          meta: event.calendar,
        })
      }
    } catch (error) {
      calendarError = error.message
    }
  }

  // --- School: assignments due, tests scheduled.
  const classes = loadData('classes')
  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]))

  for (const assignment of loadData('assignments')) {
    const key = dayKey(assignment.dueDate)
    if (!inRange(key)) continue
    items.push({
      id: `assignment-${assignment.id}`,
      kind: 'assignment',
      mode: 'school',
      title: assignment.title,
      date: key,
      time: null,
      meta: classNameById[assignment.classId] || 'Class',
      done: Boolean(assignment.completed),
    })
  }

  for (const test of loadData('tests')) {
    const key = dayKey(test.date)
    if (!inRange(key)) continue
    items.push({
      id: `test-${test.id}`,
      kind: 'test',
      mode: 'school',
      title: test.title,
      date: key,
      time: null,
      meta: classNameById[test.classId] || 'Class',
    })
  }

  // --- Tasks with a due date.
  for (const task of loadData('tasks')) {
    const key = dayKey(task.dueDate)
    if (!inRange(key)) continue
    items.push({
      id: `task-${task.id}`,
      kind: 'task',
      mode: 'discipline',
      title: task.title,
      date: key,
      time: null,
      meta: task.priority ? `${task.priority} priority` : '',
      done: Boolean(task.completed),
    })
  }

  // --- Skills: practice actually logged.
  const skills = loadData('skills')
  const skillNameById = Object.fromEntries(skills.map((s) => [s.id, s.name]))
  for (const session of loadData('skill_sessions')) {
    const key = dayKey(session.date)
    if (!inRange(key)) continue
    items.push({
      id: `skill-${session.id}`,
      kind: 'skill',
      mode: 'skills',
      title: `${skillNameById[session.skillId] || 'Practice'} — ${session.minutes}m`,
      date: key,
      time: null,
      meta: session.note || '',
    })
  }

  // --- Health entries.
  for (const entry of loadData('health')) {
    const key = dayKey(entry.date || entry.createdAt)
    if (!inRange(key)) continue
    items.push({
      id: `health-${entry.id}`,
      kind: 'health',
      mode: 'health',
      title: `${entry.category}: ${entry.value}`,
      date: key,
      time: null,
      meta: entry.note || '',
    })
  }

  // --- Journal entries (dates only; contents stay encrypted and private).
  for (const entry of loadData('journal')) {
    const key = dayKey(entry.date || entry.createdAt)
    if (!inRange(key)) continue
    items.push({
      id: `journal-${entry.id}`,
      kind: 'journal',
      mode: 'family',
      title: 'Journal entry',
      date: key,
      time: null,
      meta: '',
    })
  }

  items.sort((a, b) => (a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)))

  res.json({
    year,
    month,
    connected: isConnected(),
    calendarError,
    items,
  })
})

export default router
