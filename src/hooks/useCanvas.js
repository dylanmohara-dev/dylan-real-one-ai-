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

  const loadAssignments = useCallback(async () => {
    try {
      const data = await request('/assignments')
      setAssignments(data.assignments || [])
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
    connect,
    syncToCalendar,
    disconnect,
  }
}
