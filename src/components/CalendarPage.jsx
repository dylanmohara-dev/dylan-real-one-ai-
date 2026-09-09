import { useEffect, useMemo, useState } from 'react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function dayKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/*
  Builds the 6x7 cell array the grid renders. Leading and trailing cells come
  from the neighbouring months so the weekday columns line up — a real
  calendar never starts the 1st under "Sun" unless it genuinely falls there.
*/
function buildMonthCells(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate()
  const leading = firstOfMonth.getDay()

  const cells = []

  for (let i = leading - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i
    const d = new Date(year, monthIndex - 1, day)
    cells.push({ day, key: dayKey(d.getFullYear(), d.getMonth(), day), outside: true })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, key: dayKey(year, monthIndex, day), outside: false })
  }

  while (cells.length % 7 !== 0) {
    const day = cells.length - leading - daysInMonth + 1
    const d = new Date(year, monthIndex + 1, day)
    cells.push({ day, key: dayKey(d.getFullYear(), d.getMonth(), day), outside: true })
  }

  return cells
}

import { CalendarDays, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw, Unlink } from 'lucide-react'
import CalendarEventForm from './CalendarEventForm.jsx'

function formatWhen(event) {
  const start = new Date(event.start)
  if (event.allDay) {
    return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }
  return start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CalendarPage({ calendar }) {
  const {
    checked, connected, events, error, loading, checkStatus, loadEvents, connect, disconnect,
    monthItems, monthLoading, calendarError, loadMonth,
    targetCalendarUrl, createEvent, updateEvent, deleteEvent,
  } = calendar
  const [appleId, setAppleId] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-11
  const [selectedKey, setSelectedKey] = useState(
    dayKey(today.getFullYear(), today.getMonth(), today.getDate())
  )

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The month grid loads whether or not iCloud is connected — assignments,
  // tests, tasks and logged practice are all local and should show up
  // regardless of calendar status.
  useEffect(() => {
    loadMonth(viewYear, viewMonth + 1)
  }, [viewYear, viewMonth, loadMonth])

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])

  const itemsByDay = useMemo(() => {
    const map = {}
    for (const item of monthItems || []) {
      if (!map[item.date]) map[item.date] = []
      map[item.date].push(item)
    }
    return map
  }, [monthItems])

  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate())
  const selectedItems = itemsByDay[selectedKey] || []

  // Form state: null (closed), 'new', or the raw event object being edited.
  const [formMode, setFormMode] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [actionError, setActionError] = useState('')

  async function refreshMonth() {
    await loadMonth(viewYear, viewMonth + 1)
  }

  async function handleSaveEvent(fields) {
    if (fields.url) {
      await updateEvent(fields)
    } else {
      await createEvent(fields)
    }
    setFormMode(null)
    await refreshMonth()
  }

  async function handleConfirmDelete(item) {
    setActionError('')
    try {
      await deleteEvent({ url: item.raw.url, etag: item.raw.etag })
      setPendingDeleteId(null)
      await refreshMonth()
    } catch (err) {
      setActionError(err.message)
    }
  }

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  function goToToday() {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelectedKey(dayKey(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  if (!checked) {
    return (
      <div className="page calendar-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">EVERYTHING, ONE PLACE</span>
            <h1 className="serif">Calendar</h1>
          </div>
        </div>
        <p className="mode-page-note">Checking...</p>
      </div>
    )
  }

  if (!connected) {
    async function handleSubmit(e) {
      e.preventDefault()
      const ok = await connect(appleId, appPassword)
      if (ok) setAppPassword('') // don't leave it sitting in the field after a successful connect
    }

    return (
      <div className="page calendar-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">EVERYTHING, ONE PLACE</span>
            <h1 className="serif">Connect your calendar</h1>
            <p>Pull in everything from your Apple/iCloud Calendar so it lives alongside the rest of your life here.</p>
          </div>
        </div>

        <form className="form-card calendar-connect" onSubmit={handleSubmit}>
          {error && <p className="journal-error">{error}</p>}
          <input
            type="email"
            placeholder="Apple ID (e.g. you@icloud.com)"
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="App-specific password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading}>
            <CalendarDays size={14} strokeWidth={2.25} />
            Connect Apple Calendar
          </button>
          <p className="mode-page-note">
            Not your regular Apple ID password — generate an app-specific one at{' '}
            <code>appleid.apple.com</code> under Sign-In and Security. It's only used to talk to
            iCloud's calendar servers directly from your own machine.
          </p>
        </form>
      </div>
    )
  }

  return (
    <div className="page calendar-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">EVERYTHING, ONE PLACE</span>
          <h1 className="serif">Calendar</h1>
          <p>Every day of the month, with everything you track on it.</p>
        </div>

        <div className="calendar-header-actions">
          <button onClick={() => { loadEvents(); loadMonth(viewYear, viewMonth + 1) }} disabled={loading || monthLoading}>
            <RefreshCw size={14} strokeWidth={2.25} />
            Refresh
          </button>
          <button onClick={disconnect}>
            <Unlink size={14} strokeWidth={2.25} />
            Disconnect
          </button>
        </div>
      </div>

      {error && <p className="journal-error">{error}</p>}
      {calendarError && (
        <p className="mode-page-note calendar-notice">
          Showing your Dylan AI items. Couldn't reach iCloud this time ({calendarError}).
        </p>
      )}

      <div className="calendar-toolbar">
        <button className="calendar-nav" onClick={() => shiftMonth(-1)} title="Previous month">
          <ChevronLeft size={16} strokeWidth={2.25} />
        </button>
        <h2 className="calendar-month-label">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h2>
        <button className="calendar-nav" onClick={() => shiftMonth(1)} title="Next month">
          <ChevronRight size={16} strokeWidth={2.25} />
        </button>
        <button className="calendar-today-button" onClick={goToToday}>Today</button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((weekday) => (
          <div className="calendar-weekday" key={weekday}>{weekday}</div>
        ))}

        {cells.map((cell) => {
          const dayItems = itemsByDay[cell.key] || []
          const classes = [
            'calendar-day',
            cell.outside ? 'is-outside' : '',
            cell.key === todayKey ? 'is-today' : '',
            cell.key === selectedKey ? 'is-selected' : '',
          ].filter(Boolean).join(' ')

          return (
            <button className={classes} key={cell.key} onClick={() => setSelectedKey(cell.key)}>
              <span className="calendar-day-number">{cell.day}</span>

              <span className="calendar-day-items">
                {dayItems.slice(0, 3).map((item) => (
                  <span
                    className={`calendar-chip cal-mode-${item.mode}${item.done ? ' is-done' : ''}`}
                    key={item.id}
                    title={`${item.title}${item.meta ? ` · ${item.meta}` : ''}`}
                  >
                    {item.time ? <em>{item.time}</em> : null}
                    {item.title}
                  </span>
                ))}
                {dayItems.length > 3 && (
                  <span className="calendar-more">+{dayItems.length - 3} more</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="calendar-agenda">
        <div className="calendar-agenda-header">
          <h3>
            {new Date(`${selectedKey}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </h3>

          {formMode === null && (
            <button className="calendar-add-button" onClick={() => setFormMode('new')}>
              <Plus size={14} strokeWidth={2.5} />
              Add event
            </button>
          )}
        </div>

        {actionError && <p className="journal-error">{actionError}</p>}

        {formMode === 'new' && (
          <CalendarEventForm
            defaultDateKey={selectedKey}
            targetCalendarUrl={targetCalendarUrl}
            onSave={handleSaveEvent}
            onCancel={() => setFormMode(null)}
          />
        )}

        {formMode && formMode !== 'new' && (
          <CalendarEventForm
            initial={formMode}
            defaultDateKey={selectedKey}
            targetCalendarUrl={targetCalendarUrl}
            onSave={handleSaveEvent}
            onCancel={() => setFormMode(null)}
          />
        )}

        {selectedItems.length ? (
          <div className="items-list">
            {selectedItems.map((item) => (
              <div className={`item-card calendar-event-card cal-mode-${item.mode}`} key={item.id}>
                <div className="item-content">
                  <p className={item.done ? 'is-done' : ''}>{item.title}</p>
                  <span className="item-meta">
                    {[item.time, item.kind, item.meta].filter(Boolean).join(' · ')}
                    {item.isRecurring ? ' · repeats (edit in Apple Calendar)' : ''}
                  </span>
                </div>

                {item.kind === 'event' && item.editable && (
                  <div className="calendar-item-actions">
                    {pendingDeleteId === item.id ? (
                      <>
                        <span className="calendar-confirm-label">Delete for good?</span>
                        <button className="calendar-confirm-yes" onClick={() => handleConfirmDelete(item)}>
                          Yes, delete
                        </button>
                        <button onClick={() => setPendingDeleteId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          title="Edit"
                          onClick={() => setFormMode({ ...item.raw, title: item.title })}
                        >
                          <Pencil size={13} strokeWidth={2.25} />
                        </button>
                        <button title="Delete" onClick={() => setPendingDeleteId(item.id)}>
                          <Trash2 size={13} strokeWidth={2.25} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mode-page-note">Nothing on this day.</p>
        )}
      </div>
    </div>
  )
}
