import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Overview keeps its existing hardcoded default (the exact reference photo
// Dylan picked, session 37 round 3) -- everything here is additive, not a
// replacement for that. A mode with nothing in hero_images.json just has
// no photo yet, which every reader below (bootstrap, the frontend hero
// components, ZoomTransition) already treats as "render like before, no
// hero" rather than an error.
const HERO_KEYS = ['overview', 'school', 'sports', 'gym', 'health', 'finance', 'skills', 'reading', 'mind', 'family']

export function getHeroImages() {
  const stored = loadData('hero_images', {})
  return { overview: '/hero-office-view.jpg', ...stored }
}

router.get('/hero-images', (req, res) => {
  res.json({ heroImages: getHeroImages() })
})

router.put('/hero-images/:key', (req, res) => {
  try {
    const { key } = req.params
    const { dataUrl } = req.body

    if (!HERO_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown life area "${key}".` })
    }
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Expected an image file.' })
    }
    // A data URL runs ~33% bigger than the raw image bytes it encodes.
    // dataStore.js reads/writes hero_images.json whole on every call --
    // this cap keeps one huge, unresized phone photo from turning that
    // into a real, felt slowdown on every single load/save anywhere in
    // the app, not just this one photo.
    if (dataUrl.length > 6_000_000) {
      return res.status(400).json({ error: 'That image is too large -- please use one under about 4MB.' })
    }

    const stored = loadData('hero_images', {})
    stored[key] = dataUrl
    saveData('hero_images', stored)
    res.json({ heroImages: getHeroImages() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save that photo.' })
  }
})

router.delete('/hero-images/:key', (req, res) => {
  try {
    const { key } = req.params
    if (!HERO_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown life area "${key}".` })
    }
    const stored = loadData('hero_images', {})
    delete stored[key]
    saveData('hero_images', stored)
    res.json({ heroImages: getHeroImages() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not reset that photo.' })
  }
})

export default router
