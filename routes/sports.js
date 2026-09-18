import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'

const router = Router()

// 'HH:MM' (24-hour, straight from an <input type="time">) -> whole
// minutes between them. Returns null when either side is missing/invalid
// so callers can tell "no time range given" apart from "a zero-length
// range" instead of silently treating both as 0.
function minutesBetween(startTime, endTime) {
  if (!startTime || !endTime) return null
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null
  const minutes = (eh * 60 + em) - (sh * 60 + sm)
  return minutes > 0 ? minutes : null
}

// Sessions: one entry per practice or game. Deliberately one shared record
// shape for both -- Dylan told us up front he wants both team-sport (games,
// schedule) and individual-sport (personal performance) tracking, and he
// wants duration/intensity, game results, AND film/notes all captured, not
// a pick-one design. type decides which of the type-specific fields below
// actually mean anything; the other type's fields just stay empty/null.
router.get('/sessions', (req, res) => {
  res.json({ sessions: loadData('sports_sessions') })
})

router.post('/sessions', async (req, res) => {
  try {
    const { date, type, durationMinutes, startTime, endTime, intensity, opponent, teamScore, opponentScore, result, notes } = req.body

    if (!date) {
      return res.status(400).json({ error: 'A date is required' })
    }
    if (type !== 'practice' && type !== 'game') {
      return res.status(400).json({ error: "type must be 'practice' or 'game'" })
    }

    const cleanTeamScore = teamScore === '' || teamScore === undefined || teamScore === null ? null : Number(teamScore)
    const cleanOpponentScore =
      opponentScore === '' || opponentScore === undefined || opponentScore === null ? null : Number(opponentScore)

    // If Dylan gave both scores, the result is a fact, not an opinion --
    // derive it rather than trust a separately-picked dropdown that could
    // disagree with the numbers he just typed. If he didn't give scores
    // (or only one), fall back to whatever result he picked directly.
    let resolvedResult = result || ''
    if (cleanTeamScore !== null && cleanOpponentScore !== null && !Number.isNaN(cleanTeamScore) && !Number.isNaN(cleanOpponentScore)) {
      resolvedResult = cleanTeamScore > cleanOpponentScore ? 'win' : cleanTeamScore < cleanOpponentScore ? 'loss' : 'tie'
    }

    const sessions = loadData('sports_sessions')
    const session = {
      id: Date.now().toString(),
      date,
      type,
      startTime: startTime || '',
      endTime: endTime || '',
      // A real start/end time is the source of truth for duration when
      // given -- minutesBetween() below -- with the old plain-number
      // field kept as a fallback so sessions logged before this existed
      // still show a duration.
      durationMinutes: minutesBetween(startTime, endTime) ?? (Number(durationMinutes) || 0),
      intensity: type === 'practice' ? (intensity || '') : '',
      opponent: type === 'game' ? (opponent || '').trim() : '',
      teamScore: type === 'game' ? cleanTeamScore : null,
      opponentScore: type === 'game' ? cleanOpponentScore : null,
      result: type === 'game' ? resolvedResult : '',
      notes: (notes || '').trim(),
      createdAt: new Date().toISOString(),
    }
    // Best-effort real-calendar write -- see lib/calendarAutoSync.js.
    await syncCalendarEvent(session, {
      title: session.type === 'game' ? `Game${session.opponent ? ` vs ${session.opponent}` : ''}` : 'Sports practice',
      date: session.date,
      mode: 'sports',
    })
    sessions.push(session)
    saveData('sports_sessions', sessions)
    res.json({ session })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save session' })
  }
})

