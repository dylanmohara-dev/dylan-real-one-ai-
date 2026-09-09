import { Router } from 'express'
import fs from 'fs'
import {
  connect,
  listUpcomingEvents,
  listEventsInRange,
  listCalendars,
  getTargetCalendarUrl,
  setTargetCalendarUrl,
  getCalendarMap,
  setCalendarModeMapping,
  createEvent,
  updateEvent,
  deleteEvent,
  isConnected,
  clearCredentials,
} from '../lib/appleCalendar.js'
import { loadData } from '../lib/dataStore.js'

const router = Router()

// Keep in sync with LIFE_MODE_KEYS in lib/appleCalendar.js and the 9 keys
// in src/data/lifeModes.js. Used to turn a raw mode key into what shows up
// in the calendar grid when no dedicated iCloud calendar is mapped to it.
const MODE_LABELS = {
  school: 'School',
  sports: 'Sports',
  gym: 'Gym',
  health: 'Health',
  finance: 'Finance',
  skills: 'Skills',
  reading: 'Reading',
  discipline: 'Discipline',
  family: 'Family/Faith',
}

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

// --- Target calendar (Settings picks which iCloud calendar writes go to).
router.get('/calendars', async (req, res) => {
  try {
    const calendars = await listCalendars()
    res.json({ calendars, targetCalendarUrl: getTargetCalendarUrl(), calendarMap: getCalendarMap() })
  } catch (error) {
    logCalendarError('LIST_CALENDARS_FAILED', error)
    res.status(400).json({ error: error.message })
  }
})

router.post('/calendars/target', (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: 'url is required' })
    setTargetCalendarUrl(url)
    res.json({ success: true, targetCalendarUrl: url })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Optional per-life-area override on top of the single default target
// above — see the comment on resolveCalendarForMode in appleCalendar.js
// for why this is the only way to get real per-area colors in Apple's own
// Calendar app. Pass url: null to clear a mapping back to "use default".
router.post('/calendars/map', (req, res) => {
  try {
    const { mode, url } = req.body
    setCalendarModeMapping(mode, url || null)
    res.json({ success: true, mode, url: url || null })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// --- Writes. Every one of these touches Dylan's real iCloud calendar —
// nothing here is a local draft that can be silently discarded on failure.
router.post('/events', async (req, res) => {
  try {
    const { title, start, end, allDay, location, mode, recurrence } = req.body
    const result = await createEvent({ title, start, end, allDay, location, mode, recurrence })
    res.json({ success: true, ...result })
  } catch (error) {
    logCalendarError('CREATE_EVENT_FAILED', error)
    res.status(400).json({ error: error.message })
  }
})

router.post('/events/update', async (req, res) => {
  try {
    const { url, etag, uid, title, start, end, allDay, location } = req.body
    await updateEvent({ url, etag, uid, title, start, end, allDay, location })
    res.json({ success: true })
  } catch (error) {
    logCalendarError('UPDATE_EVENT_FAILED', error)
    res.status(400).json({ error: error.message })
  }
})

// Deletion of a real iCloud event is irreversible from this app (no trash,
// no undo — that's Apple's model, not this app's choice). The client is
// expected to have already gotten explicit confirmation from Dylan; this
// route additionally requires the literal string 'DELETE' in the body as a
// second, cheap backstop against a stray click or a retried request firing
// twice, matching the seriousness of what it actually does.
router.post('/events/delete', async (req, res) => {
  try {
    const { url, etag, confirm } = req.body
    if (confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Delete not confirmed.' })
    }
    await deleteEvent({ url, etag })
    res.json({ success: true })
  } catch (error) {
    logCalendarError('DELETE_EVENT_FAILED', error)
    res.status(400).json({ error: error.message })
  }
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
    // A bare "YYYY-MM-DD" (no time component — how every date-only field
    // here is stored: goal.dueDate, assignment.dueDate, test.date,
    // task.dueDate) represents a literal calendar day, not a moment in
    // time. Per the JS spec, a date-only string parses as UTC MIDNIGHT —
    // so on any machine west of UTC (all of the US, including wherever
    // this server actually runs), reading it back with LOCAL date parts
    // silently returns the PREVIOUS day. This was a real, confirmed bug:
    // a goal due "2026-09-11" landed on the 10th under America/New_York.
    // Bare dates are read directly off the string, bypassing Date/
    // timezone conversion entirely, so they can never shift.
    const bareDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (bareDateMatch) return bareDateMatch[0]
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
      const dylanAiCalendarUrl = getTargetCalendarUrl()
      for (const event of events) {
        const key = dayKey(event.start)
        if (!inRange(key)) continue
        // event.mode is 'calendar' (the generic bucket) unless this event's
        // calendar has been mapped to a life area in Settings — see
        // getCalendarMap/invertCalendarMap in lib/appleCalendar.js. When it
        // HAS been mapped, show the life-area label instead of the raw
        // iCloud calendar name so it reads the same way every other
        // life-area item on this grid does.
        const resolvedMode = event.mode && event.mode !== 'calendar' ? event.mode : 'calendar'
        items.push({
          id: `event-${event.id}`,
          kind: 'event',
          mode: resolvedMode,
          // Which side of the Apple-vs-Dylan-AI calendar switcher this
          // event belongs to. 'dylan-ai' is specifically the one calendar
          // chosen as this app's own write target (Settings -> "Calendar
          // -- write target") -- every OTHER real iCloud calendar (Family,
          // personal, shared, etc.) is 'apple'. Only real iCloud events get
          // a source; the school/goal/task/etc. items below are internal
          // app data, not iCloud events, and aren't affected by this
          // toggle at all.
          source: dylanAiCalendarUrl && event.calendarUrl === dylanAiCalendarUrl ? 'dylan-ai' : 'apple',
          title: event.title,
          date: key,
          time: event.allDay
            ? null
            : new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          meta: resolvedMode !== 'calendar' ? (MODE_LABELS[resolvedMode] || resolvedMode) : event.calendar,
          // Carried through so the client can offer edit/delete on THIS
          // specific iCloud event without a second round-trip — but only
          // for non-recurring ones (see isRecurring comment in
          // mapObjectToEvents in lib/appleCalendar.js).
          editable: !event.isRecurring,
          isRecurring: event.isRecurring,
          raw: {
            uid: event.uid,
            url: event.url,
            etag: event.etag,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            location: event.location,
            // So the edit form can show which life area this event is
            // filed under (fixed at creation — moving an event between
            // calendars isn't supported by editing yet).
            mode: resolvedMode,
          },
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

  // --- Goals with a target date. Goals aren't tied to any single life
  // area (a goal can span several), so they get their own dedicated
  // 'goals' calendar color instead of borrowing one of the 9 life areas.
  for (const goal of loadData('goals')) {
    const key = dayKey(goal.dueDate)
    if (!inRange(key)) continue
    items.push({
      id: `goal-${goal.id}`,
      kind: 'goal',
      mode: 'goals',
      title: goal.title,
      date: key,
      time: null,
      meta: `${goal.progress}% complete`,
      done: Number(goal.progress) >= 100,
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
