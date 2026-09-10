import { useState } from 'react'
import { Bed, Utensils, Droplets, Footprints } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

const CATEGORY_META = {
  sleep: { label: 'Sleep', icon: Bed, placeholder: 'e.g. 7.5', unit: 'hours', numeric: true },
  food: { label: 'Food', icon: Utensils, placeholder: 'What did you eat?', numeric: false },
  water: { label: 'Water', icon: Droplets, placeholder: 'e.g. 4', unit: 'glasses', numeric: true },
  activity: { label: 'Activity', icon: Footprints, placeholder: 'e.g. 30', unit: 'min', numeric: true },
}

// Food is deliberately excluded here -- "what did you eat" isn't a single
// number to trend or set a goal against, the same way it always stayed a
// free-text field even before this pass.
const NUMERIC_CATEGORIES = Object.keys(CATEGORY_META).filter((category) => CATEGORY_META[category].numeric)

function todayKey() {
  return new Date().toDateString()
}

function QuickLogForm({ category, saving, addHealthEntry }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.toString().trim()
    if (!trimmed) return

    if (meta.numeric) {
      const amount = Number(trimmed)
      if (!amount || amount <= 0) return
      addHealthEntry(category, `${amount} ${meta.unit}`, '', amount)
    } else {
      addHealthEntry(category, trimmed)
    }
    setValue('')
  }

  return (
    <div className="form-card health-log-card">
      <div className="health-log-label">
        <Icon size={16} strokeWidth={2.25} />
        {meta.label}
        {meta.numeric && <span className="health-unit-hint">{meta.unit}</span>}
      </div>
      <input
        type={meta.numeric ? 'number' : 'text'}
        min={meta.numeric ? '0' : undefined}
        step={meta.numeric ? '0.5' : undefined}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder={meta.placeholder}
      />
      <button onClick={submit} disabled={saving || !value.toString().trim()}>
        Log
      </button>
    </div>
  )
}

function TrendsTab({ healthEntries, goals }) {
  const today = todayKey()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6) // today counts as day 1 of a 7-day window

  const stats = NUMERIC_CATEGORIES.map((category) => {
    const meta = CATEGORY_META[category]
    // Only entries that actually carry a real amount count here -- old
    // free-text entries (and any food entry) have none and are correctly
    // left out rather than silently treated as zero-but-logged.
    const categoryEntries = healthEntries.filter(
      (entry) => entry.category === category && typeof entry.amount === 'number'
    )
    const todayTotal = categoryEntries
      .filter((entry) => new Date(entry.createdAt).toDateString() === today)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const last7Total = categoryEntries
      .filter((entry) => new Date(entry.createdAt) >= sevenDaysAgo)
      .reduce((sum, entry) => sum + entry.amount, 0)

    return {
      category,
      meta,
      todayTotal,
      avgPerDay: last7Total / 7,
      goal: goals[category],
    }
  })

  return (
    <div className="health-trends">
      <div className="panel-heading">
        <h2>Today</h2>
      </div>
      <div className="gym-stats-row">
        {stats.map(({ category, meta, todayTotal, goal }) => (
          <div className="gym-stat-card" key={category}>
            <span className="gym-stat-label">{meta.label.toUpperCase()}</span>
            <span className="gym-stat-value">
              {todayTotal || 0} {meta.unit}
              {goal ? <span className="health-goal-of"> / {goal}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="panel-heading">
        <h2>7-day average</h2>
      </div>
      <div className="gym-stats-row">
        {stats.map(({ category, meta, avgPerDay }) => (
          <div className="gym-stat-card" key={category}>
            <span className="gym-stat-label">{meta.label.toUpperCase()} / DAY</span>
            <span className="gym-stat-value">
              {avgPerDay.toFixed(1)} {meta.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GoalsTab({ goals, setHealthGoal }) {
  return (
    <div className="finance-budgets">
      <div className="finance-budget-summary">
        <strong>Daily goals</strong>
        <span>Optional -- set one to see it as a target on the Trends tab. Leave blank to clear it.</span>
      </div>
      {NUMERIC_CATEGORIES.map((category) => {
        const meta = CATEGORY_META[category]
        const currentGoal = goals[category]

        return (
          <div className="finance-budget-row" key={category}>
            <div className="finance-budget-row-header">
              <span className="finance-budget-category">{meta.label}</span>
              <div className="finance-budget-edit">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={currentGoal ?? ''}
                  placeholder={meta.unit}
                  onBlur={(event) => {
                    const next = event.target.value
                    if (next !== String(currentGoal ?? '')) setHealthGoal(category, next)
                  }}
                />
                <span className="health-goal-unit">{meta.unit} / day</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HealthPage({
  healthEntries,
  goals,
  saving,
  addHealthEntry,
  deleteHealthEntry,
  setHealthGoal,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('log')
  const sorted = healthEntries.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div className="page health-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">HEALTH MODE</span>
          <h1 className="serif">Health</h1>
          <p>Sleep, food, drink, activity — log whatever you've got today.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="health" openChat={openChat} />

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'log' ? 'active' : ''} onClick={() => setActiveTab('log')}>
          Log
        </button>
        <button
          type="button"
          className={activeTab === 'trends' ? 'active' : ''}
          onClick={() => setActiveTab('trends')}
        >
          Trends
        </button>
        <button type="button" className={activeTab === 'goals' ? 'active' : ''} onClick={() => setActiveTab('goals')}>
          Goals
        </button>
      </div>

      {activeTab === 'log' && (
        <>
          <div className="health-log-grid">
            {Object.keys(CATEGORY_META).map((category) => (
              <QuickLogForm key={category} category={category} saving={saving} addHealthEntry={addHealthEntry} />
            ))}
          </div>

          <div className="items-list">
            {sorted.length ? (
              sorted.map((entry) => {
                const meta = CATEGORY_META[entry.category]
                const Icon = meta?.icon

                return (
                  <div className="item-card" key={entry.id}>
                    <div className="item-content">
                      <strong>
                        {Icon && <Icon size={14} strokeWidth={2.25} className="health-item-icon" />}
                        {meta?.label || entry.category}: {entry.value}
                      </strong>
                      <div className="item-meta">
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <button className="delete-button" onClick={() => deleteHealthEntry(entry.id)}>
                      ×
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="empty-state">
                <div>♡</div>
                <h3>Nothing logged yet</h3>
                <p>Use the forms above to log your first entry.</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'trends' && <TrendsTab healthEntries={healthEntries} goals={goals} />}

      {activeTab === 'goals' && <GoalsTab goals={goals} setHealthGoal={setHealthGoal} />}
    </div>
  )
}
