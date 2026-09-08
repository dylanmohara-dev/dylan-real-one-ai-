import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

const MAX_ACTIVE_SKILLS = 3
const STREAK_BADGES = [3, 7, 30, 100]
const LEVEL_BADGES = [5, 10, 25]

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
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
    const key = cursor.toISOString().slice(0, 10)
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
    sessions: sessions.slice(0, 20),
  }
}

function buildPayload() {
  const skills = loadData('skills')
  const sessions = loadData('skill_sessions')
  const active = skills.filter((s) => s.active)

  return {
    skills: active.map((skill) => enrichSkill(skill, sessions)),
    maxActiveSkills: MAX_ACTIVE_SKILLS,
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
    const activeCount = skills.filter((s) => s.active).length
    if (activeCount >= MAX_ACTIVE_SKILLS) {
      return res.status(400).json({
        error: `You're already tracking ${MAX_ACTIVE_SKILLS} skills. Remove one before adding another.`,
      })
    }

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
// session history and earned badges survive if it's ever re-added — but it
// frees up a slot in the active 3 immediately.
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

    skill.xp = (skill.xp || 0) + numericQuantity
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
      skill.xp = Math.max(0, (skill.xp || 0) - Number(session.quantity || 0))
      saveData('skills', skills)
    }
  }

  res.json(buildPayload())
})

export default router
