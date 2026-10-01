import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Dylan's own trade notes -- his words, written when he wants to write
// them. Distinct from the app's separate, passcode-encrypted personal
// Journal mode (routes/journal.js) -- this is scoped to Finance/Trading
// only and stored unencrypted like the rest of the trading data (positions,
// watchlist). Not a diary; a trade log. Optionally tagged to a ticker so an
// entry can be tied to a specific position/watchlist idea, but the ticker
// is free text Dylan types, never auto-filled from a "signal."
router.get('/', (req, res) => {
  res.json({ entries: loadData('finance_trade_journal') })
})

router.post('/', (req, res) => {
  try {
    const { text, ticker } = req.body
    if (!text?.toString().trim()) {
      return res.status(400).json({ error: 'Journal entry text is required' })
    }
    const entries = loadData('finance_trade_journal')
    const entry = {
      id: Date.now().toString(),
      text: text.toString().trim(),
      ticker: ticker?.toString().trim().toUpperCase() || null,
      createdAt: new Date().toISOString(),
    }
    entries.push(entry)
    saveData('finance_trade_journal', entries)
    res.json({ entry, entries })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save journal entry' })
  }
})

router.delete('/:id', (req, res) => {
  const entries = loadData('finance_trade_journal')
  const remaining = entries.filter((entry) => entry.id !== req.params.id)
  saveData('finance_trade_journal', remaining)
  res.json({ success: true, entries: remaining })
})

export default router
