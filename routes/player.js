import { Router } from 'express'
import { loadPlayerStats, awardXP } from '../lib/playerXP.js'

const router = Router()

router.get('/', (req, res) => {
  res.json(loadPlayerStats())
})

// `reason` is one of the fixed keys in lib/playerXP.js's own reward table
// -- the frontend says WHAT just happened, this file (not the client)
// decides how much that's worth. Called right alongside each existing
// celebration-toast trigger in useAppData.js, reusing the exact same
// "did this just complete" checks those already do, rather than a second,
// separate derivation of the same fact living in each backend route.
router.post('/award', (req, res) => {
  const { reason } = req.body
  try {
    const result = awardXP(reason)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
