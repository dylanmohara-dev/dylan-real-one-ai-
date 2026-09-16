import { useState } from 'react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A habit's current streak: consecutive days (counting back from today)
// that have a completion row. Stops at the first gap -- a habit done
// today, yesterday, and three days ago (missed one day) has a streak of 2,
// not 3, since the gap breaks it.
function currentStreak(completions, habitId) {
  const doneDates = new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date))
  let streak = 0
  for (let i = 0; ; i += 1) {
    const key = i === 0 ? todayKey() : daysAgoKey(i)
    if (!doneDates.has(key)) break
    streak += 1
  }
  return streak
}

// Same algorithm as routes/skills.js's computeMaxStreak() and
// StatsOverlay.jsx's longestStreakFromDateKeys() -- duplicated locally per
// this codebase's established convention rather than imported. Kept
// separate from currentStreak() so a badge-worthy run stays visible as
// "Best: N days" even after today breaks it -- this is the persistent,
// always-on target Dylan asked for instead of a number buried in a
// separate Stats overlay he has to go open.
function longestDailyStreak(completions, habitId) {
  const dates = Array.from(new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date))).sort()
  if (!dates.length) return 0
  let longest = 1
  let running = 1
  for (let i = 1; i < dates.length; i += 1) {
    const dayDiff = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000)
    running = dayDiff === 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }
  return longest
}

