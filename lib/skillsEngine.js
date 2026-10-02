// Shared skill-progression math, used by both routes/skills.js (the UI's
// data) and routes/chat.js ("The Mentor"'s live context) -- same reasoning
// as lib/marketData.js / lib/technicals.js being shared between
// routes/trading.js and the Finance mentor: one source of truth so the
// chat can never report a level/streak/quest state that disagrees with
// what the page itself shows.

export const STREAK_BADGES = [3, 7, 30, 100]
export const LEVEL_BADGES = [5, 10, 25]

// Every logged session earns this much XP on top of its raw quantity.
// Without it, XP was pure quantity (1 unit = 1 xp), which unfairly
// punished any skill tracked by session count or small numbers ("guitar,
// 1 session" earned 1 xp) next to one tracked by volume ("pushups, 30
// reps" earned 30 xp for the same amount of real-world effort).
export const BASE_SESSION_XP = 10

// Mastery tier is a cosmetic rank on top of the raw level number -- the
// same "character class progression" feel as an RPG rank, so Dylan sees
// "Adept" instead of just a number climbing. Thresholds line up with the
// existing LEVEL_BADGES (5/10/25) plus a top tier above the highest badge.
export const MASTERY_TIERS = [
  { min: 1, max: 4, label: 'Novice' },
  { min: 5, max: 9, label: 'Apprentice' },
  { min: 10, max: 24, label: 'Adept' },
  { min: 25, max: 49, label: 'Expert' },
  { min: 50, max: Infinity, label: 'Master' },
]

export function masteryTier(level) {
  return MASTERY_TIERS.find((tier) => level >= tier.min && level <= tier.max)?.label || 'Novice'
}

