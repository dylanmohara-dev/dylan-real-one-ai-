import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { generateSalt, deriveKey, encrypt, decrypt } from '../lib/journalCrypto.js'

const router = Router()

const VERIFIER_TEXT = 'dylan-ai-journal-unlock-check'

// The derived encryption key lives ONLY in memory, for the life of this
// server process. It is never written to disk. Restarting the server,
// or calling /lock, forgets it — that is the point.
let sessionKey = null

function loadMeta() {
  const rows = loadData('journal_meta')
  return rows[0] || null
}

function saveMeta(meta) {
  saveData('journal_meta', [meta])
}

router.get('/status', (req, res) => {
  const meta = loadMeta()
  res.json({ hasPasscode: Boolean(meta), unlocked: Boolean(sessionKey) })
})

router.post('/setup', (req, res) => {
  const { passcode } = req.body

  if (!passcode || passcode.length < 6) {
    return res.status(400).json({ error: 'Passcode must be at least 6 characters.' })
  }

  if (loadMeta()) {
    return res.status(400).json({ error: 'A passcode is already set for this journal.' })
  }

  const salt = generateSalt()
  const key = deriveKey(passcode, salt)
  const verifier = encrypt(VERIFIER_TEXT, key)

  saveMeta({ salt, verifier })
  sessionKey = key

  res.json({ success: true })
})

router.post('/unlock', (req, res) => {
  const { passcode } = req.body
  const meta = loadMeta()

  if (!meta) {
    return res.status(400).json({ error: 'No passcode has been set up yet.' })
  }

  try {
    const key = deriveKey(passcode || '', meta.salt)
    const check = decrypt(meta.verifier, key)

    if (check !== VERIFIER_TEXT) {
      throw new Error('Passcode did not match.')
    }

    sessionKey = key
    res.json({ success: true })
  } catch {
    res.status(401).json({ error: 'Incorrect passcode.' })
  }
})

router.post('/lock', (req, res) => {
  sessionKey = null
  res.json({ success: true })
})

router.get('/entries', (req, res) => {
  if (!sessionKey) {
    return res.status(401).json({ error: 'Journal is locked.' })
  }

  try {
    const rows = loadData('journal')
    const entries = rows
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        content: decrypt(row.encrypted, sessionKey),
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    res.json({ entries })
  } catch (error) {
    console.error('Journal decrypt failed:', error)
    res.status(500).json({ error: 'Could not read journal entries.' })
  }
})

router.post('/entries', (req, res) => {
  if (!sessionKey) {
    return res.status(401).json({ error: 'Journal is locked.' })
  }

  const { content } = req.body

  if (!content?.trim()) {
    return res.status(400).json({ error: 'Entry content is required.' })
  }

  try {
    const rows = loadData('journal')
    const entry = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      encrypted: encrypt(content.trim(), sessionKey),
    }

    rows.push(entry)
    saveData('journal', rows)

    res.json({
      entry: { id: entry.id, createdAt: entry.createdAt, content: content.trim() },
    })
  } catch (error) {
    console.error('Journal save failed:', error)
    res.status(500).json({ error: 'Could not save journal entry.' })
  }
})

router.delete('/entries/:id', (req, res) => {
  if (!sessionKey) {
    return res.status(401).json({ error: 'Journal is locked.' })
  }

  const rows = loadData('journal')
  const remaining = rows.filter((row) => row.id !== req.params.id)
  saveData('journal', remaining)

  res.json({ success: true })
})

export default router
