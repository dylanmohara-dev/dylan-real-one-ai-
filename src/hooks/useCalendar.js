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
      // Used to also call loadEvents() here to populate the old flat event
      // list. That list was replaced by the month grid (loadMonth), but this
      // call was left behind — so a flaky/failing hit to the OLD /events
      // endpoint was throwing a scary "Something went wrong" banner over a
      // page that was otherwise working fine via /calendar/month. Nothing
      // in the UI reads `events` anymore; not calling it is the fix, not
      // hardening the call.
    } catch (err) {
      setError(err.message)
    } finally {
      setChecked(true)
    }
  }, [])

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

  // --- Target calendar (Settings) + writes. Every one of these round-trips
  // to real iCloud data — none of it is optimistic/local-first, on purpose:
  // showing Dylan a change that then silently fails to actually save would
  // be worse than a visible loading state.
  const [calendars, setCalendars] = useState([])
  const [targetCalendarUrl, setTargetCalendarUrlState] = useState(null)
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  // Optional per-life-area override: { school: url, health: url, ... }.
  // Anything not in here falls back to targetCalendarUrl above.
  const [calendarMap, setCalendarMapState] = useState({})

  const loadCalendars = useCallback(async () => {
    setCalendarsLoading(true)
    try {
      const data = await request('/calendars')
      setCalendars(data.calendars || [])
      setTargetCalendarUrlState(data.targetCalendarUrl || null)
      setCalendarMapState(data.calendarMap || {})
    } finally {
      setCalendarsLoading(false)
    }
    // Deliberately NOT catching here (unlike checkStatus/connect above):
    // this used to swallow into the shared `error` state, which Settings
    // never reads — so a failed fetch and a genuinely empty calendar list
    // rendered the exact same "No calendars found" message, one of them a
    // lie. Letting it throw means the caller (Settings) can tell those two
    // states apart and show what actually happened.
  }, [])

  async function chooseTargetCalendar(url) {
    await request('/calendars/target', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
    setTargetCalendarUrlState(url)
  }

  // Maps one life area to one of Dylan's iCloud calendars (or clears it
  // back to "use default" when url is null). This is what makes events
  // for that area color/label separately, both here and in Apple's own
  // Calendar app, once that calendar exists and is mapped.
  async function mapModeToCalendar(mode, url) {
    await request('/calendars/map', {
      method: 'POST',
      body: JSON.stringify({ mode, url }),
    })
    setCalendarMapState((prev) => {
      const next = { ...prev }
      if (url) next[mode] = url
      else delete next[mode]
      return next
    })
  }

  async function createEvent(fields) {
    await request('/events', { method: 'POST', body: JSON.stringify(fields) })
  }

  async function updateEvent(fields) {
    await request('/events/update', { method: 'POST', body: JSON.stringify(fields) })
  }

  // The literal 'DELETE' confirm string is enforced again on the server —
  // this isn't the only guard, it's the one that lets the UI ask "are you
  // sure" without also having to re-derive server trust from a boolean.
  async function deleteEvent({ url, etag }) {
    await request('/events/delete', {
      method: 'POST',
      body: JSON.stringify({ url, etag, confirm: 'DELETE' }),
    })
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
    calendars,
    calendarsLoading,
    targetCalendarUrl,
    calendarMap,
    loadCalendars,
    chooseTargetCalendar,
    mapModeToCalendar,
    createEvent,
    updateEvent,
    deleteEvent,
  }
}
