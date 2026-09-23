import { Trophy, Flame, Dumbbell, Wallet, CheckCircle2, Sparkles } from 'lucide-react'

// A game-style "career stats" screen -- all-time bests and lifetime
// totals, pulled together from data every mode already tracks separately.
// Opened from the player level pill in the top bar. Everything here is
// computed live from the same raw arrays useAppData already loads, not a
// second parallel store to keep in sync -- if a number looks wrong, it's
// wrong in the same place the mode page itself would show it wrong.

// Same walk-forward longest-run algorithm as useAppData.js's own
// longestStreakFromDateKeys and routes/skills.js's computeMaxStreak --
// duplicated locally rather than imported, matching this codebase's
// existing convention of small local pure helpers per file (see
// MindPage.jsx / HealthPage.jsx, which already duplicate the
// current-streak version of this same algorithm independently).
function longestStreakFromDateKeys(dateKeys) {
  const sorted = Array.from(dateKeys).sort()
  if (!sorted.length) return 0
  let longest = 1
  let running = 1
  for (let i = 1; i < sorted.length; i += 1) {
    const dayDiff = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000)
    running = dayDiff === 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }
  return longest
}

function todayKeyForTimestamp(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Same Epley estimate useAppData's addGymLog uses to detect a live PR --
// counting lifetime PRs here with a different formula would make this
// screen's number disagree with what actually triggered a celebration.
function epley1RM(weight, reps) {
  if (!weight || !reps) return 0
  return weight * (1 + reps / 30)
}

function computeGymStats(gymExercises, gymLogs) {
  let lifetimePRs = 0
  const bestByExercise = []

  gymExercises.forEach((exercise) => {
    const logs = gymLogs
      .filter((log) => log.exerciseId === exercise.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    let bestWeight = 0
    let best1RM = 0
    logs.forEach((log) => {
      let hitPR = false
      ;(log.sets || []).forEach((set) => {
        const w = Number(set.weight) || 0
        const r = Number(set.reps) || 0
        if (w > bestWeight) {
          bestWeight = w
          hitPR = true
        }
        const est = epley1RM(w, r)
        if (est > best1RM) {
          best1RM = est
          hitPR = true
        }
      })
      if (hitPR && logs.indexOf(log) > 0) lifetimePRs += 1
    })

    if (bestWeight > 0) {
      bestByExercise.push({ name: exercise.name, bestWeight, best1RM: Math.round(best1RM) })
    }
  })

  bestByExercise.sort((a, b) => b.bestWeight - a.bestWeight)
  return { lifetimePRs, bestByExercise: bestByExercise.slice(0, 5) }
}

export default function StatsOverlay({
  open,
  onClose,
  playerStats,
  skills,
  mindHabits,
  mindCompletions,
  healthEntries,
  gymExercises,
  gymLogs,
  tasks,
  goals,
  assignments,
  tests,
  financeHistory,
  financeNetWorth,
}) {
  if (!open) return null

  const longestHabitStreak = (mindHabits || []).reduce((best, habit) => {
    const dates = new Set(
      (mindCompletions || []).filter((c) => c.habitId === habit.id).map((c) => c.date)
    )
    const longest = longestStreakFromDateKeys(dates)
    return longest > best.longest ? { longest, name: habit.name } : best
  }, { longest: 0, name: '' })

  const healthDates = new Set(
    (healthEntries || []).map((entry) => entry.date || todayKeyForTimestamp(entry.createdAt))
  )
  const longestHealthStreak = longestStreakFromDateKeys(healthDates)

  const bestSkill = (skills || []).reduce(
    (best, skill) => ((skill.maxStreak || 0) > (best.maxStreak || 0) ? skill : best),
    { maxStreak: 0, name: '' }
  )

  const { lifetimePRs, bestByExercise } = computeGymStats(gymExercises || [], gymLogs || [])

  const tasksCompleted = (tasks || []).filter((t) => t.completed).length
  const goalsCompleted = (goals || []).filter((g) => (g.progress || 0) >= 100).length
  const assignmentsCompleted = (assignments || []).filter((a) => a.completed).length
  const testsLogged = (tests || []).length

  const allTimeHighNetWorth = (financeHistory || []).reduce(
    (max, point) => Math.max(max, point.netWorth || 0),
    financeNetWorth || 0
  )

  return (
    <div className="stats-overlay-backdrop" onClick={onClose}>
      <div className="stats-overlay-panel" onClick={(event) => event.stopPropagation()}>
        <div className="stats-overlay-header">
          <div className="stats-overlay-title">
            <Trophy size={18} strokeWidth={2} />
            <span>Career Stats</span>
          </div>
          <button type="button" className="stats-overlay-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="stats-overlay-hero">
          <span className="stats-overlay-hero-level">Level {playerStats.level}</span>
          <span className="stats-overlay-hero-xp">
            {playerStats.xpIntoLevel} / {playerStats.xpForNextLevel} XP to next level
          </span>
        </div>

        <div className="stats-overlay-grid">
          <div className="stats-card">
            <Flame size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{longestHabitStreak.longest}</div>
            <div className="stats-card-label">
              Longest habit streak{longestHabitStreak.name ? ` — ${longestHabitStreak.name}` : ''}
            </div>
          </div>

          <div className="stats-card">
            <Flame size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{longestHealthStreak}</div>
            <div className="stats-card-label">Longest health-logging streak</div>
          </div>

          <div className="stats-card">
            <Sparkles size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{bestSkill.maxStreak || 0}</div>
            <div className="stats-card-label">
              Best skill streak{bestSkill.name ? ` — ${bestSkill.name}` : ''}
            </div>
          </div>

          <div className="stats-card">
            <Dumbbell size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{lifetimePRs}</div>
            <div className="stats-card-label">Lifetime gym PRs</div>
          </div>

          <div className="stats-card">
            <CheckCircle2 size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{tasksCompleted + assignmentsCompleted}</div>
            <div className="stats-card-label">Tasks + assignments completed</div>
          </div>

          <div className="stats-card">
            <Trophy size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">{goalsCompleted}</div>
            <div className="stats-card-label">Goals completed ({testsLogged} tests logged)</div>
          </div>

          <div className="stats-card">
            <Wallet size={18} strokeWidth={2} className="stats-card-icon" />
            <div className="stats-card-value">${Number(allTimeHighNetWorth).toLocaleString()}</div>
            <div className="stats-card-label">All-time high net worth</div>
          </div>
        </div>

        {bestByExercise.length > 0 && (
          <div className="stats-overlay-bests">
            <div className="stats-overlay-bests-title">Best lifts</div>
            {bestByExercise.map((exercise) => (
              <div key={exercise.name} className="stats-overlay-best-row">
                <span>{exercise.name}</span>
                <span>{exercise.bestWeight} lbs · ~{exercise.best1RM} 1RM</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