// Bare local YYYY-MM-DD -- NOT toISOString().slice(0, 10), which reads off
// UTC and corrupts todayQuantity/streaks/quest-week math on any machine
// west of UTC. Same convention as routes/skills.js's original todayKey()
// and every other date field in this app.
export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Level N requires 50*N xp to clear (1->2 needs 50, 2->3 needs 100 more,
// etc.) -- a simple accelerating curve driven entirely by cumulative
// quantity logged, no separate "goal" concept needed.
export function computeLevel(xp) {
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
export function xpRequiredThroughLevel(targetLevel) {
  let total = 0
  for (let n = 1; n < targetLevel; n++) total += 50 * n
  return total
}

export function quantityByDate(sessions, skillId) {
  const totals = {}
  for (const session of sessions) {
    if (session.skillId !== skillId) continue
    totals[session.date] = (totals[session.date] || 0) + Number(session.quantity || 0)
  }
  return totals
}

export function computeCurrentStreak(totals) {
  let cursor = new Date()
  const today = todayKey()
  if (!totals[today]) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (true) {
    const key = todayKey(cursor)
    if (totals[key] > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// All-time longest run of consecutive logged days -- kept separate from the
// current streak so a badge earned once (e.g. "7-day streak") never
// disappears just because today's streak later breaks.
export function computeMaxStreak(totals) {
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

export function computeBadges(level, maxStreak) {
  const badges = []
  for (const threshold of STREAK_BADGES) {
    if (maxStreak >= threshold) badges.push({ type: 'streak', threshold, label: `${threshold}-day streak` })
  }
  for (const threshold of LEVEL_BADGES) {
    if (level >= threshold) badges.push({ type: 'level', threshold, label: `Level ${threshold}` })
  }
  return badges
}

// A badge earned some day is motivating; a badge with no visible way to
// tell how close you are to the NEXT one just sits there.
export function nextBadgeProgress(level, streak, xp) {
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

export function enrichSkill(skill, allSessions, skillVideosFn) {
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
    tier: masteryTier(level),
    streak,
    maxStreak,
    todayQuantity: totals[todayKey()] || 0,
    badges: computeBadges(level, maxStreak),
    nextBadgeProgress: nextBadgeProgress(level, streak, skill.xp || 0),
    sessions: sessions.slice(0, 20),
    videos: skillVideosFn ? skillVideosFn(skill.id) : [],
  }
}

// Monday-start local week, so "this week" means the same thing a human
// calendar does rather than a rolling 7-day window that silently shifts
// its boundary every single day.
export function currentWeekBounds(now = new Date()) {
  const day = now.getDay() // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { weekStart: todayKey(monday), weekEnd: todayKey(sunday), weekKey: todayKey(monday) }
}

// Three weekly quests, entirely DERIVED from existing skills/sessions data
// -- no separate "claimed" state to persist. Completion is itself the
// signal: the frontend diffs quest.completed before/after an action
// (useAppData.js's detectSkillMilestones pattern) and fires the
// celebration + bonus XP exactly once, the moment it flips to true. A page
// reload mid-week just shows "completed", it never re-fires the toast --
// same reason badges don't re-fire on reload.
export function computeQuests(activeSkills, allSessions) {
  const { weekStart, weekEnd, weekKey } = currentWeekBounds()
  if (!activeSkills.length) return { weekKey, weekEnd, quests: [] }
  const weekSessions = allSessions.filter((s) => s.date >= weekStart && s.date <= weekEnd)

  const quests = []

  // 1. Variety -- only makes sense with 2+ skills being tracked.
  if (activeSkills.length >= 2) {
    const target = Math.min(3, activeSkills.length)
    const distinctSkillIds = new Set(weekSessions.map((s) => s.skillId))
    const progress = Math.min(target, distinctSkillIds.size)
    quests.push({
      id: 'variety',
      title: 'Cross-Train',
      description: `Log practice on ${target} different skills this week`,
      target,
      progress,
      completed: progress >= target,
      bonusXp: 30,
    })
  }

  // 2. Streak -- reach (or hold) a real streak, scaled to a reasonable
  // reach based on what Dylan's best current streak already is, so this
  // isn't trivially free for someone already at a 20-day streak nor
  // impossibly far for someone starting at 0.
  const bestCurrentStreak = Math.max(0, ...activeSkills.map((s) => s.streak || 0))
  const streakTarget = Math.max(5, Math.min(bestCurrentStreak + 2, 14))
  quests.push({
    id: 'streak',
    title: 'Stay In The Game',
    description: `Reach a ${streakTarget}-day streak on any one skill`,
    target: streakTarget,
    progress: Math.min(streakTarget, bestCurrentStreak),
    completed: bestCurrentStreak >= streakTarget,
    bonusXp: 40,
  })

  // 3. Volume -- raw effort this week, in XP terms (quantity + base-per-
  // session, same formula routes/skills.js awards on each log).
  const weekXp = weekSessions.reduce((sum, s) => sum + Number(s.quantity || 0) + BASE_SESSION_XP, 0)
  const volumeTarget = 150
  quests.push({
    id: 'volume',
    title: 'Put In The Reps',
    description: `Earn ${volumeTarget} XP from practice this week`,
    target: volumeTarget,
    progress: Math.min(volumeTarget, Math.round(weekXp)),
    completed: weekXp >= volumeTarget,
    bonusXp: 50,
  })

  return { weekKey, weekEnd, quests }
}

// Last `days` days of combined practice activity across every active
// skill, for the Mastery tab's consistency heatmap -- a GitHub-contribution
// -style calendar is one of the clearest "game feel" signals there is:
// showing up every day visibly fills in a grid.
export function buildHeatmap(allSessions, days = 84) {
  const totals = {}
  for (const session of allSessions) {
    totals[session.date] = (totals[session.date] || 0) + Number(session.quantity || 0) + BASE_SESSION_XP
  }

  const cells = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor)
    d.setDate(cursor.getDate() - i)
    const key = todayKey(d)
    cells.push({ date: key, xp: totals[key] || 0 })
  }
  return cells
}