// Monday-anchored week key (the Monday of the week a given date falls in)
// -- every weekly-cadence computation below measures "this week" against
// this same anchor, so a habit checked off Sunday and Monday of the same
// calendar week both count toward one week's target, not two.
function weekStartKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diffToMonday)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftWeek(weekKey, deltaWeeks) {
  const [y, m, d] = weekKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaWeeks * 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function completionsInWeek(completions, habitId, weekKey) {
  return completions.filter((c) => c.habitId === habitId && weekStartKey(c.date) === weekKey).length
}

// The weekly-cadence equivalent of currentStreak(): consecutive weeks
// (counting back from the current week) that met timesPerWeek. The
// in-progress current week only counts once it has already hit target --
// it isn't a miss yet, it's just not finished, so it's skipped rather
// than breaking the streak while today is still happening.
function currentWeeklyStreak(completions, habitId, timesPerWeek) {
  let cursor = weekStartKey(todayKey())
  if (completionsInWeek(completions, habitId, cursor) < timesPerWeek) {
    cursor = shiftWeek(cursor, -1)
  }
  let streak = 0
  while (completionsInWeek(completions, habitId, cursor) >= timesPerWeek) {
    streak += 1
    cursor = shiftWeek(cursor, -1)
  }
  return streak
}

function longestWeeklyStreak(completions, habitId, timesPerWeek) {
  const byWeek = {}
  for (const c of completions) {
    if (c.habitId !== habitId) continue
    const wk = weekStartKey(c.date)
    byWeek[wk] = (byWeek[wk] || 0) + 1
  }
  const metWeeks = Object.keys(byWeek)
    .filter((wk) => byWeek[wk] >= timesPerWeek)
    .sort()
  if (!metWeeks.length) return 0
  let longest = 1
  let running = 1
  for (let i = 1; i < metWeeks.length; i += 1) {
    const weekDiff = Math.round((new Date(metWeeks[i]) - new Date(metWeeks[i - 1])) / (7 * 86400000))
    running = weekDiff === 1 ? running + 1 : 1
    longest = Math.max(longest, running)
  }
  return longest
}

function habitStats(habit, completions) {
  if (habit.frequency === 'weekly') {
    const target = habit.timesPerWeek || 3
    return {
      cadence: 'weekly',
      target,
      countThisWeek: completionsInWeek(completions, habit.id, weekStartKey(todayKey())),
      current: currentWeeklyStreak(completions, habit.id, target),
      best: longestWeeklyStreak(completions, habit.id, target),
    }
  }
  return {
    cadence: 'daily',
    current: currentStreak(completions, habit.id),
    best: longestDailyStreak(completions, habit.id),
  }
}

function HabitStatsLine({ stats }) {
  if (stats.cadence === 'weekly') {
    return (
      <div className="item-meta discipline-stats-line">
        <span>
          {stats.countThisWeek} / {stats.target} this week
        </span>
        {stats.current > 0 && <span>{stats.current} week streak</span>}
        <span className="discipline-best">
          Best: {stats.best} week{stats.best === 1 ? '' : 's'}
        </span>
      </div>
    )
  }
  return (
    <div className="item-meta discipline-stats-line">
      {stats.current > 0 && <span>{stats.current} day streak</span>}
      <span className="discipline-best">
        Best: {stats.best} day{stats.best === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function AddHabitForm({ saving, addHabit }) {
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [timesPerWeek, setTimesPerWeek] = useState(3)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    await addHabit(
      name,
      frequency === 'weekly' ? { frequency: 'weekly', timesPerWeek: Number(timesPerWeek) || 3 } : { frequency: 'daily' }
    )
    setName('')
    setFrequency('daily')
    setTimesPerWeek(3)
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="discipline-habit-input">New habit</label>
      <input
        id="discipline-habit-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. No phone before 9am"
      />
      <label htmlFor="discipline-frequency-select">How often</label>
      <select id="discipline-frequency-select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
        <option value="daily">Every day</option>
        <option value="weekly">A set number of times per week</option>
      </select>
      {frequency === 'weekly' && (
        <>
          <label htmlFor="discipline-times-input">Times per week</label>
          <input
            id="discipline-times-input"
            type="number"
            min="2"
            max="6"
            value={timesPerWeek}
            onChange={(e) => setTimesPerWeek(e.target.value)}
          />
        </>
      )}
      <button type="submit" disabled={saving || !name.trim()}>
        Add habit
      </button>
    </form>
  )
}

function FrequencyEditor({ habit, saving, updateDisciplineHabit }) {
  const isWeekly = habit.frequency === 'weekly'
  return (
    <div className="discipline-frequency-editor">
      <select
        className="category-select"
        value={isWeekly ? 'weekly' : 'daily'}
        disabled={saving}
        onChange={(e) => {
          if (e.target.value === 'weekly') {
            updateDisciplineHabit(habit.id, { frequency: 'weekly', timesPerWeek: habit.timesPerWeek || 3 })
          } else {
            updateDisciplineHabit(habit.id, { frequency: 'daily' })
          }
        }}
      >
        <option value="daily">Every day</option>
        <option value="weekly">Times/week</option>
      </select>
      {isWeekly && (
        <select
          className="category-select"
          value={habit.timesPerWeek || 3}
          disabled={saving}
          onChange={(e) => updateDisciplineHabit(habit.id, { timesPerWeek: Number(e.target.value) })}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}x/week
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export default function DisciplinePage({
  disciplineHabits,
  disciplineCompletions,
  saving,
  addDisciplineHabit,
  updateDisciplineHabit,
  deleteDisciplineHabit,
  toggleDisciplineCompletion,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')
  const activeHabits = disciplineHabits.filter((h) => h.active !== false)
  const doneToday = new Set(disciplineCompletions.filter((c) => c.date === todayKey()).map((c) => c.habitId))

  return (
    <div className="page discipline-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">DISCIPLINE MODE</span>
          <h1 className="serif">Discipline</h1>
          <p>A daily checklist -- every habit, on its own cadence.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="discipline" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">TODAY</span>
          <span className="gym-stat-value">
            {doneToday.size} / {activeHabits.length}
          </span>
        </div>
      </div>

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>
          Today
        </button>
        <button type="button" className={activeTab === 'habits' ? 'active' : ''} onClick={() => setActiveTab('habits')}>
          Habits
        </button>
      </div>

      {activeTab === 'today' && (
        <div className="items-list">
          {activeHabits.length === 0 && (
            <div className="empty-state">
              <div>&#9989;</div>
              <h3>No habits set</h3>
              <p>Add your first habit in the Habits tab.</p>
            </div>
          )}
          {activeHabits.map((habit) => {
            const done = doneToday.has(habit.id)
            const stats = habitStats(habit, disciplineCompletions)
            return (
              <div className="item-card" key={habit.id}>
                <div className="item-content">
                  <label className="discipline-checkbox-row">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={saving}
                      onChange={() => toggleDisciplineCompletion(habit.id, todayKey())}
                    />
                    <strong style={done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {habit.name}
                    </strong>
                  </label>
                  <HabitStatsLine stats={stats} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'habits' && (
        <>
          <AddHabitForm saving={saving} addHabit={addDisciplineHabit} />
          <div className="items-list">
            {disciplineHabits.length === 0 && (
              <div className="empty-state">
                <div>&#128203;</div>
                <h3>No habits yet</h3>
                <p>Add your first one above.</p>
              </div>
            )}
            {disciplineHabits.map((habit) => {
              const stats = habitStats(habit, disciplineCompletions)
              return (
                <div className="item-card" key={habit.id}>
                  <div className="item-content">
                    <strong style={habit.active === false ? { opacity: 0.5 } : undefined}>{habit.name}</strong>
                    <HabitStatsLine stats={stats} />
                    <FrequencyEditor habit={habit} saving={saving} updateDisciplineHabit={updateDisciplineHabit} />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => updateDisciplineHabit(habit.id, { active: habit.active === false })}
                    >
                      {habit.active === false ? 'Reactivate' : 'Archive'}
                    </button>
                  </div>
                  <button className="delete-button" onClick={() => deleteDisciplineHabit(habit.id)} aria-label={`Delete ${habit.name}`}>
                    &times;
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