router.put('/sessions/:id', async (req, res) => {
  try {
    const sessions = loadData('sports_sessions')
    const index = sessions.findIndex((s) => s.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Session not found' })
    }
    const updated = { ...sessions[index], ...req.body, id: sessions[index].id }

    // Re-derive duration the same way POST does whenever a time range is
    // present, so editing the start/end time actually changes what's shown.
    const derivedMinutes = minutesBetween(updated.startTime, updated.endTime)
    if (derivedMinutes !== null) updated.durationMinutes = derivedMinutes

    // Re-derive result the same way POST does, so an edit that changes the
    // scores can't leave a stale result behind.
    if (updated.teamScore !== null && updated.opponentScore !== null && updated.teamScore !== undefined && updated.opponentScore !== undefined) {
      const t = Number(updated.teamScore)
      const o = Number(updated.opponentScore)
      if (!Number.isNaN(t) && !Number.isNaN(o)) {
        updated.result = t > o ? 'win' : t < o ? 'loss' : 'tie'
      }
    }

    await syncCalendarEvent(updated, {
      title: updated.type === 'game' ? `Game${updated.opponent ? ` vs ${updated.opponent}` : ''}` : 'Sports practice',
      date: updated.date,
      mode: 'sports',
    })
    sessions[index] = updated
    saveData('sports_sessions', sessions)
    res.json({ session: sessions[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update session' })
  }
})

router.delete('/sessions/:id', async (req, res) => {
  const sessions = loadData('sports_sessions')
  const session = sessions.find((s) => s.id === req.params.id)
  if (session) await clearCalendarEvent(session)
  const remaining = sessions.filter((s) => s.id !== req.params.id)
  saveData('sports_sessions', remaining)
  res.json({ success: true })
})

// Recurring events: deliberately separate from the Schedule block below.
// Schedule says "Tuesdays are normally practice" with no time attached --
// good for the plan-vs-reality check, useless for "when exactly is
// practice." This says "Team Practice, Tue/Thu, 3:30-5:30pm" -- a real
// repeating appointment with a time range, the way you'd actually see it
// on a calendar, without changing what Schedule compares against.
router.get('/recurring-events', (req, res) => {
  res.json({ recurringEvents: loadData('sports_recurring_events') })
})

router.post('/recurring-events', (req, res) => {
  try {
    const { label, type, weekdays, startTime, endTime, startDate, endDate } = req.body || {}
    if (!label?.trim()) {
      return res.status(400).json({ error: 'A name is required' })
    }
    if (!Array.isArray(weekdays) || !weekdays.length) {
      return res.status(400).json({ error: 'Pick at least one day of the week' })
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'A start and end time are required' })
    }
    const recurringEvents = loadData('sports_recurring_events')
    const event = {
      id: Date.now().toString(),
      label: label.trim(),
      type: type === 'game' ? 'game' : 'practice',
      weekdays,
      startTime,
      endTime,
      startDate: startDate || null,
      endDate: endDate || null,
      createdAt: new Date().toISOString(),
    }
    recurringEvents.push(event)
    saveData('sports_recurring_events', recurringEvents)
    res.json({ recurringEvent: event })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save recurring event' })
  }
})

router.delete('/recurring-events/:id', (req, res) => {
  const recurringEvents = loadData('sports_recurring_events')
  const remaining = recurringEvents.filter((e) => e.id !== req.params.id)
  saveData('sports_recurring_events', remaining)
  res.json({ success: true })
})

// Schedule: which kind of day each day of the week normally is -- practice,
// game, or off. Same single-settings-object pattern as Gym's week plan,
// just a type string per day instead of a routine id.
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
export const DEFAULT_SCHEDULE = Object.fromEntries(WEEKDAYS.map((day) => [day, null]))

router.get('/schedule', (req, res) => {
  const stored = loadData('sports_schedule', DEFAULT_SCHEDULE)
  res.json({ schedule: { ...DEFAULT_SCHEDULE, ...stored }, overrides: loadData('sports_schedule_overrides', {}) })
})

router.post('/schedule', (req, res) => {
  try {
    const body = req.body || {}
    const stored = loadData('sports_schedule', DEFAULT_SCHEDULE)
    const schedule = { ...DEFAULT_SCHEDULE, ...stored }
    for (const day of WEEKDAYS) {
      if (day in body) schedule[day] = body[day] || null
    }
    saveData('sports_schedule', schedule)
    res.json({ schedule })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save schedule' })
  }
})

// Per-date overrides: the recurring Mon-Sun template above is a single
// fixed shape that can never represent a real season, where a game gets
// rescheduled, a bye week happens, or an extra practice gets added on a
// day that's normally off -- Dylan's own "weekly schedule doesn't match
// reality" complaint. An override for one specific date takes priority
// over that date's weekday default without touching the recurring
// template at all; posting null/empty clears the override and reverts
// that date back to the normal weekday value.
router.post('/schedule/override', (req, res) => {
  try {
    const { date, type } = req.body || {}
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' })
    }
    const overrides = loadData('sports_schedule_overrides', {})
    if (type) {
      overrides[date] = type
    } else {
      delete overrides[date]
    }
    saveData('sports_schedule_overrides', overrides)
    res.json({ overrides })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save schedule override' })
  }
})

// Settings: which sport Dylan actually plays -- a single free-text field.
// Kept deliberately loose (not an enum) since "which sport" spans anything
// from football to swimming to something with no obvious built-in option,
// and Dylan told us directly the mode needs to actually know this.
router.get('/settings', (req, res) => {
  res.json({ settings: loadData('sports_settings', { sport: '' }) })
})

router.post('/settings', (req, res) => {
  try {
    const { sport } = req.body || {}
    const settings = { sport: (sport || '').trim() }
    saveData('sports_settings', settings)
    res.json({ settings })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save sport' })
  }
})

export default router
