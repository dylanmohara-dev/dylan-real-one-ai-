import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

const DEFAULT_PROGRESS = { unlockedTierKeys: [] }

// Persists which School rank tiers (src/lib/schoolProgress.js RANK_TIERS)
// have already had their one-time "achievement unlocked" celebration --
// School's own level is always recomputable from real assignment/test
// data, but "has this tier's unlock moment already been shown" is state
// that has to live somewhere, or the same tier would re-celebrate on
// every reload.
router.get('/', (req, res) => {
  res.json(loadData('school_progress', DEFAULT_PROGRESS))
})

// `tierKey` must already be one of RANK_TIERS's own keys -- the frontend
// decides WHICH tier just got crossed (it has the level math), this route
// only appends it, idempotently, to the persisted set.
router.post('/unlock', (req, res) => {
  const { tierKey } = req.body
  if (!tierKey || typeof tierKey !== 'string') {
    return res.status(400).json({ error: 'tierKey is required' })
  }
  const current = loadData('school_progress', DEFAULT_PROGRESS)
  const unlockedTierKeys = current.unlockedTierKeys.includes(tierKey)
    ? current.unlockedTierKeys
    : [...current.unlockedTierKeys, tierKey]
  const next = { unlockedTierKeys }
  saveData('school_progress', next)
  res.json(next)
})

export default router
