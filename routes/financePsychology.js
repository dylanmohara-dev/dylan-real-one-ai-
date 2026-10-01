import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// A fixed, real self-report vocabulary -- Dylan picks the word that
// describes his own state. Never AI-inferred, never derived from market
// moves or position P/L (that would be guessing at his mental state from
// a number, which is exactly the kind of fabricated "insight" this whole
// Finance rebuild has been about avoiding).
export const MOOD_OPTIONS = ['disciplined', 'confident', 'calm', 'anxious', 'fomo', 'impulsive', 'frustrated', 'fearful']

router.get('/', (req, res) => {
  res.json({ checkins: loadData('finance_psychology_checkins'), moodOptions: MOOD_OPTIONS })
})

router.post('/', (req, res) => {
  try {
    const { mood, note } = req.body
    if (!mood || !MOOD_OPTIONS.includes(mood.toString().trim().toLowerCase())) {
      return res.status(400).json({ error: 'mood must be one of: ' + MOOD_OPTIONS.join(', ') })
    }
    const checkins = loadData('finance_psychology_checkins')
    const checkin = {
      id: Date.now().toString(),
      mood: mood.toString().trim().toLowerCase(),
      note: note?.toString().trim() || '',
      createdAt: new Date().toISOString(),
    }
    checkins.push(checkin)
    saveData('finance_psychology_checkins', checkins)
    res.json({ checkin, checkins })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save check-in' })
  }
})

router.delete('/:id', (req, res) => {
  const checkins = loadData('finance_psychology_checkins')
  const remaining = checkins.filter((checkin) => checkin.id !== req.params.id)
  saveData('finance_psychology_checkins', remaining)
  res.json({ success: true, checkins: remaining })
})

export default router
