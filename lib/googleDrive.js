// Thin wrapper around Drive v3, read-only. Same OAuth pattern as
// lib/googleCalendar.js and lib/gmail.js — its own scope, redirect URI, and
// token record so it connects/disconnects independently.
import { loadData, saveData } from './dataStore.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.DRIVE_REDIRECT_URI || 'http://localhost:3001/api/drive/oauth2callback'
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

function loadTokens() {
  const stored = loadData('drive_tokens')
  return Array.isArray(stored) ? null : stored && stored.access_token ? stored : null
}

function saveTokens(tokens) {
  saveData('drive_tokens', tokens)
}

function clearTokens() {
  saveData('drive_tokens', {})
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
  if (!tokens.refresh_token) throw new Error('No refresh token on file; reconnect Google Drive')
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
  if (!tokens) throw new Error('Google Drive is not connected')
  if (Date.now() > tokens.expires_at - 60000) {
    tokens = await refreshAccessToken(tokens)
  }
  return tokens.access_token
}

async function driveGet(url) {
  const accessToken = await getValidAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Google Drive request failed')
  return json
}

async function listRecentFiles({ maxResults = 10 } = {}) {
  const params = new URLSearchParams({
    orderBy: 'modifiedTime desc',
    pageSize: String(maxResults),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))',
    q: "trashed = false",
  })
  const data = await driveGet(`${FILES_URL}?${params.toString()}`)
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }))
}

function isConnected() {
  const tokens = loadTokens()
  return Boolean(tokens?.refresh_token)
}

export { getConfig, buildAuthUrl, exchangeCodeForTokens, listRecentFiles, isConnected, clearTokens }
