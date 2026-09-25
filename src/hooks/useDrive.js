import { useCallback, useState } from 'react'

// See useAppData.js's API constant for why this needs the DEV check --
// a hardcoded localhost:3001 breaks this feature entirely once accessed
// through a tunnel/phone, since '/api' isn't the fallback, it's the fix.
const API = '/api/drive'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

export function useDrive() {
  const [configured, setConfigured] = useState(null)
  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    try {
      const data = await request('/files')
      setFiles(data.files || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConfigured(status.configured)
      setConnected(status.connected)
      if (status.connected) await loadFiles()
    } catch (err) {
      setError(err.message)
    }
  }, [loadFiles])

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
    setFiles([])
  }

  return { configured, connected, files, error, loading, checkStatus, loadFiles, connect, disconnect }
}
