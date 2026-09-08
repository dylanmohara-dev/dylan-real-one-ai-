import { useCallback, useState } from 'react'

const API = 'http://localhost:3001/api/calendar'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.')
  }

  return data
}

export function useCalendar() {
  const [configured, setConfigured] = useState(null) // null = still checking
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadEvents = useCallback(async () => {
    try {
      const data = await request('/events')
      setEvents(data.events || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConfigured(status.configured)
      setConnected(status.connected)

      if (status.connected) {
        await loadEvents()
      }
    } catch (err) {
      setError(err.message)
    }
  }, [loadEvents])

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
      // best effort — clear local state regardless
    }

    setConnected(false)
    setEvents([])
  }

  return {
    configured,
    connected,
    events,
    error,
    loading,
    checkStatus,
    loadEvents,
    connect,
    disconnect,
  }
}
