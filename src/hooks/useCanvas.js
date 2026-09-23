import { useCallback, useState } from 'react'

// See useAppData.js's API constant for why this needs the DEV check -- a
// hardcoded localhost:3001 breaks this feature entirely once accessed
// through a tunnel/phone, since '/api' isn't the fallback, it's the fix.
const API = import.meta.env.DEV ? 'http://localhost:3001/api/canvas' : '/api/canvas'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
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
  // sync-calendar is idempotent (updates the same linked event by Canvas
  // assignment id rather than duplicating it), so calling it on every load
  // is safe, not just on first connect.
  async function autoSyncToCalendar() {
    try {
      await request('/sync-calendar', { method: 'POST' })
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
      await request('/sync-calendar', { method: 'POST' })
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
