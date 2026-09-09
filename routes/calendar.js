import { Router } from 'express'
import fs from 'fs'
import { connect, listUpcomingEvents, isConnected, clearCredentials } from '../lib/appleCalendar.js'

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

export default router
