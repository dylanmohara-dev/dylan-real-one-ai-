import { useCallback, useState } from 'react'

// See useAppData.js's API constant for why this needs the DEV check --
// a hardcoded localhost:3001 breaks this feature entirely once accessed
// through a tunnel/phone, since '/api' isn't the fallback, it's the fix.
const API = '/api/gmail'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

export function useGmail() {
  const [configured, setConfigured] = useState(null)
  const [connected, setConnected] = useState(false)
  const [threads, setThreads] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadThreads = useCallback(async () => {
    try {
      const data = await request('/needs-reply')
      setThreads(data.threads || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConfigured(status.configured)
      setConnected(status.connected)
      if (status.connected) await loadThreads()
    } catch (err) {
      setError(err.message)
    }
  }, [loadThreads])

  async function connect() {
    setError('')
    setLoading(true)
    try {
      const { url } = await request('/auth-url')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    try {
      await request('/disconnect', { method: 'POST' })
    } catch {
      // best effort
    }
    setConnected(false)
    setThreads([])
  }

  return { configured, connected, threads, error, loading, checkStatus, loadThreads, connect, disconnect }
}
