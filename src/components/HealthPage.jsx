import { useMemo, useState } from 'react'
import { Bed, Utensils, Droplets, Footprints, ChevronLeft, ChevronRight } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

const CATEGORY_META = {
  sleep: { label: 'Sleep', icon: Bed, placeholder: 'e.g. 7.5', unit: 'hours', numeric: true },
  food: { label: 'Food', icon: Utensils, placeholder: 'What did you eat?', numeric: false },
  water: { label: 'Water', icon: Droplets, placeholder: 'e.g. 4', unit: 'glasses', numeric: true },
  activity: { label: 'Activity', icon: Footprints, placeholder: 'e.g. 30', unit: 'min', numeric: true },
}

// Food is deliberately excluded here -- "what did you eat" isn't a single
// number to trend, total, or set a goal against.
const NUMERIC_CATEGORIES = Object.keys(CATEGORY_META).filter((category) => CATEGORY_META[category].numeric)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayKey() {
  return dateKey(new Date())
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dateKey(d)
}

// Older entries (from before this feature) have no `date` field at all --
// fall back to the local calendar day their `createdAt` timestamp actually
// landed on, rather than treating them as unlogged.
function entryDateKey(entry) {
  return entry.date || dateKey(new Date(entry.createdAt))
}

// Monday-anchored week containing `date`, offset by `weekOffset` whole
// weeks (0 = the week containing today).
function weekDates(weekOffset) {
  const base = new Date()
  base.setDate(base.getDate() + weekOffset * 7)
  const day = base.getDay() // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(base)
  monday.setDate(base.getDate() + mondayOffset)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

// Consecutive days, counting back from today, with at least one entry
// logged (any category). A day is a "yes" or "no" here -- the same
// stops-at-the-first-gap logic Discipline's habit streaks already use, not
// a new invention.
function currentStreak(healthEntries) {
  const loggedDays = new Set(healthEntries.map(entryDateKey))
  let streak = 0
  for (let i = 0; ; i += 1) {
    const key = i === 0 ? todayKey() : daysAgoKey(i)
    if (!loggedDays.has(key)) break
    streak += 1
  }
  return streak
}

function dayTotals(healthEntries, key) {
  const dayEntries = healthEntries.filter((entry) => entryDateKey(entry) === key)
  const totals = {}
  for (const category of NUMERIC_CATEGORIES) {
    totals[category] = dayEntries
      .filter((entry) => entry.category === category && typeof entry.amount === 'number')
      .reduce((sum, entry) => sum + entry.amount, 0)
  }
  totals.foodCount = dayEntries.filter((entry) => entry.category === 'food').length
  totals.total = dayEntries.length
  return totals
}

function CategoryInput({ category, saving, addHealthEntry, date, mostRecentAmount, compact }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const [value, setValue] = useState('')

  const submit = (overrideValue) => {
    const trimmed = (overrideValue ?? value).toString().trim()
    if (!trimmed) return

    if (meta.numeric) {
      const amount = Number(trimmed)
      if (!amount || amount <= 0) return
      addHealthEntry(category, `${amount} ${meta.unit}`, '', amount, date)
    } else {
      addHealthEntry(category, trimmed, '', null, date)
    }
    setValue('')
  }

  return (
    <div className={compact ? 'health-log-card health-log-card-compact' : 'form-card health-log-card'}>
      <div className="health-log-label">
        <Icon size={16} strokeWidth={2.25} />
        {meta.label}
        {meta.numeric && <span className="health-unit-hint">{meta.unit}</span>}
      </div>
      <div className="health-log-row">
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
        <button onClick={() => submit()} disabled={saving || !value.toString().trim()}>
          Log
        </button>
      </div>
      {meta.numeric && mostRecentAmount != null && (
        <button
          type="button"
          className="health-repeat-chip"
          disabled={saving}
          onClick={() => submit(mostRecentAmount)}
        >
          Same as last time ({mostRecentAmount} {meta.unit})
        </button>
      )}
    </div>
  )
}

function WeekTab({ healthEntries, goals, saving, addHealthEntry }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [openDay, setOpenDay] = useState(null)
  const days = useMemo(() => weekDates(weekOffset), [weekOffset])
  const today = todayKey()

  const mostRecentAmounts = useMemo(() => {
    const result = {}
    for (const category of NUMERIC_CATEGORIES) {
      const last = healthEntries
        .filter((entry) => entry.category === category && typeof entry.amount === 'number')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
      result[category] = last ? last.amount : null
    }
    return result
  }, [healthEntries])

  const streak = currentStreak(healthEntries)
  const rangeLabel = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <div className="health-week">
      {streak > 0 && (
        <div className="health-streak-banner">
          {streak} day{streak === 1 ? '' : 's'} logged in a row
        </div>
      )}

      <div className="panel-heading">
        <h2>Log today</h2>
      </div>
      <div className="health-log-grid">
        {Object.keys(CATEGORY_META).map((category) => (
          <CategoryInput
            key={category}
            category={category}
            saving={saving}
            addHealthEntry={addHealthEntry}
            date={today}
            mostRecentAmount={mostRecentAmounts[category]}
          />
        ))}
      </div>

      <div className="calendar-toolbar">
        <button type="button" className="calendar-nav" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft size={16} strokeWidth={2.25} />
        </button>
        <h2 className="calendar-month-label">{rangeLabel}</h2>
        <button type="button" className="calendar-nav" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight size={16} strokeWidth={2.25} />
        </button>
        {weekOffset !== 0 && (
          <button type="button" className="calendar-today-button" onClick={() => setWeekOffset(0)}>
            This week
          </button>
        )}
      </div>

      <div className="health-week-grid">
        {days.map((date) => {
          const key = dateKey(date)
          const isToday = key === today
          const totals = dayTotals(healthEntries, key)
          const isOpen = openDay === key

          return (
            <div className={`health-week-day${isToday ? ' is-today' : ''}`} key={key}>
              <button type="button" className="health-week-day-header" onClick={() => setOpenDay(isOpen ? null : key)}>
                <span className="health-week-day-name">{DAY_NAMES[date.getDay()]}</span>
                <span className="health-week-day-date">{date.getDate()}</span>
              </button>
              <div className="health-week-day-stats">
                {NUMERIC_CATEGORIES.map((category) => {
                  const meta = CATEGORY_META[category]
                  const value = totals[category]
                  const goal = goals[category]
                  return (
                    <span
                      className={`health-week-stat${goal && value >= goal ? ' met' : ''}`}
                      key={category}
                    >
                      {value || 0} {meta.unit === 'hours' ? 'h' : meta.unit === 'glasses' ? 'gl' : 'm'}
                    </span>
                  )
                })}
                {totals.foodCount > 0 && (
                  <span className="health-week-stat">
                    {totals.foodCount} food log{totals.foodCount === 1 ? '' : 's'}
                  </span>
                )}
                {totals.total === 0 && <span className="health-week-stat health-week-empty">Nothing logged</span>}
              </div>
              {isOpen && (
                <div className="health-week-day-form">
                  {Object.keys(CATEGORY_META).map((category) => (
                    <CategoryInput
                      key={category}
                      category={category}
                      saving={saving}
                      addHealthEntry={addHealthEntry}
                      date={key}
                      mostRecentAmount={null}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
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
      .filter((entry) => entryDateKey(entry) === today)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const last7Total = categoryEntries
      .filter((entry) => new Date(entry.createdAt) >= sevenDaysAgo)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const goal = goals[category]

    return {
      category,
      meta,
      todayTotal,
      avgPerDay: last7Total / 7,
      goal,
      pct: goal ? Math.min(100, Math.round((todayTotal / goal) * 100)) : null,
    }
  })

  return (
    <div className="health-trends">
      <div className="panel-heading">
        <h2>Today</h2>
      </div>
      <div className="gym-stats-row">
        {stats.map(({ category, meta, todayTotal, goal, pct }) => (
          <div className="gym-stat-card" key={category}>
            <span className="gym-stat-label">{meta.label.toUpperCase()}</span>
            <span className="gym-stat-value">
              {todayTotal || 0} {meta.unit}
              {goal ? <span className="health-goal-of"> / {goal}</span> : null}
            </span>
            {goal && (
              <div className="skill-xp-bar">
                <div className="skill-xp-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            )}
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
        <span>Optional -- set one to see it as a target on Week and Trends. Leave blank to clear it.</span>
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
  const [activeTab, setActiveTab] = useState('week')
  const sorted = useMemo(
    () => healthEntries.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [healthEntries]
  )

  return (
    <div className="page health-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">HEALTH MODE</span>
          <h1 className="serif">Health</h1>
          <p>Sleep, food, drink, activity — log any day of the week, not just today.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="health" openChat={openChat} />

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'week' ? 'active' : ''} onClick={() => setActiveTab('week')}>
          Week
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

      {activeTab === 'week' && (
        <>
          <WeekTab healthEntries={healthEntries} goals={goals} saving={saving} addHealthEntry={addHealthEntry} />

          <div className="panel-heading">
            <h2>All entries</h2>
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
                        <span>{entryDateKey(entry)}</span>
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
