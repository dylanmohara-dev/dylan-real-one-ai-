import { loadData, saveData } from './dataStore.js'

// An app-wide "player level" -- separate from Skills mode's own per-skill
// leveling, which already existed. This one is a single meta-progress bar
// that goes up no matter which life area you're actually working in: a
// finished task, a logged habit, a closed-out assignment, all feed the
// same number. This is the concrete answer to "make the whole app feel
// more like a video game" rather than only the one mode that already had
// XP -- a single persistent number that reacts to everything you do here.
//
// Fixed, named reward amounts (not an arbitrary client-supplied number) --
// the whole table lives in exactly one place so it can't drift, and so a
// caller can only ever award a reason this file actually recognizes.
const XP_REWARDS = {
  'task-done': 10,
  'habit-done': 10,
  'assignment-done': 15,
  'test-logged': 20,
  'goal-complete': 30,
  'gym-pr': 25,
  'skill-levelup': 20,
  'skill-badge': 25,
  // School's Boss Battle payoff (SchoolPage.jsx) -- only fires on a
  // genuine 90%+ test grade (useAppData.js's setTestGrade), on top of the
  // flat test-logged award every test grade already gets.
  'boss-defeated': 40,
  // Finance mode's arcade pass -- rewards the DISCIPLINE of the act, never
  // the financial outcome. A trading psychology check-in pays the same
  // whether the mood logged is "disciplined" or "fomo" (same tier as
  // habit-done -- honesty about your own state is the behavior worth
  // reinforcing, not which state it happens to be). Closing a position
  // already requires a real lesson either way (useAppData.js's
  // closeTradingPosition); this is flat and separate from the existing
  // realized-gain achievement, which still only fires on an actual win --
  // a loss closed with a real lesson earns this same XP, intentionally,
  // so XP never rewards winning over honest record-keeping.
  'psychology-checkin': 10,
  'trade-closed': 15,
}

// Cumulative XP required to REACH a given level from level 1 -- quadratic,
// so each level costs a bit more than the last (level 2 costs 50, level 3
// costs another 100, level 4 another 150, ...). A closed-form total rather
// than a per-level lookup table, so there's no ceiling to run out of.
function xpThresholdForLevel(level) {
  if (level <= 1) return 0
  return 25 * level * (level - 1)
}

function levelFromXp(xp) {
  let level = 1
  while (xp >= xpThresholdForLevel(level + 1)) {
    level += 1
  }
  return level
}

function buildStatsPayload(xp) {
  const level = levelFromXp(xp)
  const levelStartXp = xpThresholdForLevel(level)
  const nextLevelXp = xpThresholdForLevel(level + 1)
  return {
    xp,
    level,
    xpIntoLevel: xp - levelStartXp,
    xpForNextLevel: nextLevelXp - levelStartXp,
  }
}

export function loadPlayerStats() {
  const state = loadData('player_stats', { xp: 0 })
  return buildStatsPayload(state.xp || 0)
}

// reason must be one of the keys above -- an unrecognized reason is a
// caller bug (a typo, a reason that was renamed on one side and not the
// other), not a value worth silently defaulting to zero and hiding.
export function awardXP(reason) {
  const amount = XP_REWARDS[reason]
  if (!amount) {
    throw new Error(`Unknown XP reason: ${reason}`)
  }

  const state = loadData('player_stats', { xp: 0 })
  const previousLevel = levelFromXp(state.xp || 0)
  const nextXp = (state.xp || 0) + amount
  saveData('player_stats', { xp: nextXp })

  const stats = buildStatsPayload(nextXp)
  return {
    ...stats,
    awarded: amount,
    leveledUp: stats.level > previousLevel,
    previousLevel,
  }
}
