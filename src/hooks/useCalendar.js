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
  const [connected, setConnected] = useState(false)
  const [checked, setChecked] = useState(false) // false until the first status check resolves
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // The month grid's data: every dated thing the app knows about for one
  // month, from one request (see GET /calendar/month).
  const [monthItems, setMonthItems] = useState([])
  const [monthLoading, setMonthLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')

  const loadEvents = useCallback(async () => {
    try {
      const data = await request('/events')
      setEvents(data.events || [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const loadMonth = useCallback(async (year, month) => {
    setMonthLoading(true)
    try {
      const data = await request(`/month?year=${year}&month=${month}`)
      setMonthItems(data.items || [])
      // A failure to reach iCloud does NOT empty the month — local items
      // still come back — so this is surfaced as a notice, not an error.
      setCalendarError(data.calendarError || '')
    } catch (err) {
      setError(err.message)
      setMonthItems([])
    } finally {
      setMonthLoading(false)
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConnected(status.connected)
      if (status.connected) await loadEvents()
    } catch (err) {
      setError(err.message)
    } finally {
      setChecked(true)
    }
  }, [loadEvents])

  // Unlike Gmail/Drive/Slack, there's no OAuth redirect here — CalDAV is
  // Basic Auth, so "connecting" means submitting a form with the Apple ID
  // and an app-specific password directly.
  async function connect(appleId, appPassword) {
    setError('')
    setLoading(true)
    try {
      await request('/connect', {
        method: 'POST',
        body: JSON.stringify({ appleId, appPassword }),
      })
      setConnected(true)
      await loadEvents()
      return true
    } catch (err) {
      setError(err.message)
      return false
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
    checked,
    connected,
    events,
    monthItems,
    monthLoading,
    calendarError,
    loadMonth,
    error,
    loading,
    checkStatus,
    loadEvents,
    connect,
    disconnect,
  }
}
