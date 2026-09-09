// iCloud Calendar via CalDAV — a completely different shape from the Google
// integrations: no OAuth redirect, just Basic Auth with an Apple ID + an
// app-specific password (generated at appleid.apple.com, required whenever
// two-factor is on — which it should be). We verify credentials by actually
// fetching calendars once at connect time, then store them locally the same
// way tokens are stored elsewhere in this app.
import { createDAVClient } from 'tsdav'
import ical from 'node-ical'
import { loadData, saveData } from './dataStore.js'

const SERVER_URL = 'https://caldav.icloud.com'

function loadCredentials() {
  const stored = loadData('apple_calendar_credentials')
  return Array.isArray(stored) ? null : stored && stored.appleId ? stored : null
}

function saveCredentials(creds) {
  saveData('apple_calendar_credentials', creds)
}

function clearCredentials() {
  saveData('apple_calendar_credentials', {})
}

function isConnected() {
  return Boolean(loadCredentials())
}

async function getClient() {
  const creds = loadCredentials()
  if (!creds) throw new Error('Apple Calendar is not connected')
  return createDAVClient({
    serverUrl: SERVER_URL,
    credentials: { username: creds.appleId, password: creds.appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

// Called when the user submits the connect form. Throws with a clear message
// on bad credentials rather than silently "succeeding" with nothing stored.
async function connect({ appleId, appPassword }) {
  if (!appleId?.trim() || !appPassword?.trim()) {
    throw new Error('Apple ID and app-specific password are both required')
  }
  const client = await createDAVClient({
    serverUrl: SERVER_URL,
    credentials: { username: appleId.trim(), password: appPassword.trim() },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  const calendars = await client.fetchCalendars()
  if (!Array.isArray(calendars)) throw new Error('Unexpected response from iCloud')
  saveCredentials({ appleId: appleId.trim(), appPassword: appPassword.trim() })
  return { calendarCount: calendars.length }
}

// Expands a recurring VEVENT's rrule into individual occurrences inside
// [rangeStart, rangeEnd]. node-ical gives us an rrule.js instance directly
// on the parsed event when one exists.
function expandRecurring(event, rangeStart, rangeEnd) {
  if (!event.rrule) return []
  const durationMs = event.end && event.start ? event.end.getTime() - event.start.getTime() : 0
  let starts
  try {
    starts = event.rrule.between(rangeStart, rangeEnd, true)
  } catch {
    return []
  }
  return starts.map((start) => ({
    ...event,
    start,
    end: new Date(start.getTime() + durationMs),
  }))
}

async function listUpcomingEvents({ maxResults = 20, daysAhead = 30 } = {}) {
  const client = await getClient()
  const calendars = await client.fetchCalendars()
  const now = new Date()
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const results = await Promise.all(
    calendars.map(async (calendar) => {
      try {
        const objects = await client.fetchCalendarObjects({
          calendar,
          timeRange: { start: now.toISOString(), end: rangeEnd.toISOString() },
        })
        const events = []
        for (const obj of objects) {
          if (!obj.data) continue
          let parsed
          try {
            parsed = ical.parseICS(obj.data)
          } catch {
            continue // one malformed .ics object shouldn't sink the whole calendar
          }
          for (const item of Object.values(parsed)) {
            if (item.type !== 'VEVENT') continue
            if (item.rrule) {
              events.push(...expandRecurring(item, now, rangeEnd))
            } else if (item.start && item.start >= now) {
              events.push(item)
            }
          }
        }
        return events.map((e) => ({
          id: e.uid || `${calendar.url}-${e.start?.toISOString()}`,
          calendar: calendar.displayName || 'Calendar',
          title: e.summary || '(no title)',
          start: e.start ? new Date(e.start).toISOString() : null,
          end: e.end ? new Date(e.end).toISOString() : null,
          allDay: Boolean(e.datetype === 'date'),
          location: e.location || '',
        }))
      } catch {
        return [] // one bad/inaccessible calendar shouldn't 500 the whole request
      }
    })
  )

  return results
    .flat()
    .filter((e) => e.start)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, maxResults)
}

export { connect, listUpcomingEvents, isConnected, clearCredentials }
