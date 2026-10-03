import express, { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { loadData, saveData, dataDirectory } from '../lib/dataStore.js'
import { addToTrash } from '../lib/trashStore.js'
import { enrichSkill, computeQuests, buildHeatmap, todayKey, BASE_SESSION_XP } from '../lib/skillsEngine.js'

const router = Router()

const VIDEO_DIR = path.join(dataDirectory, 'skill_videos')
const MAX_VIDEO_BYTES = 150 * 1024 * 1024 // 150MB

const EXT_BY_MIME = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-m4v': '.m4v',
  'video/ogg': '.ogv',
}

function extensionFor(mimeType) {
  return EXT_BY_MIME[mimeType] || '.mp4'
}

function skillVideos(skillId) {
  const videos = loadData('skill_videos')
  return videos
    .filter((v) => v.skillId === skillId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(({ filePath, ...meta }) => meta) // never leak the on-disk path to the client
}

export function buildPayload() {
  const skills = loadData('skills')
  const sessions = loadData('skill_sessions')
  const active = skills.filter((s) => s.active)
  const enriched = active.map((skill) => enrichSkill(skill, sessions, skillVideos))

  const totalXp = enriched.reduce((sum, s) => sum + (Number(s.xp) || 0), 0)
  const { weekEnd, quests } = computeQuests(enriched, sessions)

  return {
    skills: enriched,
    quests,
    questsWeekEnd: weekEnd,
    totalXp,
    heatmap: buildHeatmap(sessions),
  }
}

router.get('/', (req, res) => {
  res.json(buildPayload())
})

// Full combined practice journal across every skill (active or not), newest
// first, enriched with the skill's own name/unit so the Journal tab doesn't
// need a second lookup. Separate from the main payload's enrichSkill()
// sessions (capped at 20 per skill, for the Training Ground cards) --
// this is the uncapped, cross-skill view, fetched once when the Journal
// or Mastery tab is actually opened rather than on every bootstrap load.
router.get('/sessions', (req, res) => {
  const skills = loadData('skills')
  const sessions = loadData('skill_sessions')
  const skillById = new Map(skills.map((s) => [s.id, s]))

  const journal = sessions
    .map((session) => {
      const skill = skillById.get(session.skillId)
      return {
        ...session,
        skillName: skill?.name || 'Deleted skill',
        unit: skill?.unit || 'reps',
      }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  res.json({ sessions: journal })
})

router.post('/', (req, res) => {
  try {
    const { name, unit } = req.body
    const trimmedName = name?.toString().trim()
    if (!trimmedName) return res.status(400).json({ error: 'name is required' })

    const trimmedUnit = (unit?.toString().trim() || 'reps').toLowerCase()

    const skills = loadData('skills')

    const duplicate = skills.find(
      (s) => s.active && s.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (duplicate) return res.status(400).json({ error: 'Already tracking a skill with that name' })

    const skill = {
      id: Date.now().toString(),
      name: trimmedName,
      unit: trimmedUnit,
      xp: 0,
      active: true,
      createdAt: new Date().toISOString(),
    }
    skills.push(skill)
    saveData('skills', skills)

    res.json(buildPayload())
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not add skill' })
  }
})

// Removing a skill deactivates it rather than deleting it outright, so its
// session history and earned badges survive if it's ever re-added. Skills
// has been uncapped since Session 6 -- there is no fixed slot count to
// free up here anymore.
router.delete('/:id', (req, res) => {
  const skills = loadData('skills')
  const skill = skills.find((item) => item.id === req.params.id)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })

  skill.active = false
  saveData('skills', skills)
  res.json(buildPayload())
})

router.post('/sessions', (req, res) => {
  try {
    const skills = loadData('skills')
    const active = skills.filter((s) => s.active)
    if (!active.length) return res.status(400).json({ error: 'No active skills to log practice against' })

    const { skillId, quantity, note } = req.body
    const numericQuantity = Number(quantity)
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number' })
    }

    const skill = active.find((s) => s.id === skillId)
    if (!skill) return res.status(400).json({ error: 'skillId must match one of the active skills' })

    const sessions = loadData('skill_sessions')
    sessions.push({
      id: Date.now().toString(),
      skillId: skill.id,
      quantity: numericQuantity,
      note: (note || '').toString().trim(),
      date: todayKey(),
      createdAt: new Date().toISOString(),
    })
    saveData('skill_sessions', sessions)

    skill.xp = (skill.xp || 0) + numericQuantity + BASE_SESSION_XP
    saveData('skills', skills)

    res.json(buildPayload())
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not log practice' })
  }
})

router.delete('/sessions/:id', (req, res) => {
  const sessions = loadData('skill_sessions')
  const session = sessions.find((s) => s.id === req.params.id)
  const remaining = sessions.filter((s) => s.id !== req.params.id)
  saveData('skill_sessions', remaining)

  // Undo the XP that session contributed, so deleting a bad log entry
  // doesn't leave a permanent level/badge earned from a mistake. The exact
  // amount actually removed (xpDelta, which can be less than
  // quantity+BASE_SESSION_XP if the floor at 0 clamped it) is captured
  // into the trash snapshot below, so a restore adds back exactly what
  // was taken -- not a recomputed guess that could overshoot past the
  // clamp.
  if (session) {
    const skills = loadData('skills')
    const skill = skills.find((s) => s.id === session.skillId)
    let xpDelta = 0
    if (skill) {
      const beforeXp = skill.xp || 0
      skill.xp = Math.max(0, beforeXp - Number(session.quantity || 0) - BASE_SESSION_XP)
      xpDelta = beforeXp - skill.xp
      saveData('skills', skills)
    }
    addToTrash({
      mode: 'skills',
      kind: 'skill-session',
      label: `${session.quantity} ${skill?.unit || 'reps'} logged`,
      snapshot: { session, skillId: session.skillId, xpDelta },
    })
  }

  res.json(buildPayload())
})

// Raw-body upload — no multer needed, Express parses the video bytes
// directly. The label travels as a query param since the body is pure
// binary, not multipart or JSON.
router.post(
  '/:id/videos',
  (req, res, next) => {
    // Only treat this route's body as raw video bytes; every other route
    // keeps using express.json() from server.js.
    if (!req.is('video/*')) {
      return res.status(400).json({ error: 'Content-Type must be a video/* mime type' })
    }
    return express.raw({ type: 'video/*', limit: MAX_VIDEO_BYTES })(req, res, next)
  },
  (req, res) => {
    try {
      const skills = loadData('skills')
      const skill = skills.find((s) => s.id === req.params.id && s.active)
      if (!skill) return res.status(404).json({ error: 'Skill not found' })

      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'No video data received' })
      }

      const label = (req.query.label || '').toString().trim() || 'Untitled clip'
      const mimeType = req.headers['content-type']
      const ext = extensionFor(mimeType)
      const id = Date.now().toString()

      const skillDir = path.join(VIDEO_DIR, skill.id)
      fs.mkdirSync(skillDir, { recursive: true })
      const fileName = `${id}${ext}`
      const filePath = path.join(skillDir, fileName)
      fs.writeFileSync(filePath, req.body)

      const videos = loadData('skill_videos')
      videos.push({
        id,
        skillId: skill.id,
        label,
        mimeType,
        bytes: req.body.length,
        fileName,
        filePath,
        createdAt: new Date().toISOString(),
      })
      saveData('skill_videos', videos)

      res.json(buildPayload())
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Could not save video' })
    }
  }
)

router.get('/videos/:videoId/file', (req, res) => {
  const videos = loadData('skill_videos')
  const video = videos.find((v) => v.id === req.params.videoId)
  if (!video || !fs.existsSync(video.filePath)) {
    return res.status(404).json({ error: 'Video not found' })
  }
  res.setHeader('Content-Type', video.mimeType || 'video/mp4')
  fs.createReadStream(video.filePath).pipe(res)
})

router.delete('/videos/:videoId', (req, res) => {
  const videos = loadData('skill_videos')
  const video = videos.find((v) => v.id === req.params.videoId)
  const remaining = videos.filter((v) => v.id !== req.params.videoId)
  saveData('skill_videos', remaining)

  if (video?.filePath && fs.existsSync(video.filePath)) {
    fs.unlinkSync(video.filePath)
  }

  res.json(buildPayload())
})

export default router
