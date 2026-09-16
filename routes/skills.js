import express, { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { loadData, saveData, dataDirectory } from '../lib/dataStore.js'

const router = Router()

const STREAK_BADGES = [3, 7, 30, 100]
const LEVEL_BADGES = [5, 10, 25]

// Every logged session earns this much XP on top of its raw quantity.
// Without it, XP was pure quantity (1 unit = 1 xp), which unfairly
// punished any skill tracked by session count or small numbers ("guitar,
// 1 session" earned 1 xp) next to one tracked by volume ("pushups, 30
// reps" earned 30 xp for the same amount of real-world effort) -- this
// was Dylan's own "XP/level system doesn't feel rewarding" complaint,
// traced to the fact that reward depended on which unit he happened to
// type in, not on whether he showed up.
const BASE_SESSION_XP = 10

// Bare local YYYY-MM-DD -- NOT toISOString().slice(0, 10), which reads off
// UTC. On any machine west of UTC (all of the US, including wherever this
// server actually runs), that UTC-based version tags practice logged in
// the evening as tomorrow's date -- corrupting todayQuantity, streaks, and
// badge-threshold checks. This exact bug class is already documented and
// fixed once in routes/calendar.js's dayKey() (a goal due "2026-09-11"
// landed on the 10th under America/New_York) and is the same local-time
// convention every other date field in this app uses (health.js, the
// Discipline/Health/Gym/Sports/Reading/Family frontend helpers).
function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Level N requires 50*N xp to clear (so 1->2 needs 50, 2->3 needs 100 more,
// 3->4 needs 150 more, etc.) — a simple accelerating curve driven entirely
// by cumulative quantity logged, no separate "goal" concept needed.
function computeLevel(xp) {
  let level = 1
  let required = 50
  let remaining = Number(xp) || 0

  while (remaining >= required) {
    remaining -= required
    level += 1
    required = 50 * level
  }

  return { level, xpIntoLevel: remaining, xpForNextLevel: required }
}

// Total cumulative xp needed to have already cleared levels 1..targetLevel-1
// (i.e. the xp value at which computeLevel() first reports targetLevel).
// Kept as a sum over the same 50*N-per-level curve computeLevel() uses,
// rather than a separate formula, so the two can never disagree.
function xpRequiredThroughLevel(targetLevel) {
  let total = 0
  for (let n = 1; n < targetLevel; n++) total += 50 * n
  return total
}

function quantityByDate(sessions, skillId) {
  const totals = {}
  for (const session of sessions) {
    if (session.skillId !== skillId) continue
    totals[session.date] = (totals[session.date] || 0) + Number(session.quantity || 0)
  }
  return totals
}

function computeCurrentStreak(totals) {
  let cursor = new Date()
  const today = todayKey()
  if (!totals[today]) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (true) {
    // Same local-time key as todayKey() above -- the walking cursor must
    // use the identical convention or every day it checks (not just
    // "today") drifts by the UTC/local offset, same bug, same fix.
    const cy = cursor.getFullYear()
    const cm = String(cursor.getMonth() + 1).padStart(2, '0')
    const cd = String(cursor.getDate()).padStart(2, '0')
    const key = `${cy}-${cm}-${cd}`
    if (totals[key] > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// All-time longest run of consecutive logged days — kept separate from the
// current streak so a badge earned once (e.g. "7-day streak") never
// disappears just because today's streak later breaks.
function computeMaxStreak(totals) {
  const dates = Object.keys(totals).filter((date) => totals[date] > 0).sort()
  if (!dates.length) return 0

  let longest = 1
  let running = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    const dayDiff = Math.round((curr - prev) / 86400000)

    if (dayDiff === 1) {
      running += 1
    } else {
      running = 1
    }
    longest = Math.max(longest, running)
  }

  return longest
}

function computeBadges(level, maxStreak) {
  const badges = []
  for (const threshold of STREAK_BADGES) {
    if (maxStreak >= threshold) badges.push({ type: 'streak', threshold, label: `${threshold}-day streak` })
  }
  for (const threshold of LEVEL_BADGES) {
    if (level >= threshold) badges.push({ type: 'level', threshold, label: `Level ${threshold}` })
  }
  return badges
}

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

// A badge earned some day is motivating; a badge with no visible way to
// tell how close you are to the NEXT one just sits there. This is the
// other half of "XP/level system doesn't feel rewarding" -- badges were
// binary (earned or not), with nothing showing progress toward the next
// threshold the way the level XP bar already does.
function nextBadgeProgress(level, streak, xp) {
  const nextStreakThreshold = STREAK_BADGES.find((t) => t > streak) || null
  const nextLevelThreshold = LEVEL_BADGES.find((t) => t > level) || null
  return {
    streak: nextStreakThreshold
      ? { threshold: nextStreakThreshold, remainingDays: nextStreakThreshold - streak }
      : null,
    level: nextLevelThreshold
      ? { threshold: nextLevelThreshold, remainingXp: Math.max(0, xpRequiredThroughLevel(nextLevelThreshold) - (xp || 0)) }
      : null,
  }
}

function enrichSkill(skill, allSessions) {
  const sessions = allSessions
    .filter((s) => s.skillId === skill.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const totals = quantityByDate(allSessions, skill.id)
  const { level, xpIntoLevel, xpForNextLevel } = computeLevel(skill.xp || 0)
  const streak = computeCurrentStreak(totals)
  const maxStreak = computeMaxStreak(totals)

  return {
    ...skill,
    level,
    xpIntoLevel,
    xpForNextLevel,
    streak,
    maxStreak,
    todayQuantity: totals[todayKey()] || 0,
    badges: computeBadges(level, maxStreak),
    nextBadgeProgress: nextBadgeProgress(level, streak, skill.xp || 0),
    sessions: sessions.slice(0, 20),
    videos: skillVideos(skill.id),
  }
}

export function buildPayload() {
  const skills = loadData('skills')
  const sessions = loadData('skill_sessions')
  const active = skills.filter((s) => s.active)

  return {
    skills: active.map((skill) => enrichSkill(skill, sessions)),
  }
}

router.get('/', (req, res) => {
  res.json(buildPayload())
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
  // doesn't leave a permanent level/badge earned from a mistake.
  if (session) {
    const skills = loadData('skills')
    const skill = skills.find((s) => s.id === session.skillId)
    if (skill) {
      skill.xp = Math.max(0, (skill.xp || 0) - Number(session.quantity || 0) - BASE_SESSION_XP)
      saveData('skills', skills)
    }
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
