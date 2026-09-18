import { useEffect } from 'react'
import { Mail, HardDrive, Hash, Calendar, RefreshCw, Unlink } from 'lucide-react'

function timeAgo(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Every integration renders through the same three states (not set up /
// not connected / connected) so Gmail, Drive, and Slack read as one
// consistent system instead of three bolted-on features — same shape
// CalendarPage already established for Google Calendar.
function IntegrationCard({ icon: Icon, name, hook, setupNote, connectNote, renderConnected }) {
  const { configured, connected, error, loading, connect, disconnect } = hook

  return (
    <div className="form-card connection-card">
      <div className="connection-card-header">
        <Icon size={18} strokeWidth={2.25} />
        <h3>{name}</h3>
        {connected && (
          <div className="calendar-header-actions">
            <button onClick={hook.loadThreads || hook.loadFiles || hook.loadConversations} disabled={loading}>
              <RefreshCw size={14} strokeWidth={2.25} />
              Refresh
            </button>
            <button onClick={disconnect}>
              <Unlink size={14} strokeWidth={2.25} />
              Disconnect
            </button>
          </div>
        )}
      </div>

      {error && <p className="journal-error">{error}</p>}

      {configured === null && <p className="mode-page-note">Checking...</p>}

      {configured === false && <p className="mode-page-note">{setupNote}</p>}

      {configured === true && !connected && (
        <>
          <p className="mode-page-note">{connectNote}</p>
          <button onClick={connect} disabled={loading}>
            <Icon size={14} strokeWidth={2.25} />
            Connect {name}
          </button>
        </>
      )}

      {connected && renderConnected()}
    </div>
  )
}

export default function ConnectionsPage({ gmail, drive, slack, googleCalendar }) {
  useEffect(() => {
    gmail.checkStatus()
    drive.checkStatus()
    slack.checkStatus()
    googleCalendar.checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page connections-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">EVERYTHING, ONE PLACE</span>
          <h1 className="serif">Connections</h1>
          <p>What Dylan AI can see, live, from the outside world — used as context in every chat.</p>
        </div>
      </div>

      <IntegrationCard
        icon={Mail}
        name="Gmail"
        hook={gmail}
        setupNote={
          <>
            Gmail sync isn't set up yet. This needs the same Google Cloud OAuth client Calendar
            uses, with the Gmail API enabled and <code>GMAIL_REDIRECT_URI</code> added as an
            authorized redirect URI. Restart the server after updating <code>.env</code>.
          </>
        }
        connectNote="Read-only access to see which threads are waiting on a reply from you."
        renderConnected={() => (
          <div className="items-list">
            {gmail.threads.length ? (
              gmail.threads.map((t) => (
                <div className="item-card" key={t.threadId}>
                  <div className="item-content">
                    <p>{t.subject}</p>
                    <span className="item-meta">{t.from} · {t.date}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div>✉</div>
                <h3>Nothing waiting on a reply</h3>
              </div>
            )}
          </div>
        )}
      />

      <IntegrationCard
        icon={HardDrive}
        name="Google Drive"
        hook={drive}
        setupNote={
          <>
            Drive sync isn't set up yet. Same Google Cloud OAuth client as Calendar/Gmail, with the
            Drive API enabled and <code>DRIVE_REDIRECT_URI</code> added as an authorized redirect URI.
          </>
        }
        connectNote="Read-only access to your most recently modified files."
        renderConnected={() => (
          <div className="items-list">
            {drive.files.length ? (
              drive.files.map((f) => (
                <div className="item-card" key={f.id}>
                  <div className="item-content">
                    <p>{f.name}</p>
                    <span className="item-meta">{timeAgo(f.modifiedTime)}</span>
                  </div>
                  {f.webViewLink && (
                    <a className="calendar-event-link" href={f.webViewLink} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div>⛁</div>
                <h3>Nothing recent</h3>
              </div>
            )}
          </div>
        )}
      />

      <IntegrationCard
        icon={Calendar}
        name="Google Calendar"
        hook={googleCalendar}
        setupNote={
          <>
            Google Calendar sync isn't set up yet. Same Google Cloud OAuth client as Gmail/Drive,
            with the Calendar API enabled and <code>GOOGLE_CALENDAR_REDIRECT_URI</code> added as an
            authorized redirect URI. Restart the server after updating <code>.env</code>.
          </>
        }
        connectNote="Read-only access to your next few upcoming events. Separate from the Dylan AI iCloud calendar the app writes to -- this reads FROM your own Google Calendar, if you keep one."
        renderConnected={() => (
          <div className="items-list">
            {googleCalendar.events.length ? (
              googleCalendar.events.map((event) => (
                <div className="item-card" key={event.id}>
                  <div className="item-content">
                    <p>{event.title}</p>
                    <span className="item-meta">
                      {event.allDay ? event.start : new Date(event.start).toLocaleString()}
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
                <div>&#128197;</div>
                <h3>Nothing upcoming</h3>
              </div>
            )}
          </div>
        )}
      />

      <IntegrationCard
        icon={Hash}
        name="Slack"
        hook={slack}
        setupNote={
          <>
            Slack sync isn't set up yet. This needs its own Slack app (from api.slack.com/apps) —
            separate from the Google OAuth client — with <code>SLACK_CLIENT_ID</code> and{' '}
            <code>SLACK_CLIENT_SECRET</code> in <code>.env</code>.
          </>
        }
        connectNote="User-level access to see which channels and DMs have unread messages."
        renderConnected={() => (
          <div className="items-list">
            {slack.conversations.length ? (
              slack.conversations.map((c) => (
                <div className="item-card" key={c.channel}>
                  <div className="item-content">
                    <p>{c.channel} — {c.unreadCount} unread</p>
                    {c.messages?.length > 0 && (
                      <span className="item-meta">
                        {c.messages[c.messages.length - 1].from}: {c.messages[c.messages.length - 1].text}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div>#</div>
                <h3>Nothing unread</h3>
              </div>
            )}
          </div>
        )}
      />
    </div>
  )
}
