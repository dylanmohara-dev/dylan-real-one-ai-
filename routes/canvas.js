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
import { isExcluded } from '../lib/canvasExclusions.js'

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
//
// Session 43 bugfix: the frontend already serializes its own calls
// (src/hooks/useCanvas.js), but that guard only covers one browser tab's
// JS runtime -- this server process can be hit by multiple tabs/devices at
// once, and two truly concurrent requests here would each loadData() the
// SAME pre-sync etags, race to PUT against iCloud, and the loser would hit
// a stale-etag conflict whose documented fallback is "create a new event"
// -- the exact mechanism that duplicated hundreds of real events onto
// Dylan's calendar over time. inFlight below serializes every caller
// through the one in-progress run instead of starting a second one, closing
// the race at the one place (this single Node process) every caller
// actually goes through, regardless of which tab or device sent it.
let inFlight = null
router.post('/sync-calendar', async (req, res) => {
  if (!inFlight) {
    inFlight = (async () => {
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
      return { success: true, synced }
    })().finally(() => {
      inFlight = null
    })
  }
  try {
    res.json(await inFlight)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Pulls Dylan's real Canvas course roster and reconciles it into the local
// `classes` list, so School's per-class pages have somewhere to file Canvas
// assignments under -- previously every Canvas assignment fell into a
// single flat "Coming up" bucket with no class of its own. Matching is
// deliberately conservative: only an EXACT (case/punctuation-insensitive)
// name match links to an existing class, since a wrong fuzzy match would
// silently file a real assignment under the wrong class. Anything that
// doesn't exactly match becomes a brand-new class named after the Canvas
// course -- a duplicate class Dylan can rename or delete himself is a far
// smaller problem than an assignment quietly attached to the wrong one.
// Safe to call repeatedly (idempotent): a course already linked via
// canvasCourseId is skipped every time after the first.
function normalizeClassName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

router.post('/sync-classes', async (req, res) => {
  try {
    const courses = await getActiveCourses()
    const classes = loadData('classes')
    let linked = 0
    let created = 0

    for (const course of courses) {
      const alreadyLinked = classes.some((c) => c.canvasCourseId === course.id)
      if (alreadyLinked) continue
      // Dylan deliberately deleted the class for this course -- don't
      // resurrect it just because it's still active in Canvas. See
      // lib/canvasExclusions.js for how a class gets on/off this list.
      if (isExcluded(course.id)) continue

      const courseNorm = normalizeClassName(course.name)
      const match = classes.find((c) => !c.canvasCourseId && normalizeClassName(c.name) === courseNorm)

      if (match) {
        match.canvasCourseId = course.id
        linked += 1
      } else {
        classes.push({
          id: `canvas-class-${course.id}`,
          name: course.name,
          level: 'regular',
          excludeFromGpa: false,
          canvasCourseId: course.id,
          createdAt: new Date().toISOString(),
        })
        created += 1
      }
    }

    saveData('classes', classes)
    res.json({ success: true, linked, created, classes })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/disconnect', (req, res) => {
  clearCredentials()
  res.json({ success: true })
})

export default router
