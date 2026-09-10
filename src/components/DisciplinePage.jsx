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

function AddHabitForm({ saving, addHabit }) {
  const [name, setName] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    await addHabit(name)
    setName('')
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
      <button type="submit" disabled={saving || !name.trim()}>
        Add habit
      </button>
    </form>
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
          <p>A daily checklist -- every habit, every day.</p>
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
            const streak = currentStreak(disciplineCompletions, habit.id)
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
                  {streak > 0 && (
                    <div className="item-meta">
                      <span>{streak} day streak</span>
                    </div>
                  )}
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
            {disciplineHabits.map((habit) => (
              <div className="item-card" key={habit.id}>
                <div className="item-content">
                  <strong style={habit.active === false ? { opacity: 0.5 } : undefined}>{habit.name}</strong>
                  <div className="item-meta">
                    <span>{currentStreak(disciplineCompletions, habit.id)} day streak</span>
                  </div>
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
            ))}
          </div>
        </>
      )}
    </div>
  )
}
