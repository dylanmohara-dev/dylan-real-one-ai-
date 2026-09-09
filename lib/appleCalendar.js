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
// Guards against a very common real-world gotcha: copy-pasting a password
// from somewhere that silently swaps a plain hyphen for an en/em dash, adds
// a non-breaking space, or drags in a stray decorative character (arrows,
// bullets, zero-width space) from whatever it was copied out of. Rather than
// just failing, we self-heal the obvious cases (Apple app-specific passwords
// are always exactly 4 lowercase-letter groups separated by hyphens, e.g.
// "abcd-efgh-ijkl-mnop") and only throw once we're sure it's not salvageable.
function findNonAsciiChar(label, value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code > 127) {
      throw new Error(
        `${label} contains a non-standard character at position ${i + 1} (code point U+${code.toString(16).toUpperCase().padStart(4, '0')}). ` +
        `This usually happens from copy-pasting — try retyping ${label.toLowerCase()} by hand instead.`
      )
    }
  }
}

const APP_PASSWORD_PATTERN = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/

// Normalizes a pasted app-specific password: drops zero-width/invisible
// characters, folds en/em/minus dashes to a plain hyphen, strips whitespace,
// and lowercases. If what's left doesn't match Apple's known format, we
// throw with the cleaned-up string shown so the user can see exactly what
// survived the cleanup (rather than guessing what was wrong with the raw
// paste).
function sanitizeAppPassword(raw) {
  const cleaned = raw
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/[\u2010-\u2015\u2212]/g, '-')      // hyphen/dash lookalikes
    .replace(/\s+/g, '')                           // any whitespace, incl. NBSP
    .toLowerCase()

  if (!APP_PASSWORD_PATTERN.test(cleaned)) {
    throw new Error(
      `App-specific password doesn't look like Apple's format (xxxx-xxxx-xxxx-xxxx) even after cleaning up whitespace and dash characters. ` +
      `After cleanup it read: "${cleaned}". Generate a fresh one at appleid.apple.com under Sign-In and Security, and retype it by hand.`
    )
  }
  return cleaned
}

async function connect({ appleId, appPassword }) {
  if (!appleId?.trim() || !appPassword?.trim()) {
    throw new Error('Apple ID and app-specific password are both required')
  }
  findNonAsciiChar('Apple ID', appleId.trim())
  const cleanedPassword = sanitizeAppPassword(appPassword.trim())
  const client = await createDAVClient({
    serverUrl: SERVER_URL,
    credentials: { username: appleId.trim(), password: cleanedPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  const calendars = await client.fetchCalendars()
  if (!Array.isArray(calendars)) throw new Error('Unexpected response from iCloud')
  saveCredentials({ appleId: appleId.trim(), appPassword: cleanedPassword })
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
