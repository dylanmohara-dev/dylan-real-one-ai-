import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const router = Router()

// Session 38 round 2: Dylan's real School hero photo was a raw, unresized
// ~1.1MB upload -- fine to store, but genuinely expensive to animate. Both
// the zoom-transition's blur+3D-transform pass (ZoomTransition.jsx /
// App.css's ZOOM TRANSITION section) and Overview's Ken Burns pan have to
// decode and repaint that full-resolution image every single frame, which
// is very likely the real cause of "School feels laggy when I switch to
// it" -- every other mode has no real photo set at all (their hero_images
// entries are tiny placeholders), so nothing else pays this cost. Fixed at
// the upload boundary so it can't happen again for any mode: every photo
// is downsized to a sane max dimension and re-compressed before it's ever
// stored, via ImageMagick's `convert` (already on this Mac -- same
// no-new-dependency approach session 26 used for the PWA icons, no npm
// install / native module needed).
function resizeHeroPhoto(dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl)
  if (!match) return dataUrl // not a data URL shape we recognize -- caller already validated the prefix, but fail safe rather than throw
  const id = randomUUID()
  const inputPath = `${tmpdir()}/hero-in-${id}`
  const outputPath = `${tmpdir()}/hero-out-${id}.jpg`
  try {
    writeFileSync(inputPath, Buffer.from(match[1], 'base64'))
    // 1920px on the long edge is more than enough for a full-bleed
    // background on any real screen. The trailing ">" means "only shrink,
    // never upscale" -- a smaller source photo is left alone. Re-encoded
    // as JPEG @ 80 regardless of the source format: this is a decorative
    // background image, not something that needs lossless fidelity or an
    // alpha channel.
    execFileSync('convert', [inputPath, '-auto-orient', '-resize', '1920x1920>', '-quality', '80', outputPath])
    const resized = readFileSync(outputPath)
    return `data:image/jpeg;base64,${resized.toString('base64')}`
  } catch (error) {
    console.error('Hero photo resize failed -- storing the original upload instead:', error.message)
    return dataUrl
  } finally {
    try { unlinkSync(inputPath) } catch { /* best-effort cleanup */ }
    try { unlinkSync(outputPath) } catch { /* best-effort cleanup */ }
  }
}

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
    stored[key] = resizeHeroPhoto(dataUrl)
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
