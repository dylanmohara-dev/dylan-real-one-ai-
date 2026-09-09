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

function getTargetCalendarUrl() {
  const creds = loadCredentials()
  return creds?.targetCalendarUrl || null
}

function setTargetCalendarUrl(url) {
  const creds = loadCredentials()
  if (!creds) throw new Error('Apple Calendar is not connected')
  saveCredentials({ ...creds, targetCalendarUrl: url })
}

// Keep in sync with the 9 keys in src/data/lifeModes.js — duplicated here
// deliberately rather than importing frontend data into a server module.
const LIFE_MODE_KEYS = [
  'school', 'sports', 'gym', 'health', 'finance', 'skills', 'reading', 'discipline', 'family',
]

// Optional per-life-area override on top of the single default target
// calendar above. Apple's own Calendar app colors by CALENDAR, not by
// event — there is no per-event color in CalDAV/iCloud that Calendar.app
// will render — so genuine color-coding by life area in Apple's own app
// requires each area to point at its own calendar. Anything left unmapped
// falls back to the default target calendar and reads back as the
// generic 'calendar' bucket.
function getCalendarMap() {
  const creds = loadCredentials()
  return (creds && creds.calendarMap) || {}
}

function setCalendarModeMapping(mode, url) {
  if (!LIFE_MODE_KEYS.includes(mode)) {
    throw new Error(`Unknown life area "${mode}"`)
  }
  const creds = loadCredentials()
  if (!creds) throw new Error('Apple Calendar is not connected')
  const calendarMap = { ...(creds.calendarMap || {}) }
  if (url) {
    calendarMap[mode] = url
  } else {
    delete calendarMap[mode]
  }
  saveCredentials({ ...creds, calendarMap })
}

