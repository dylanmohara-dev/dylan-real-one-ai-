import { useCallback, useState } from 'react'

const API = 'http://localhost:3001/api/slack'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

export function useSlack() {
  const [configured, setConfigured] = useState(null)
  const [connected, setConnected] = useState(false)
  const [conversations, setConversations] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadConversations = useCallback(async () => {
    try {
      const data = await request('/unread')
      setConversations(data.conversations || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConfigured(status.configured)
      setConnected(status.connected)
      if (status.connected) await loadConversations()
    } catch (err) {
      setError(err.message)
    }
  }, [loadConversations])

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
    setConversations([])
  }

  return { configured, connected, conversations, error, loading, checkStatus, loadConversations, connect, disconnect }
}
