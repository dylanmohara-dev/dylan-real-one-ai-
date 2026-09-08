import { useEffect } from 'react'
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
  const { configured, connected, events, error, loading, checkStatus, loadEvents, connect, disconnect } = calendar

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (configured === null) {
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

  if (!configured) {
    return (
      <div className="page calendar-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">EVERYTHING, ONE PLACE</span>
            <h1 className="serif">Calendar</h1>
            <p>
              Google Calendar sync isn't set up yet. This needs a one-time
              Google Cloud OAuth client — Dylan walked you through creating
              one and it goes in the server's <code>.env</code> file as{' '}
              <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.
              Restart the server after adding it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="page calendar-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">EVERYTHING, ONE PLACE</span>
            <h1 className="serif">Connect your calendar</h1>
            <p>Pull in everything from Google Calendar so it lives alongside the rest of your life here.</p>
          </div>
        </div>

        <div className="form-card calendar-connect">
          {error && <p className="journal-error">{error}</p>}
          <button onClick={connect} disabled={loading}>
            <CalendarDays size={14} strokeWidth={2.25} />
            Connect Google Calendar
          </button>
          <p className="mode-page-note">
            This opens a Google sign-in tab. Approve read-only calendar access, then come back here.
          </p>
        </div>
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
              {event.htmlLink && (
                <a className="calendar-event-link" href={event.htmlLink} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
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