// Inverts { mode: calendarUrl } into { calendarUrl: mode } once per read,
// so mapObjectToEvents can tag each event by which calendar it lives in
// without doing an O(modes) lookup per event.
function invertCalendarMap(calendarMap) {
  const out = {}
  for (const [mode, url] of Object.entries(calendarMap)) {
    out[url] = mode
  }
  return out
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

// Shared by both listing functions below. Recurring occurrences all carry
// the SAME url/etag/uid as their parent VEVENT (expandRecurring spreads the
// parsed item, which has no url/etag of its own — those live on the DAV
// object wrapper) — deliberate, since editing or deleting a single
// occurrence of a recurring event isn't supported yet (see isRecurring
// below) and this keeps that restriction enforceable without extra
// bookkeeping.
function mapObjectToEvents(obj, calendar, rangeStart, rangeEnd, calendarUrlToMode = {}) {
  if (!obj.data) return []
  let parsed
  try {
    parsed = ical.parseICS(obj.data)
  } catch {
    return [] // one malformed .ics object shouldn't sink the whole calendar
  }

  const out = []
  for (const item of Object.values(parsed)) {
    if (item.type !== 'VEVENT') continue

    let occurrences
    if (item.rrule) {
      occurrences = expandRecurring(item, rangeStart, rangeEnd)
    } else if (item.start) {
      const when = new Date(item.start)
      occurrences = when >= rangeStart && when <= rangeEnd ? [item] : []
    } else {
      occurrences = []
    }

    for (const e of occurrences) {
      out.push({
        id: e.uid ? `${e.uid}-${new Date(e.start).toISOString()}` : `${calendar.url}-${e.start?.toISOString()}`,
        uid: e.uid || null,
        url: obj.url,
        etag: obj.etag,
        calendarUrl: calendar.url,
        calendar: calendar.displayName || 'Calendar',
        title: e.summary || '(no title)',
        start: e.start ? new Date(e.start).toISOString() : null,
        end: e.end ? new Date(e.end).toISOString() : null,
        allDay: Boolean(e.datetype === 'date'),
        location: e.location || '',
        // Which life area this event belongs to, resolved from which
        // calendar it lives in (see getCalendarMap/invertCalendarMap) —
        // 'calendar' is the generic, unmapped bucket, same as before this
        // existed.
        mode: calendarUrlToMode[calendar.url] || 'calendar',
        // Editing/deleting a single occurrence of a repeating event needs
        // RECURRENCE-ID exceptions in the ICS — real, but genuinely
        // separate scope from "write an event". Flagged read-only rather
        // than silently corrupting the rrule on an edit/delete aimed at
        // "just this one".
        isRecurring: Boolean(item.rrule),
      })
    }
  }
  return out
}

async function listUpcomingEvents({ maxResults = 20, daysAhead = 30 } = {}) {
  const client = await getClient()
  const calendars = await client.fetchCalendars()
  const calendarUrlToMode = invertCalendarMap(getCalendarMap())
  const now = new Date()
  const rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const results = await Promise.all(
    calendars.map(async (calendar) => {
      try {
        const objects = await client.fetchCalendarObjects({
          calendar,
          timeRange: { start: now.toISOString(), end: rangeEnd.toISOString() },
        })
        return objects.flatMap((obj) => mapObjectToEvents(obj, calendar, now, rangeEnd, calendarUrlToMode))
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

// listUpcomingEvents only ever looks forward from "now" and caps at 25
// results, which is fine for an agenda list and useless for a month grid —
// a grid needs the days already past in the current month, and any month
// you navigate to. This takes an explicit range instead.
async function listEventsInRange({ start, end }) {
  const client = await getClient()
  const calendars = await client.fetchCalendars()
  const calendarUrlToMode = invertCalendarMap(getCalendarMap())
  const rangeStart = new Date(start)
  const rangeEnd = new Date(end)

  const results = await Promise.all(
    calendars.map(async (calendar) => {
      try {
        const objects = await client.fetchCalendarObjects({
          calendar,
          timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
        })
        return objects.flatMap((obj) => mapObjectToEvents(obj, calendar, rangeStart, rangeEnd, calendarUrlToMode))
      } catch {
        return []
      }
    })
  )

  return results
    .flat()
    .filter((e) => e.start)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
}

async function listCalendars() {
  const client = await getClient()
  const calendars = await client.fetchCalendars()
  const targetUrl = getTargetCalendarUrl()
  const urlToMode = invertCalendarMap(getCalendarMap())
  return calendars.map((cal) => ({
    url: cal.url,
    displayName: cal.displayName || 'Calendar',
    isTarget: cal.url === targetUrl,
    // Which life area (if any) this calendar is currently mapped to.
    mappedMode: urlToMode[cal.url] || null,
  }))
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// UTC basic format (YYYYMMDDTHHMMSSZ) for timed events — no TZID needed, no
// timezone-database mismatch possible, at the cost of iCloud showing the
// event keyed to UTC internally (which is exactly how the rest of this app
// already stores every date). All-day events use the DATE value type
// instead, which is genuinely dateless — matching how Apple Calendar
// treats them, rather than pinning them to midnight-somewhere.
function toICalUTC(isoString) {
  const d = new Date(isoString)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function toICalDate(isoString) {
  const d = new Date(isoString)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function escapeICalText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildICal({ uid, title, start, end, allDay, location, stamp }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dylan AI//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ]
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(start)}`)
    lines.push(`DTEND;VALUE=DATE:${toICalDate(end || start)}`)
  } else {
    lines.push(`DTSTART:${toICalUTC(start)}`)
    lines.push(`DTEND:${toICalUTC(end || start)}`)
  }
  lines.push(`SUMMARY:${escapeICalText(title)}`)
  if (location) lines.push(`LOCATION:${escapeICalText(location)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

// Writes go to whichever calendar the chosen life area is mapped to in
// Settings (see setCalendarModeMapping); with no mode, or a mode that has
// no mapping of its own, they fall back to the single default target
// calendar (see setTargetCalendarUrl) — never "whichever calendar seems
// right" or a silent guess. Neither one chosen yet is a hard stop.
async function resolveCalendarForMode(client, mode) {
  const calendarMap = getCalendarMap()
  const preferredUrl = (mode && calendarMap[mode]) || getTargetCalendarUrl()
  if (!preferredUrl) {
    throw new Error('No calendar chosen yet — pick a default calendar in Settings before adding events.')
  }
  const calendars = await client.fetchCalendars()
  const calendar = calendars.find((c) => c.url === preferredUrl)
  if (!calendar) {
    throw new Error('The calendar for this is no longer available on your account. Check Settings.')
  }
  return calendar
}

async function createEvent({ title, start, end, allDay, location, mode }) {
  if (!title?.trim()) throw new Error('Title is required')
  if (!start) throw new Error('Start is required')

  const client = await getClient()
  const calendar = await resolveCalendarForMode(client, mode)

  const uid = `dylan-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dylan-ai`
  const stamp = toICalUTC(new Date().toISOString())
  const iCalString = buildICal({ uid, title: title.trim(), start, end, allDay, location, stamp })

  const response = await client.createCalendarObject({
    calendar,
    iCalString,
    filename: `${uid}.ics`,
  })
  if (!response.ok) {
    throw new Error(`iCloud rejected the new event (${response.status}).`)
  }
  return { uid }
}

async function updateEvent({ url, etag, uid, title, start, end, allDay, location }) {
  if (!url || !uid) throw new Error('Missing event reference')
  if (!title?.trim()) throw new Error('Title is required')
  if (!start) throw new Error('Start is required')

  const stamp = toICalUTC(new Date().toISOString())
  const iCalString = buildICal({ uid, title: title.trim(), start, end, allDay, location, stamp })

  const client = await getClient()
  const response = await client.updateCalendarObject({
    calendarObject: { url, etag, data: iCalString },
  })
  if (!response.ok) {
    throw new Error(
      response.status === 412
        ? 'This event changed elsewhere (Apple Calendar or another device) since you loaded it — refresh and try again rather than overwriting that change.'
        : `iCloud rejected the update (${response.status}).`
    )
  }
}

async function deleteEvent({ url, etag }) {
  if (!url) throw new Error('Missing event reference')
  const client = await getClient()
  const response = await client.deleteCalendarObject({ calendarObject: { url, etag } })
  if (!response.ok && response.status !== 404) {
    throw new Error(
      response.status === 412
        ? 'This event changed elsewhere since you loaded it — refresh and try again rather than deleting blind.'
        : `iCloud rejected the delete (${response.status}).`
    )
  }
}

export {
  connect,
  listUpcomingEvents,
  listEventsInRange,
  listCalendars,
  getTargetCalendarUrl,
  setTargetCalendarUrl,
  getCalendarMap,
  setCalendarModeMapping,
  createEvent,
  updateEvent,
  deleteEvent,
  isConnected,
  clearCredentials,
}
