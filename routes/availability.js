import { Router } from 'express'
import { loadDataIfExists, saveData } from '../lib/dataStore.js'
import { DEFAULT_WORK_AVAILABILITY, validateWorkAvailability } from '../lib/scheduleCapacity.js'

const router = Router()

router.get('/', (req, res) => {
  const stored = loadDataIfExists('work_availability', DEFAULT_WORK_AVAILABILITY)
  try {
    res.json({ availability: validateWorkAvailability(stored) })
  } catch {
    // Preserve the existing record and surface no fabricated availability
    // if a hand-edited/legacy value is malformed.
    res.json({ availability: DEFAULT_WORK_AVAILABILITY, invalidStoredAvailability: true })
  }
})

router.put('/', (req, res) => {
  try {
    const availability = validateWorkAvailability(req.body)
    saveData('work_availability', availability)
    res.json({ availability })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Availability is invalid.' })
  }
})

export default router
