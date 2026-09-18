import { Router } from 'express'
import {
  verifyAndSaveCredentials,
  getUpcomingAssignments,
  getActiveCourses,
  isConnected,
  clearCredentials,
} from '../lib/canvas.js'
import { syncCalendarEvent } from '../lib/calendarAutoSync.js'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Canvas needs no developer credentials (no client_id/secret in .env) --
// "configured" is always true so the Connections page goes straight to the
// domain+token form instead of a "not set up" message like the OAuth cards.
router.get('/status', (req, res) => {
  res.json({ configured: true, connected: isConnected() })
})

router.post('/connect', async (req, res) => {
  try {
    const { domain, token } = req.body
    const result = await verifyAndSaveCredentials(domain, token)
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/assignments', async (req, res) => {
  try {
    const assignments = await getUpcomingAssignments()
    res.json({ assignments })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/courses', async (req, res) => {
  try {
    const courses = await getActiveCourses()
    res.json({ courses })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Best-effort push of upcoming Canvas due dates onto the real "Dylan AI"
// iCloud calendar -- same bridge routes/assignments.js already uses for
// manually entered school assignments, so a Canvas deadline shows up next
// to everything else Dylan already sees on his phone's calendar. Links are
// keyed by Canvas assignment id and persisted so a repeat sync UPDATES the
// same real event instead of creating a duplicate every time it runs.
router.post('/sync-calendar', async (req, res) => {
  try {
    const assignments = await getUpcomingAssignments()
    const links = loadData('canvas_calendar_links', {})
    let synced = 0
    for (const item of assignments) {
      const date = item.dueAt ? item.dueAt.slice(0, 10) : null
      if (!date) continue
      const record = links[item.id] ? { ...links[item.id] } : {}
      await syncCalendarEvent(record, {
        title: `${item.title} (${item.courseName})`,
        date,
        mode: 'school',
      })
      if (record.calendarEventUrl) {
        links[item.id] = record
        synced += 1
      }
    }
    saveData('canvas_calendar_links', links)
    res.json({ success: true, synced })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/disconnect', (req, res) => {
  clearCredentials()
  res.json({ success: true })
})

export default router
