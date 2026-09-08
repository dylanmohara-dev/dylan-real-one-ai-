// Thin wrapper around Google's OAuth2 + Calendar v3 REST APIs.
// Deliberately dependency-free (Node 24 has global fetch) rather than pulling
// in the full `googleapis` SDK for a handful of endpoints.
import { loadData, saveData } from './dataStore.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const EVENTS_URL = (calendarId) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/oauth2callback'
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

function loadTokens() {
  const stored = loadData('calendar_tokens')
  return Array.isArray(stored) ? null : stored && stored.access_token ? stored : null
}

function saveTokens(tokens) {
  saveData('calendar_tokens', tokens)
}

function clearTokens() {
  saveData('calendar_tokens', {})
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
    refresh_token: json.refresh_token, // only present on first consent
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
  const refreshed = {
    ...tokens,
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
  }
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

async function googleGet(url) {
  const accessToken = await getValidAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Google Calendar request failed')
  return json
}

async function listUpcomingEvents({ maxResults = 20 } = {}) {
  const calendarList = await googleGet(`${CALENDAR_LIST_URL}?minAccessRole=reader`)
  const calendars = (calendarList.items || []).filter((cal) => cal.selected !== false)
  const now = new Date().toISOString()
  const results = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const params = new URLSearchParams({
          timeMin: now,
          maxResults: String(maxResults),
          singleEvents: 'true',
          orderBy: 'startTime',
        })
        const data = await googleGet(`${EVENTS_URL(cal.id)}?${params.toString()}`)
        return (data.items || []).map((event) => ({
          id: event.id,
          calendar: cal.summary,
          title: event.summary || '(no title)',
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          allDay: Boolean(event.start?.date && !event.start?.dateTime),
          location: event.location || '',
          htmlLink: event.htmlLink,
        }))
      } catch {
        return [] // one bad/inaccessible calendar shouldn't 500 the whole request
      }
    })
  )
  return results
    .flat()
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, maxResults)
}

function isConnected() {
  const tokens = loadTokens()
  return Boolean(tokens?.refresh_token)
}

export { getConfig, buildAuthUrl, exchangeCodeForTokens, listUpcomingEvents, isConnected, clearTokens }
