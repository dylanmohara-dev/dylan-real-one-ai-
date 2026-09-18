import { useState } from 'react'

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const ALL_WEEKDAYS = [
  { key: 'monday', short: 'Mon' },
  { key: 'tuesday', short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday', short: 'Thu' },
  { key: 'friday', short: 'Fri' },
  { key: 'saturday', short: 'Sat' },
  { key: 'sunday', short: 'Sun' },
]

// '13:05' -> '1:05 PM'. Used everywhere a raw <input type="time"> value
// (always 24-hour 'HH:MM') needs to read like something a person actually
// says out loud, e.g. Dylan's own "330-530" shorthand for 3:30-5:30.
export function formatTime(value) {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// '15:30','17:30' -> '3:30-5:30 PM'. Collapses a shared AM/PM into one
// suffix at the end instead of repeating it on both sides.
export function formatTimeRange(start, end) {
  if (!start || !end) return ''
  const [sh] = start.split(':').map(Number)
  const [eh] = end.split(':').map(Number)
  const startPeriod = sh >= 12 ? 'PM' : 'AM'
  const endPeriod = eh >= 12 ? 'PM' : 'AM'
  const startLabel = formatTime(start)
  const endLabel = formatTime(end)
  if (!startLabel || !endLabel) return ''
  if (startPeriod === endPeriod) {
    return `${startLabel.replace(` ${startPeriod}`, '')}-${endLabel}`
  }
  return `${startLabel}-${endLabel}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateKeyOf(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function todayKey() {
  const d = new Date()
  return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate())
}

// Reusable month grid for Sports' and Gym's own Calendar tabs --
// deliberately separate from the main app-wide Calendar page (different
// data, no external-calendar connect flow, no sync UI). Each mode page
// supplies getDayData(dateKey), returning { planned, actual } for that
// date; this component only knows how to lay out a month and color a
// cell by whichever of those it got back. It has no idea what "planned"
// or "actual" mean for Sports vs. Gym -- that's entirely the caller's.
export default function ModeCalendarMonth({ getDayData, legend }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const todaysKey = todayKey()

  function goPrev() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function goNext() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Date.getDay(): 0=Sunday..6=Saturday -- convert to a Monday-first
  // leading-blank count, matching the Monday-first convention every other
  // weekly view in this app already uses (Sports/Gym's own WEEKDAY_ORDER).
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  const cells = []
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)

  return (
    <div className="mode-cal">
      <div className="mode-cal-header">
        <button type="button" className="mode-cal-nav" onClick={goPrev} aria-label="Previous month">
          &#8249;
        </button>
        <div className="mode-cal-title">
          <span>
            {MONTH_LABELS[month]} {year}
          </span>
          <button type="button" className="mode-cal-today" onClick={goToday}>
            Today
          </button>
        </div>
        <button type="button" className="mode-cal-nav" onClick={goNext} aria-label="Next month">
          &#8250;
        </button>
      </div>

      <div className="mode-cal-weekdays">
        {WEEKDAY_SHORT.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mode-cal-grid">
        {cells.map((day, index) => {
          if (day === null) {
            return <div className="mode-cal-cell mode-cal-cell-blank" key={`blank-${index}`} />
          }
          const dateKey = dateKeyOf(year, month, day)
          const { planned = [], actual = [] } = getDayData(dateKey) || {}
          const isToday = dateKey === todaysKey
          const isPast = dateKey < todaysKey

          let status = 'none'
          if (planned.length && actual.length) status = 'match'
          else if (planned.length && !actual.length) status = isPast ? 'missed' : 'upcoming'
          else if (!planned.length && actual.length) status = 'extra'

          return (
            <div className={`mode-cal-cell status-${status}${isToday ? ' is-today' : ''}`} key={dateKey}>
              <span className="mode-cal-daynum">{day}</span>
              <div className="mode-cal-chips">
                {actual.length
                  ? actual.slice(0, 2).map((item) => (
                      <span className="mode-cal-chip mode-cal-chip-actual" key={item.id} title={item.label}>
                        {item.timeLabel || item.label}
                      </span>
                    ))
                  : planned.slice(0, 2).map((item) => (
                      <span className="mode-cal-chip mode-cal-chip-planned" key={item.id} title={item.label}>
                        {item.timeLabel || item.label}
                      </span>
                    ))}
              </div>
            </div>
          )
        })}
      </div>

      {legend && <div className="mode-cal-legend">{legend}</div>}
    </div>
  )
}

// Shared "define a repeating time-boxed session" widget used by both
// Sports (practices/games) and Gym (workout sessions) Calendar tabs.
// Deliberately simple per Dylan's own "beginner friendly" ask: pick which
// weekdays it repeats on and a start/end time, no season date-range
// fields -- it just repeats indefinitely until deleted.
export function RecurringEventsManager({ title, events, saving, addEvent, deleteEvent, showType = false }) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState('practice')
  const [weekdays, setWeekdays] = useState([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  function toggleWeekday(key) {
    setWeekdays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]))
  }

  async function handleAdd() {
    if (!label.trim() || !weekdays.length || !startTime || !endTime) return
    await addEvent({ label: label.trim(), type, weekdays, startTime, endTime })
    setLabel('')
    setWeekdays([])
    setStartTime('')
    setEndTime('')
  }

  return (
    <div className="mode-recurring">
      <span className="eyebrow">{title}</span>

      <div className="form-card mode-recurring-form">
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Name (e.g. Team Practice)" />

        {showType && (
          <div className="sports-type-toggle">
            <button type="button" className={type === 'practice' ? 'active' : ''} onClick={() => setType('practice')}>
              Practice
            </button>
            <button type="button" className={type === 'game' ? 'active' : ''} onClick={() => setType('game')}>
              Game
            </button>
          </div>
        )}

        <div className="mode-weekday-picker">
          {ALL_WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day.key}
              className={weekdays.includes(day.key) ? 'active' : ''}
              onClick={() => toggleWeekday(day.key)}
            >
              {day.short}
            </button>
          ))}
        </div>

        <div className="mode-time-range-fields">
          <label>
            Start
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>

        <button onClick={handleAdd} disabled={saving || !label.trim() || !weekdays.length || !startTime || !endTime}>
          Add recurring
        </button>
      </div>

      <div className="items-list">
        {events.length ? (
          events.map((event) => (
            <div className="item-card" key={event.id}>
              <div className="item-content">
                <strong>{event.label}</strong>
                <div className="item-meta">
                  <span>
                    {event.weekdays.map((d) => ALL_WEEKDAYS.find((w) => w.key === d)?.short).join('/')} &middot;{' '}
                    {formatTimeRange(event.startTime, event.endTime)}
                  </span>
                </div>
              </div>
              <button className="delete-button" onClick={() => deleteEvent(event.id)}>
                &times;
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>&#128197;</div>
            <h3>No recurring sessions yet</h3>
            <p>Add one above so you don't have to log the same one over and over.</p>
          </div>
        )}
      </div>
    </div>
  )
}
