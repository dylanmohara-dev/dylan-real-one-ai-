import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'

const router = Router()

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
    const { date, type, durationMinutes, intensity, opponent, teamScore, opponentScore, result, notes } = req.body

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
      durationMinutes: Number(durationMinutes) || 0,
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

// Schedule: which kind of day each day of the week normally is -- practice,
// game, or off. Same single-settings-object pattern as Gym's week plan,
// just a type string per day instead of a routine id.
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DEFAULT_SCHEDULE = Object.fromEntries(WEEKDAYS.map((day) => [day, null]))

router.get('/schedule', (req, res) => {
  const stored = loadData('sports_schedule', DEFAULT_SCHEDULE)
  res.json({ schedule: { ...DEFAULT_SCHEDULE, ...stored } })
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
