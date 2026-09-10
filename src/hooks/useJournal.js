import { useCallback, useState } from 'react'

// See useAppData.js's API constant for why this needs the DEV check --
// a hardcoded localhost:3001 breaks this feature entirely once accessed
// through a tunnel/phone, since '/api' isn't the fallback, it's the fix.
const API = import.meta.env.DEV ? 'http://localhost:3001/api/journal' : '/api/journal'

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

export function useJournal() {
  const [hasPasscode, setHasPasscode] = useState(null) // null = still checking
  const [unlocked, setUnlocked] = useState(false)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadEntries = useCallback(async () => {
    try {
      const data = await request('/entries')
      setEntries(data.entries || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setHasPasscode(status.hasPasscode)
      setUnlocked(status.unlocked)

      if (status.unlocked) {
        await loadEntries()
      }
    } catch (err) {
      setError(err.message)
    }
  }, [loadEntries])

  async function setupPasscode(passcode) {
    setError('')
    setLoading(true)

    try {
      await request('/setup', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      })

      setHasPasscode(true)
      setUnlocked(true)
      await loadEntries()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function unlock(passcode) {
    setError('')
    setLoading(true)

    try {
      await request('/unlock', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      })

      setUnlocked(true)
      await loadEntries()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function lock() {
    try {
      await request('/lock', { method: 'POST' })
    } catch {
      // Best effort — the UI still locks locally even if the request fails.
    }

    setUnlocked(false)
    setEntries([])
  }

  async function addEntry(content) {
    if (!content.trim()) return

    setLoading(true)

    try {
      await request('/entries', {
        method: 'POST',
        body: JSON.stringify({ content }),
      })

      await loadEntries()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteEntry(id) {
    try {
      await request(`/entries/${id}`, { method: 'DELETE' })
      await loadEntries()
    } catch (err) {
      setError(err.message)
    }
  }

  return {
    hasPasscode,
    unlocked,
    entries,
    error,
    loading,
    checkStatus,
    setupPasscode,
    unlock,
    lock,
    addEntry,
    deleteEntry,
  }
}
