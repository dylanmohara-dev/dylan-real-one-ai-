import { useEffect, useState } from 'react'
import { CalendarDays, RefreshCw, Unlink } from 'lucide-react'

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
  const { checked, connected, events, error, loading, checkStatus, loadEvents, connect, disconnect } = calendar
  const [appleId, setAppleId] = useState('')
  const [appPassword, setAppPassword] = useState('')

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <p>Upcoming, across every calendar you have.</p>
        </div>

        <div className="calendar-header-actions">
          <button onClick={loadEvents} disabled={loading}>
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

      <div className="items-list">
        {events.length ? (
          events.map((event) => (
            <div className="item-card calendar-event-card" key={event.id}>
              <div className="item-content">
                <p>{event.title}</p>
                <span className="item-meta">
                  {formatWhen(event)}
                  {event.location ? ` · ${event.location}` : ''}
                  {event.calendar ? ` · ${event.calendar}` : ''}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>◷</div>
            <h3>Nothing on the calendar</h3>
            <p>You're clear for now — or nothing synced yet. Try Refresh.</p>
          </div>
        )}
      </div>
    </div>
  )
}
