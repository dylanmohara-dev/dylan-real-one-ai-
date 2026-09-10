import { useCallback, useState } from 'react'

const API = import.meta.env.DEV ? 'http://localhost:3001/api/calendar' : '/api/calendar'

async function request(endpoint, options = {}) {
  let response
  try {
    response = await fetch(`${API}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
  } catch (networkErr) {
    // The request never even reached a server -- backend not running,
    // wrong port, no network. Distinct from a server-side error, and a
    // completely different fix, so say so instead of falling into the
    // same generic "Something went wrong." as everything else below.
    throw new Error(`Could not reach the server (${networkErr.message}). Is the backend running?`, {
      cause: networkErr,
    })
  }

  const rawText = await response.text()
  let data
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch (parseErr) {
    // Response wasn't JSON at all -- almost always an Express default
    // error page (a crash, a body-size limit, something thrown outside
    // a route's own try/catch). Surfacing the status + a body snippet
    // here is the whole difference between "Something went wrong." (a
    // dead end) and an actual lead to fix -- same lesson as the
    // server-swallowing-its-own-errors bug found in an earlier session,
    // just on the frontend's side of the same mistake this time.
    throw new Error(
      `Server returned a non-JSON response (status ${response.status}): ${rawText.slice(0, 200) || '(empty body)'}`,
      { cause: parseErr }
    )
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (status ${response.status}).`)
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
      // A THIRD instance of the same bug class as the two fixed earlier:
      // this never cleared a previously-set `error`, so one transient
      // failure (a slow boot, a momentary blip) left "Something went
      // wrong." painted over an otherwise fully working calendar
      // permanently — nothing on the happy path ever took it back down.
      // Clearing it here means the banner reflects the LATEST load, not
      // whatever the worst load ever was.
      setError('')
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

  // Fetches one month's items WITHOUT touching monthItems/monthLoading —
  // used by the week view when the visible week straddles a month
  // boundary and needs a second month's data alongside the one already
  // loaded for the month view, without clobbering that shared state.
  const fetchMonthItems = useCallback(async (year, month) => {
    const data = await request(`/month?year=${year}&month=${month}`)
    return data.items || []
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await request('/status')
      setConnected(status.connected)
      setError('') // same fix as loadMonth above — a working status check clears any stale error
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
    fetchMonthItems,
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
