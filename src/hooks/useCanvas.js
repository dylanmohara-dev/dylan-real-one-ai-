import { useCallback, useState } from 'react'

// See useAppData.js's API constant for why this needs the DEV check -- a
// hardcoded localhost:3001 breaks this feature entirely once accessed
// through a tunnel/phone, since '/api' isn't the fallback, it's the fix.
const API = '/api/canvas'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

// Session 43 bugfix: sync-calendar is only SAFE to call one-at-a-time, not
// actually idempotent under concurrency the way the comment below used to
// claim. Every independent component that mounts useCanvas() (Overview,
// Calendar, School...) was firing its own autoSyncToCalendar() on mount --
// confirmed live via this session's own network log, 4 near-simultaneous
// POST /sync-calendar calls from loading just 2 pages. Two overlapping
// calls can each read the SAME not-yet-updated etag for the same linked
// Canvas assignment from canvas_calendar_links.json; the first request to
// reach iCloud succeeds and changes that event's etag server-side, the
// second then gets a 412 "changed elsewhere" conflict, whose own
// documented fallback (lib/calendarAutoSync.js) is to create a brand-new
// event rather than fail -- that's the actual mechanism that's been
// quietly duplicating events onto Dylan's real "Dylan AI" calendar every
// time he's used the app (confirmed: hundreds of duplicate entries now
// visible in the Calendar month view, far more than the 30 Canvas
// assignments this app actually tracks). Module-level (not per-hook-
// instance) state because the race is BETWEEN separate component
// instances, not within one: a per-instance useState lock can't see a
// concurrent call from a different mounted component.
let inFlightSync = null
let lastAutoSyncAt = 0
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000 // Canvas due dates don't change minute-to-minute

function syncCalendarSerialized() {
  if (!inFlightSync) {
    inFlightSync = request('/sync-calendar', { method: 'POST' }).finally(() => {
      inFlightSync = null
    })
  }
  return inFlightSync
}

export function useCanvas() {
  // configured is always true here (no OAuth app to set up) -- kept in the
  // same shape as the other integration hooks so shared rendering logic
  // elsewhere isn't a special case for Canvas alone.
  const [configured, setConfigured] = useState(true)
  const [connected, setConnected] = useState(false)
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Best-effort, silent push of due dates onto the real calendar every
  // time assignments are (re)loaded -- separate from the user-facing
  // syncToCalendar below (which drives the Connections page's "Syncing..."
  // button) so this background pass never flickers that button or surfaces
  // its own errors. Dylan's actual complaint was that Canvas showed as
  // connected but never appeared on the calendar or in School -- because
  // syncing was previously only a manual button buried on a different page.
  // Serialized through the module-level guard above (never two in flight
  // at once) and cooldown-throttled (skips entirely if the last auto-sync
  // ran under 5 minutes ago) -- this is what actually makes repeat calls
  // safe, not just calling the endpoint itself.
  async function autoSyncToCalendar() {
    if (Date.now() - lastAutoSyncAt < AUTO_SYNC_COOLDOWN_MS) return
    lastAutoSyncAt = Date.now()
    try {
      await syncCalendarSerialized()
    } catch {
      // best-effort -- the manual "Sync due dates to calendar" button on
      // Connections still surfaces a real error if this keeps failing.
    }
  }

  // Reconciles Dylan's real Canvas course roster into the local `classes`
  // list (see routes/canvas.js's /sync-classes for the matching logic) so
  // Canvas assignments have a real class to be filed under in School,
  // not just the flat top-level "Coming up" list. Returns whether it
  // actually changed anything, so the caller can decide whether the rest
  // of the app's data (which owns `classes`) needs to reload.
  async function syncClasses() {
    try {
      const result = await request('/sync-classes', { method: 'POST' })
      return Boolean(result.linked || result.created)
    } catch {
      // best-effort -- Canvas assignments still show in the flat "Coming
      // up" list even if this fails, they just won't be under a class yet.
      return false
    }
  }

  const loadAssignments = useCallback(async () => {
    try {
      const data = await request('/assignments')
      setAssignments(data.assignments || [])
      autoSyncToCalendar()
      await syncClasses()
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConfigured(status.configured)
      setConnected(status.connected)
      if (status.connected) await loadAssignments()
    } catch (err) {
      setError(err.message)
    }
  }, [loadAssignments])

  async function connect(domain, token) {
    setError('')
    setLoading(true)
    try {
      await request('/connect', { method: 'POST', body: JSON.stringify({ domain, token }) })
      setConnected(true)
      await loadAssignments()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function syncToCalendar() {
    setSyncing(true)
    setError('')
    try {
      // Manual click always actually runs (no cooldown -- Dylan asked for
      // this one), but still goes through the same serialized guard so it
      // can never race a background autoSyncToCalendar() from another
      // mounted component.
      await syncCalendarSerialized()
      lastAutoSyncAt = Date.now()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    try {
      await request('/disconnect', { method: 'POST' })
    } catch {
      // best effort
    }
    setConnected(false)
    setAssignments([])
  }

  return {
    configured,
    connected,
    assignments,
    error,
    loading,
    syncing,
    checkStatus,
    loadAssignments,
    syncClasses,
    connect,
    syncToCalendar,
    disconnect,
  }
}
