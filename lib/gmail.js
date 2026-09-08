// Thin wrapper around Gmail's REST API, read-only. Mirrors lib/googleCalendar.js's
// OAuth pattern exactly (separate token record, separate scope, separate
// redirect URI) so Gmail can be connected/disconnected independently of
// Calendar even though both go through Google.
import { loadData, saveData } from './dataStore.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/gmail/oauth2callback'
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

function loadTokens() {
  const stored = loadData('gmail_tokens')
  return Array.isArray(stored) ? null : stored && stored.access_token ? stored : null
}

function saveTokens(tokens) {
  saveData('gmail_tokens', tokens)
}

function clearTokens() {
  saveData('gmail_tokens', {})
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
  if (!tokens.refresh_token) throw new Error('No refresh token on file; reconnect Gmail')
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
  if (!tokens) throw new Error('Gmail is not connected')
  if (Date.now() > tokens.expires_at - 60000) {
    tokens = await refreshAccessToken(tokens)
  }
  return tokens.access_token
}

async function gmailGet(url) {
  const accessToken = await getValidAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Gmail request failed')
  return json
}

function headerValue(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// A thread "needs a reply" if its most recent message was not sent by the
// account owner. We fetch each candidate thread's full message list (cheap:
// metadata format only) and look at the last message's From header.
async function listNeedsReplyThreads({ maxResults = 8 } = {}) {
  const profile = await gmailGet(`${GMAIL_BASE}/profile`)
  const myEmail = (profile.emailAddress || '').toLowerCase()

  const query = 'in:inbox -in:chats newer_than:30d -category:promotions -category:social -category:updates -category:forums'
  const list = await gmailGet(`${GMAIL_BASE}/threads?q=${encodeURIComponent(query)}&maxResults=25`)
  const threadStubs = list.threads || []

  const results = []
  for (const stub of threadStubs) {
    try {
      const thread = await gmailGet(`${GMAIL_BASE}/threads/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
      const messages = thread.messages || []
      if (messages.length === 0) continue
      const last = messages[messages.length - 1]
      const from = headerValue(last.payload?.headers, 'From')
      if (from.toLowerCase().includes(myEmail)) continue // last word was ours; not waiting on us
      results.push({
        threadId: stub.id,
        subject: headerValue(last.payload?.headers, 'Subject') || '(no subject)',
        from,
        date: headerValue(last.payload?.headers, 'Date'),
        snippet: thread.snippet || '',
      })
      if (results.length >= maxResults) break
    } catch {
      // one bad thread shouldn't sink the whole summary
    }
  }
  return results
}

function isConnected() {
  const tokens = loadTokens()
  return Boolean(tokens?.refresh_token)
}

export { getConfig, buildAuthUrl, exchangeCodeForTokens, listNeedsReplyThreads, isConnected, clearTokens }
