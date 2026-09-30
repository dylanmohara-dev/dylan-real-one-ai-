// Shared between SchoolPage.jsx (display) and useAppData.js (level-up
// detection) so both sides compute the exact same XP/level numbers from
// the exact same formula -- pulled out of SchoolPage.jsx rather than
// duplicated, which is how two copies of "the same" logic quietly drift
// apart over time.

// Grade weighting categories -- also used by classAverage in SchoolPage.jsx.
export const CATEGORY_WEIGHTS = { homework: 15, quiz: 25, test: 50, project: 10 }

export function itemCategory(item, fallback) {
  return CATEGORY_WEIGHTS[item.category] ? item.category : fallback
}

// Per-class "quest" progression -- separate from the app-wide player level
// (TopSettingsBar, lib/playerXP.js) and from Skills mode's own per-skill
// leveling (routes/skills.js), but deliberately built on the exact same
// accelerating curve (50*N xp per level) and the exact same consecutive-day
// streak walk Skills mode already uses -- so "Level III" or a "5-day streak"
// means the same amount of real effort everywhere in the app, not a third,
// School-only formula. XP is earned only from real completed work, weighted
// like CATEGORY_WEIGHTS above so a test is worth more than a worksheet --
// never a decorative number with nothing behind it.
export const QUEST_XP = { homework: 10, quiz: 15, test: 30, project: 20 }

export function xpForCategory(item, fallback) {
  return QUEST_XP[itemCategory(item, fallback)] ?? QUEST_XP.homework
}

export function computeClassLevel(xp) {
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

// `canvasCompletions` is the local-only "mark done" layer for Canvas-synced
// assignments (routes/canvasCompletions.js / data/canvas_completions.json).
// Canvas items themselves stay read-only against the real Canvas API and
// Dylan's real grade there (his own explicit call from an earlier session)
// -- this is a SEPARATE, denormalized completion record keyed by Canvas's
// own assignment id, storing just enough (classId, category, completed) to
// award quest XP the same way a native assignment/test does, without ever
// writing back to Canvas or needing a live cross-reference against
// useCanvas()'s fetched list. Optional and defaults to {} so every existing
// call site (before Canvas completions existed) keeps working unchanged.
export function classXP(classId, assignments, tests, canvasCompletions = {}) {
  const homeworkXp = assignments
    .filter((a) => a.classId === classId && a.completed)
    .map((a) => xpForCategory(a, 'homework'))
  const testXp = tests
    .filter((t) => t.classId === classId && t.completed)
    .map((t) => xpForCategory(t, 'test'))
  const canvasXp = Object.values(canvasCompletions || {})
    .filter((c) => c.classId === classId && c.completed)
    .map((c) => xpForCategory(c, 'homework'))
  return [...homeworkXp, ...testXp, ...canvasXp].reduce((sum, xp) => sum + xp, 0)
}

// Aggregate across every class -- School's own overall level, distinct
// from any single class's level and from the app-wide player level
// (TopSettingsBar/lib/playerXP.js).
export function schoolTotalXP(classes, assignments, tests, canvasCompletions = {}) {
  return classes.reduce((sum, c) => sum + classXP(c.id, assignments, tests, canvasCompletions), 0)
}

// Dylan's ask: "get good while getting better at school with videogames
// with rewards to unlock more things in the app." School's Overall
// Academic Progress level (above) already exists and already goes up from
// real completed work -- these are the rank titles/trophies that unlock as
// that level climbs, using the SAME level number that's already on screen
// rather than inventing a second, parallel progress system to track.
// Thresholds are on School's overall level (schoolTotalXP -> computeClassLevel),
// not any one class's level, so this is genuinely about the whole academic
// picture, not maxing a single easy class.
// Renamed from the original Freshman/Rising Scholar/Honor Student/Dean's
// Circle/Valedictorian Track set at Dylan's own request: those read like
// school-grade labels (literal class-standing/GPA-hierarchy terms), and he
// wanted tier names that read as PROGRESS instead -- the same arc as
// building something, not a transcript. Keeping the exact same 5
// thresholds (1/3/6/10/15) and `key`s used elsewhere (unlockedTierKeys
// persistence, rankForLevel/unlockedTiersForLevel, SchoolPage's Trophy
// Case) -- only the player-facing title/subtitle changed, so nothing about
// how ranks are earned or stored changes, just what they're called.
export const RANK_TIERS = [
  { key: 'freshman', minLevel: 1, title: 'Foundation', subtitle: 'Every real result starts with one rep.' },
  { key: 'rising-scholar', minLevel: 3, title: 'Momentum', subtitle: "Consistency is starting to compound." },
  { key: 'honor-student', minLevel: 6, title: 'Operator', subtitle: 'This is what a real work ethic looks like.' },
  { key: 'deans-circle', minLevel: 10, title: 'Breakout', subtitle: 'Top-tier consistency -- real separation from the pack.' },
  { key: 'valedictorian-track', minLevel: 15, title: 'Compounding', subtitle: "You're not just doing the work -- you're stacking returns on it." },
]

// The single tier a given level currently sits in (highest threshold met).
export function rankForLevel(level) {
  let current = RANK_TIERS[0]
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel) current = tier
  }
  return current
}

// Every tier whose threshold a level has met -- used to figure out which
// tiers are actually unlocked (as opposed to just the current one), since
// unlocking Dean's Circle should keep Freshman/Rising Scholar/Honor
// Student unlocked too, not replace them.
export function unlockedTiersForLevel(level) {
  return RANK_TIERS.filter((tier) => level >= tier.minLevel)
}
