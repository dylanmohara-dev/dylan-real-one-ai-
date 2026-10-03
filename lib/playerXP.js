import { loadData, saveData } from './dataStore.js'

// An app-wide "player level" -- separate from Skills mode's own per-skill
// leveling, which already existed. This one is a single meta-progress bar
// that goes up no matter which life area you're actually working in: a
// finished task, a logged habit, a closed-out assignment, all feed the
// same number. This is the concrete answer to "make the whole app feel
// more like a video game" rather than only the one mode that already had
// XP -- a single persistent number that reacts to everything you do here.
//
// Session 42 retune (Dylan's own complaint, verbatim: "I should be
// getting a level every day" + "I don't like the way you have the XP").
// Fortnite/GTA-style tiering: routine actions (a task, a habit) stay
// small, real achievements (a gym PR, a finished goal) spike hard -- the
// gap between smallest and largest reward roughly doubled from the old
// table (10/40 = 4x spread -> 8/75 = ~9.4x spread) so a big moment
// actually FEELS big next to routine upkeep, not just incrementally more.
//
// Fixed, named reward amounts (not an arbitrary client-supplied number) --
// the whole table lives in exactly one place so it can't drift, and so a
// caller can only ever award a reason this file actually recognizes.
const XP_REWARDS = {
  // Tier 1 -- routine upkeep, showing up. Small on purpose: these happen
  // multiple times a day and shouldn't carry the same weight as a real
  // accomplishment.
  'task-done': 8,
  'habit-done': 8,
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
  'psychology-checkin': 8,

  // Tier 2 -- a real logged outcome, not just a checkbox.
  'assignment-done': 15,
  'trade-closed': 15,
  'test-logged': 20,

  // Tier 3 -- an actual achievement: you got measurably better at
  // something, not just did the thing again.
  'skill-levelup': 25,
  'skill-badge': 30,
  'gym-pr': 35,
  'goal-complete': 45,

  // Tier 4 -- the signature "big moment". School's Boss Battle payoff
  // (SchoolPage.jsx) -- only fires on a genuine 90%+ test grade
  // (useAppData.js's setTestGrade), on top of the flat test-logged award
  // every test grade already gets. Deliberately the single biggest
  // reward in the table -- this is the one meant to feel like a jackpot.
  'boss-defeated': 75,
}

// Flat XP cost per level (Session 42 retune) -- replaces the old quadratic
// curve (25 * level * (level - 1)), which cost 50 XP for level 2 but 500
// XP for level 10 and kept climbing forever with no ceiling. That curve
// was the actual bug behind "I should be getting a level every day": a
// FIXED set of reward amounts against an EVER-GROWING level cost
// necessarily slows to a crawl no matter how consistent the real usage
// is -- it's structurally impossible to keep pace on a rising cost with a
// flat income. A flat cost keeps the relationship between "a normal day's
// real usage" and "a level" constant forever instead of decaying.
//
// 60 XP/level is calibrated against the Tier 1/2 rewards above: roughly
// 2 routine actions + 1 real logged outcome (8+8+15=31) is half a level;
// a day that also lands a single Tier 3 achievement (+25 to +45) clears a
// full level on its own; a Boss Battle (75) alone insta-levels. A quiet
// day with just one or two routine actions takes closer to 2 days --
// which is correct, not a bug: the pace should track real effort, not
// just elapsed time.
const FLAT_LEVEL_COST = 60

// Cumulative XP required to REACH a given level from level 1.
function xpThresholdForLevel(level) {
  if (level <= 1) return 0
  return FLAT_LEVEL_COST * (level - 1)
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
