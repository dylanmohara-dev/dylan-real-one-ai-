// Thin wrapper around Google Calendar v3, read-only. Same OAuth pattern as
// lib/googleDrive.js and lib/gmail.js -- its own scope, redirect URI, and
// token record so it connects/disconnects independently. Deliberately
// separate from lib/appleCalendar.js, which is the WRITE-side sync target
// ("Dylan AI" iCloud calendar) -- this is a READ-only view of Dylan's own
// Google Calendar, if he keeps one, shown on the Connections page the same
// way Gmail/Drive already are.
import { loadData, saveData } from './dataStore.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3001/api/google-calendar/oauth2callback'
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

function loadTokens() {
  const stored = loadData('google_calendar_tokens')
  return Array.isArray(stored) ? null : stored && stored.access_token ? stored : null
}

function saveTokens(tokens) {
  saveData('google_calendar_tokens', tokens)
}

function clearTokens() {
  saveData('google_calendar_tokens', {})
}

function buildAuthUrl() {
  const { clientId, redirectUri, configured } = getConfig()
  if (!configured) throw new Error('Google OAuth credentials are not configured')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getConfig()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token exchange failed')
  const tokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    scope: json.scope,
  }
  const existing = loadTokens()
  if (!tokens.refresh_token && existing?.refresh_token) tokens.refresh_token = existing.refresh_token
  saveTokens(tokens)
  return tokens
}

async function refreshAccessToken(tokens) {
  const { clientId, clientSecret } = getConfig()
  if (!tokens.refresh_token) throw new Error('No refresh token on file; reconnect Google Calendar')
  const body = new URLSearchParams({
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token refresh failed')
  const refreshed = { ...tokens, access_token: json.access_token, expires_at: Date.now() + (json.expires_in || 3600) * 1000 }
  saveTokens(refreshed)
  return refreshed
}

async function getValidAccessToken() {
  let tokens = loadTokens()
  if (!tokens) throw new Error('Google Calendar is not connected')
  if (Date.now() > tokens.expires_at - 60000) {
    tokens = await refreshAccessToken(tokens)
  }
  return tokens.access_token
}

async function calendarGet(url) {
  const accessToken = await getValidAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Google Calendar request failed')
  return json
}

// Upcoming events on Dylan's primary Google Calendar, soonest first --
// same "just the next handful" shape as Gmail's needs-reply threads and
// Drive's recent files, not a full calendar view (that's what the
// app-wide Calendar page, backed by Apple/iCloud, already is).
async function listUpcomingEvents({ maxResults = 10 } = {}) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    orderBy: 'startTime',
    singleEvents: 'true',
    timeMin: new Date().toISOString(),
  })
  const data = await calendarGet(`${EVENTS_URL}?${params.toString()}`)
  return (data.items || []).map((event) => ({
    id: event.id,
    title: event.summary || '(no title)',
    start: event.start?.dateTime || event.start?.date || null,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    htmlLink: event.htmlLink,
  }))
}

function isConnected() {
  const tokens = loadTokens()
  return Boolean(tokens?.refresh_token)
}

export { getConfig, buildAuthUrl, exchangeCodeForTokens, listUpcomingEvents, isConnected, clearTokens }
