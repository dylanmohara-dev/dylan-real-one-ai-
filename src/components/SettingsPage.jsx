import { useEffect, useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { DESIGN_SYSTEMS, COLOR_PALETTES } from '../data/lifeModes.js'

const API = 'http://localhost:3001/api'

const COLLECTION_LABELS = {
  tasks: 'Tasks',
  goals: 'Goals',
  notes: 'Notes',
  memories: 'Memories',
  classes: 'Classes',
  assignments: 'Assignments',
  tests: 'Tests',
  health: 'Health entries',
  finance_accounts: 'Finance accounts',
  finance_history: 'Finance history',
  skills: 'Skills',
  skill_sessions: 'Skill practice sessions',
  skill_videos: 'Skill videos (metadata only)',
  journal: 'Journal entries (stay encrypted)',
  journal_meta: 'Journal setup',
}

export default function SettingsPage({ settings, setSettings, setActivePage, openChat, calendar }) {
  const {
    connected: calendarConnected,
    calendars,
    calendarsLoading,
    targetCalendarUrl,
    loadCalendars,
    chooseTargetCalendar,
  } = calendar
  const [targetError, setTargetError] = useState('')
  const [choosingTarget, setChoosingTarget] = useState(false)

  useEffect(() => {
    if (calendarConnected) {
      loadCalendars().catch((err) => setTargetError(err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConnected])

  async function handleChooseTarget(url) {
    setChoosingTarget(true)
    setTargetError('')
    try {
      await chooseTargetCalendar(url)
    } catch (err) {
      setTargetError(err.message)
    } finally {
      setChoosingTarget(false)
    }
  }

  const [backupSummary, setBackupSummary] = useState(null)
  const [backupError, setBackupError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [lastExportedAt, setLastExportedAt] = useState(
    () => localStorage.getItem('dylan-ai-last-backup') || ''
  )

  useEffect(() => {
    fetch(`${API}/backup/summary`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setBackupSummary(data)
      })
      .catch((err) => setBackupError(err.message))
  }, [])

  async function handleExport() {
    setExporting(true)
    setBackupError('')
    try {
      const response = await fetch(`${API}/backup/export`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Backup failed.')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : 'dylan-ai-backup.json'

      // Browser download via a throwaway object URL — no server-side file
      // is left behind, and this works the same whether the app is opened
      // over localhost or (once phone access exists) the LAN.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      const now = new Date().toISOString()
      localStorage.setItem('dylan-ai-last-backup', now)
      setLastExportedAt(now)
    } catch (err) {
      setBackupError(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">CONTROL CENTER</span>

          <h1>Settings</h1>

          <p>Control how Dylan AI behaves.</p>
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-card">
          <div>
            <strong>AI Actions</strong>

            <p>
              Allow Dylan AI to create, update, and delete tasks, goals, notes,
              and memories.
            </p>
          </div>

          <button
            className={`toggle ${settings.aiActions ? 'on' : ''}`}
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                aiActions: !prev.aiActions,
              }))
            }
          >
            <span />
          </button>
        </div>

        <div className="settings-card">
          <div>
            <strong>Memory Suggestions</strong>

            <p>
              Let Dylan AI suggest useful personal memories before saving them.
            </p>
          </div>

          <button
            className={`toggle ${settings.memorySuggestions ? 'on' : ''}`}
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                memorySuggestions: !prev.memorySuggestions,
              }))
            }
          >
            <span />
          </button>
        </div>

        <div className="settings-note">
          <strong>Your data stays local.</strong>

          <p>
            Dylan AI currently stores your tasks, goals, notes, and memories
            locally in your app.
          </p>
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">CALENDAR — WRITE TARGET</span>
        <p className="classic-tools-note">
          {calendarConnected
            ? "Pick which iCloud calendar Dylan AI writes new/edited/deleted events into. Only this one calendar is ever touched — everything else in your account is read-only to this app."
            : 'Connect Apple Calendar first (on the Calendar page) to choose a target calendar for writes.'}
        </p>

        {calendarConnected && (
          <>
            {calendarsLoading && <p className="mode-page-note">Loading your calendars...</p>}
            {targetError && <p className="journal-error">{targetError}</p>}

            {!calendarsLoading && calendars.length > 0 && (
              <div className="target-calendar-list">
                {calendars.map((cal) => (
                  <button
                    key={cal.url}
                    className={`target-calendar-option ${targetCalendarUrl === cal.url ? 'active' : ''}`}
                    onClick={() => handleChooseTarget(cal.url)}
                    disabled={choosingTarget}
                  >
                    <span>{cal.displayName}</span>
                    {targetCalendarUrl === cal.url && <span className="target-calendar-badge">Writing here</span>}
                  </button>
                ))}
              </div>
            )}

            {!calendarsLoading && calendars.length === 0 && !targetError && (
              <p className="mode-page-note">No calendars found on your iCloud account.</p>
            )}

            {!targetCalendarUrl && !calendarsLoading && calendars.length > 0 && (
              <p className="mode-page-note calendar-notice">
                No target chosen yet — adding an event from the Calendar page will be blocked until you pick one.
              </p>
            )}
          </>
        )}
      </div>

      <div className="classic-tools backup-section">
        <span className="eyebrow">BACKUP & EXPORT</span>
        <p className="classic-tools-note">
          Everything above lives in local files on this Mac with nothing
          protecting it if one corrupts or the laptop dies. One click bundles
          it into a single JSON file you download and keep somewhere safe —
          your Downloads folder, a drive, wherever.
        </p>

        <div className="backup-card">
          <div className="backup-card-summary">
            <ShieldCheck size={18} strokeWidth={2} />
            <div>
              {backupSummary ? (
                <>
                  <strong>
                    {Object.values(backupSummary.counts).reduce((sum, n) => sum + n, 0)} items
                    {' '}across {Object.keys(backupSummary.counts).length} categories
                  </strong>
                  <ul className="backup-counts">
                    {Object.entries(backupSummary.counts)
                      .filter(([, count]) => count > 0)
                      .map(([key, count]) => (
                        <li key={key}>
                          {COLLECTION_LABELS[key] || key}: {count}
                        </li>
                      ))}
                  </ul>
                </>
              ) : backupError ? (
                <p className="journal-error">{backupError}</p>
              ) : (
                <p>Loading what's in your data...</p>
              )}

              <p className="backup-excluded-note">
                Not included, on purpose: your Apple Calendar password and any
                connected-account tokens (all reconnectable from Settings,
                none of them worth putting in a downloadable file) and the
                actual skill practice video files (only their titles/notes are
                included — copy data/skill_videos in Finder for the clips
                themselves).
              </p>

              {lastExportedAt && (
                <p className="backup-last-export">
                  Last downloaded: {new Date(lastExportedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <button className="backup-download-button" onClick={handleExport} disabled={exporting}>
            <Download size={16} strokeWidth={2.25} />
            {exporting ? 'Preparing...' : 'Download backup'}
          </button>
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">DESIGN & THEME</span>
        <p className="classic-tools-note">
          Pick the visual system for the whole app — chrome font, corner
          sharpness, and background texture. Your 9 life-mode colors stay
          the same no matter which one you pick.
        </p>

        <div className="design-system-grid">
          {DESIGN_SYSTEMS.map((system) => (
            <button
              key={system.key}
              className={`design-system-card ${settings.designSystem === system.key ? 'active' : ''}`}
              onClick={() =>
                setSettings((prev) => ({ ...prev, designSystem: system.key }))
              }
            >
              <h4>{system.name}</h4>
              <span className="design-system-tagline">{system.tagline}</span>
              <p>{system.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">COLOR PALETTE</span>
        <p className="classic-tools-note">
          A mood/intensity dial on top of everything else — your 9 mode
          colors and whichever design system you picked above stay exactly
          the same, this just turns them up or down.
        </p>

        <div className="design-system-grid">
          {COLOR_PALETTES.map((palette) => (
            <button
              key={palette.key}
              className={`design-system-card ${settings.colorPalette === palette.key ? 'active' : ''}`}
              onClick={() =>
                setSettings((prev) => ({ ...prev, colorPalette: palette.key }))
              }
            >
              <h4>{palette.name}</h4>
              <span className="design-system-tagline">{palette.tagline}</span>
              <p>{palette.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">CLASSIC TOOLS</span>
        <p className="classic-tools-note">
          The general Tasks, Goals, Notes, and Memory views still work
          — they're just tucked away here now that the sidebar focuses on
          life modes. Chat lives in the sidebar on every page now (hit the
          expand icon), or use the button below for the general assistant.
        </p>

        <div className="classic-tools-grid">
          <button onClick={() => setActivePage('Tasks')}>Tasks</button>
          <button onClick={() => setActivePage('Goals')}>Goals</button>
          <button onClick={() => setActivePage('Notes')}>Notes</button>
          <button onClick={() => setActivePage('Memory')}>Memory</button>
          <button onClick={openChat}>Chat</button>
        </div>

        <div className="setup-wizard-rerun">
          <div>
            <strong>Setup wizard</strong>
            <p>Re-run the first-time setup questions any time — nothing already
              tracked gets touched.</p>
          </div>
          <button onClick={() => setSettings((prev) => ({ ...prev, onboardingComplete: false }))}>
            Run setup wizard
          </button>
        </div>
      </div>
    </div>
  )
}
