import { useEffect, useRef, useState } from 'react'
import { Download, ShieldCheck, RotateCcw } from 'lucide-react'
import { DESIGN_SYSTEMS, COLOR_PALETTES, LIFE_MODES } from '../data/lifeModes.js'

const API = 'http://localhost:3001/api'

// Extra keywords beyond the life area's own title to match against an
// existing iCloud calendar's name, for the "suggested match" helper below
// — e.g. a calendar literally named "Workouts" should still suggest Gym.
const MODE_MATCH_KEYWORDS = {
  school: ['school', 'class', 'academic', 'college'],
  sports: ['sports', 'team', 'athletics'],
  gym: ['gym', 'fitness', 'workout', 'lifting'],
  health: ['health', 'wellness', 'medical', 'doctor'],
  finance: ['finance', 'money', 'budget', 'bills'],
  skills: ['skills', 'hobby', 'lessons', 'practice'],
  reading: ['reading', 'books', 'book club'],
  discipline: ['discipline', 'habits', 'routine'],
  family: ['family', 'faith', 'church', 'kids', 'home'],
}

// Finds the first of Dylan's real iCloud calendars whose name plausibly
// matches a given life area, by simple case-insensitive substring
// matching against the area's title plus its keyword list above. This is
// intentionally simple (no fuzzy/edit-distance matching) — a false
// positive here would silently file real events under the wrong life
// area, so it only suggests, never auto-applies.
function suggestCalendarForMode(modeKey, modeTitle, calendars) {
  const keywords = [modeTitle.toLowerCase(), ...(MODE_MATCH_KEYWORDS[modeKey] || [])]
  return (
    calendars.find((cal) => {
      const name = (cal.displayName || '').toLowerCase()
      if (!name) return false
      return keywords.some((kw) => name.includes(kw) || kw.includes(name))
    }) || null
  )
}

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
    calendarMap,
    loadCalendars,
    chooseTargetCalendar,
    mapModeToCalendar,
  } = calendar
  const [targetError, setTargetError] = useState('')
  const [choosingTarget, setChoosingTarget] = useState(false)
  const [mappingMode, setMappingMode] = useState(null)
  const [mapError, setMapError] = useState('')
  const [refreshingCalendars, setRefreshingCalendars] = useState(false)

  useEffect(() => {
    if (calendarConnected) {
      loadCalendars().catch((err) => setTargetError(err.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConnected])

  // Manual refresh: the calendar list only auto-loads once, on mount --
  // creating a NEW calendar in the real Apple Calendar app while this page
  // is already open (exactly what happens the first time someone sets this
  // up) never shows up until this fires, since nothing else re-triggers it.
  async function handleRefreshCalendars() {
    setRefreshingCalendars(true)
    setTargetError('')
    try {
      await loadCalendars()
    } catch (err) {
      setTargetError(err.message)
    } finally {
      setRefreshingCalendars(false)
    }
  }

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

  async function handleMapMode(mode, url) {
    setMappingMode(mode)
    setMapError('')
    try {
      await mapModeToCalendar(mode, url)
    } catch (err) {
      setMapError(err.message)
    } finally {
      setMappingMode(null)
    }
  }

  // Applies every currently-suggested match at once, so setting up all 9
  // life areas isn't nine separate manual dropdown picks when Dylan's
  // calendar names already line up with them (e.g. calendars literally
  // named "School", "Gym", "Finance").
  async function handleMapAllSuggested(suggestions) {
    setMappingMode('__bulk__')
    setMapError('')
    try {
      for (const { mode, calendarUrl } of suggestions) {
        await mapModeToCalendar(mode, calendarUrl)
      }
    } catch (err) {
      setMapError(err.message)
    } finally {
      setMappingMode(null)
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

  // --- Restore from a backup file ---
  // Two steps, matching the calendar-delete pattern elsewhere in this app:
  // preview what the file contains first (no writes), then a separate
  // explicit confirm before anything actually overwrites current data.
  const fileInputRef = useRef(null)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restorePreview, setRestorePreview] = useState(null)
  const [restoreError, setRestoreError] = useState('')
  const [restorePreviewing, setRestorePreviewing] = useState(false)
  const [restoreConfirming, setRestoreConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)

  async function handleFileSelected(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setRestoreError('')
    setRestoreResult(null)
    setRestorePreview(null)
    setRestoreFile(null)
    setRestoreConfirming(false)
    setRestorePreviewing(true)
    try {
      const text = await file.text()
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('That file is not valid JSON.')
      }
      const response = await fetch(`${API}/backup/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not read that file.')
      setRestoreFile(parsed)
      setRestorePreview(body)
    } catch (err) {
      setRestoreError(err.message)
    } finally {
      setRestorePreviewing(false)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    setRestoreError('')
    try {
      const response = await fetch(`${API}/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: restoreFile, confirm: 'RESTORE' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Restore failed.')
      setRestoreResult(body)
      setRestoreConfirming(false)
      setRestoreFile(null)
      setRestorePreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // Pull the summary card up to date with what was just restored.
      fetch(`${API}/backup/summary`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) setBackupSummary(data)
        })
        .catch(() => {})
    } catch (err) {
      setRestoreError(err.message)
    } finally {
      setRestoring(false)
    }
  }

  function cancelRestore() {
    setRestoreFile(null)
    setRestorePreview(null)
    setRestoreConfirming(false)
    setRestoreError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Recomputed each render (cheap — 9 life areas against a short calendar
  // list) rather than memoized, since it needs to react to every mapping
  // change immediately.
  const suggestedMatches = calendars.length
    ? LIFE_MODES.filter((m) => !calendarMap[m.key])
        .map((m) => ({ mode: m.key, match: suggestCalendarForMode(m.key, m.title, calendars) }))
        .filter((s) => s.match)
        .map((s) => ({ mode: s.mode, calendarUrl: s.match.url, calendarName: s.match.displayName }))
    : []

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
        <div className="classic-tools-heading-row">
          <span className="eyebrow">CALENDAR — WRITE TARGET</span>
          {calendarConnected && (
            <button
              className="calendar-refresh-button"
              onClick={handleRefreshCalendars}
              disabled={refreshingCalendars || calendarsLoading}
              title="Just created or renamed a calendar in Apple Calendar? Click this to make it show up here."
            >
              <RotateCcw size={13} strokeWidth={2.25} />
              {refreshingCalendars ? 'Refreshing...' : 'Refresh calendars'}
            </button>
          )}
        </div>
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

            {!calendarsLoading && calendars.length > 0 && (
              <div className="calendar-mode-map">
                <p className="classic-tools-note">
                  Optional: map a specific life area to its OWN iCloud
                  calendar, so events you tag with that area get their own
                  color and label — both here and in Apple's own Calendar
                  app. Apple colors by calendar, not by event, so this is
                  the only way to get real per-area colors there. Anything
                  left unmapped uses the default calendar above and shows
                  up generically.
                </p>
                {mapError && <p className="journal-error">{mapError}</p>}

                {suggestedMatches.length > 0 && (
                  <button
                    className="calendar-mode-bulk-suggest"
                    onClick={() => handleMapAllSuggested(suggestedMatches)}
                    disabled={mappingMode === '__bulk__'}
                  >
                    {mappingMode === '__bulk__'
                      ? 'Mapping...'
                      : `Map all ${suggestedMatches.length} suggested match${suggestedMatches.length === 1 ? '' : 'es'}`}
                  </button>
                )}

                <div className="calendar-mode-rows">
                  {LIFE_MODES.map((m) => {
                    const suggestion = suggestedMatches.find((s) => s.mode === m.key)
                    return (
                      <div className="calendar-mode-row" key={m.key}>
                        <span className={`calendar-mode-row-label cal-mode-${m.key}`}>{m.title}</span>
                        <div className="calendar-mode-row-controls">
                          <select
                            value={calendarMap[m.key] || ''}
                            onChange={(e) => handleMapMode(m.key, e.target.value || null)}
                            disabled={mappingMode === m.key}
                          >
                            <option value="">Use default calendar</option>
                            {calendars.map((cal) => (
                              <option key={cal.url} value={cal.url}>{cal.displayName}</option>
                            ))}
                          </select>
                          {suggestion && (
                            <button
                              className="calendar-mode-suggest-button"
                              onClick={() => handleMapMode(m.key, suggestion.calendarUrl)}
                              disabled={mappingMode === m.key}
                              title={`Looks like it might match your "${suggestion.calendarName}" calendar`}
                            >
                              Use "{suggestion.calendarName}"?
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
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

        <div className="restore-card">
          <div className="restore-card-header">
            <RotateCcw size={18} strokeWidth={2} />
            <div>
              <strong>Restore from a backup file</strong>
              <p className="classic-tools-note">
                Pick a Dylan AI backup JSON file. You'll see exactly what's
                in it before anything is touched — nothing is overwritten
                until you confirm. Your current data is snapshotted
                automatically first, in case you change your mind.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            disabled={restorePreviewing || restoring}
            className="restore-file-input"
          />

          {restorePreviewing && <p className="mode-page-note">Reading file...</p>}

          {restoreError && <p className="journal-error">{restoreError}</p>}

          {restorePreview && !restoreResult && (
            <div className="restore-preview">
              <p>
                Exported {new Date(restorePreview.exportedAt).toLocaleString()} —{' '}
                {Object.values(restorePreview.counts).reduce((sum, n) => sum + n, 0)} items
                {' '}across {Object.keys(restorePreview.counts).length} categories.
              </p>

              {restorePreview.unknownKeys?.length > 0 && (
                <p className="backup-excluded-note">
                  Ignoring unrecognized keys: {restorePreview.unknownKeys.join(', ')}
                </p>
              )}

              <ul className="backup-counts">
                {Object.entries(restorePreview.counts)
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => (
                    <li key={key}>
                      {COLLECTION_LABELS[key] || key}: {count}
                    </li>
                  ))}
              </ul>

              {restoreConfirming ? (
                <div className="restore-confirm-row">
                  <span className="calendar-confirm-label">
                    This overwrites your current data with the file above. Continue?
                  </span>
                  <button className="calendar-confirm-yes" onClick={handleRestore} disabled={restoring}>
                    {restoring ? 'Restoring...' : 'Yes, restore'}
                  </button>
                  <button onClick={cancelRestore} disabled={restoring}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="restore-confirm-row">
                  <button className="backup-download-button" onClick={() => setRestoreConfirming(true)}>
                    Restore this backup
                  </button>
                  <button onClick={cancelRestore}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {restoreResult && (
            <p className="backup-last-export">
              Restored {restoreResult.restoredCollections.length} categories.
              Your previous data was snapshotted first — ask me if you need
              to find that file.
            </p>
          )}
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
