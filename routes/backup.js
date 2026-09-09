import { Router } from 'express'
import { buildBackupPayload, backupFilename } from '../lib/backup.js'

const router = Router()

// One-click export. GET rather than POST on purpose — this makes it a
// plain link/window.location target too, not just fetch-and-blob, so it
// keeps working even if the frontend approach around it changes later.
router.get('/export', (req, res) => {
  try {
    const payload = buildBackupPayload()
    const filename = backupFilename()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.json(payload)
  } catch (error) {
    console.error('Backup export failed:', error)
    res.status(500).json({ error: error.message || 'Could not build backup.' })
  }
})

// Lightweight counts for the Settings UI, so Dylan sees what a backup
// would actually contain before downloading anything.
router.get('/summary', (req, res) => {
  try {
    const payload = buildBackupPayload()
    const counts = Object.fromEntries(
      Object.entries(payload.data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1])
    )
    res.json({ counts, excludedForSecurity: payload.excludedForSecurity, notes: payload.notes })
  } catch (error) {
    console.error('Backup summary failed:', error)
    res.status(500).json({ error: error.message || 'Could not summarize backup.' })
  }
})

export default router
