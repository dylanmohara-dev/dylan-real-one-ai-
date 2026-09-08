// Thin wrapper around Slack's OAuth v2 + Web API. Uses a *user* token
// (user_scope, not bot scope) because "what's unread" is meaningful only
// relative to a specific person's read cursor — a bot token can't see that.
import { loadData, saveData } from './dataStore.js'

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access'
const API_BASE = 'https://slack.com/api'

// Matches the scopes Slack's own consent screen lists for read access to
// channels, groups, DMs and group DMs, plus user lookups to resolve names.
const USER_SCOPES = [
  'channels:read', 'channels:history',
  'groups:read', 'groups:history',
  'im:read', 'im:history',
  'mpim:read', 'mpim:history',
  'users:read',
].join(',')

function getConfig() {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:3001/api/slack/oauth2callback'
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) }
}

function loadTokens() {
  const stored = loadData('slack_tokens')
  return Array.isArray(stored) ? null : stored && stored.access_token ? stored : null
}

function saveTokens(tokens) {
  saveData('slack_tokens', tokens)
}

function clearTokens() {
  saveData('slack_tokens', {})
}

function buildAuthUrl() {
  const { clientId, redirectUri, configured } = getConfig()
  if (!configured) throw new Error('Slack OAuth credentials are not configured')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    user_scope: USER_SCOPES,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getConfig()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Token exchange failed')
  const authedUser = json.authed_user || {}
  if (!authedUser.access_token) throw new Error('Slack did not return a user token — check the app\'s user_scope configuration')
  const tokens = {
    access_token: authedUser.access_token,
    refresh_token: authedUser.refresh_token || null, // only present if token rotation is enabled for the app
    // Slack classic user tokens don't expire; rotation-enabled ones do (expires_in in seconds).
    expires_at: authedUser.expires_in ? Date.now() + authedUser.expires_in * 1000 : null,
    team: json.team,
    user_id: authedUser.id,
  }
  saveTokens(tokens)
  return tokens
}

async function refreshAccessToken(tokens) {
  const { clientId, clientSecret } = getConfig()
  if (!tokens.refresh_token) throw new Error('No refresh token on file; reconnect Slack')
  const body = new URLSearchParams({
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Token refresh failed')
  const refreshed = {
    ...tokens,
    access_token: json.access_token,
    refresh_token: json.refresh_token || tokens.refresh_token,
    expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : null,
  }
  saveTokens(refreshed)
  return refreshed
}

async function getValidAccessToken() {
  let tokens = loadTokens()
  if (!tokens) throw new Error('Slack is not connected')
  if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    tokens = await refreshAccessToken(tokens)
  }
  return tokens.access_token
}

async function slackGet(method, params = {}) {
  const accessToken = await getValidAccessToken()
  const url = `${API_BASE}/${method}?${new URLSearchParams(params).toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `Slack API call to ${method} failed`)
  return json
}

const userNameCache = new Map()
async function resolveUserName(userId) {
  if (!userId) return 'Unknown'
  if (userNameCache.has(userId)) return userNameCache.get(userId)
  try {
    const data = await slackGet('users.info', { user: userId })
    const name = data.user?.profile?.display_name || data.user?.real_name || data.user?.name || userId
    userNameCache.set(userId, name)
    return name
  } catch {
    return userId
  }
}

// Pulls every conversation the user is a member of, keeps only the ones
// Slack reports as unread, and grabs a couple of recent lines from each so
// the summary is actually useful as chat context rather than just a count.
async function listUnreadSummary({ maxConversations = 8 } = {}) {
  const list = await slackGet('users.conversations', {
    types: 'public_channel,private_channel,mpim,im',
    exclude_archived: 'true',
    limit: '200',
  })
  const conversations = list.channels || []

  const unread = []
  for (const convo of conversations) {
    try {
      const info = await slackGet('conversations.info', { channel: convo.id })
      const count = info.channel?.unread_count ?? 0
      if (count > 0) unread.push({ ...convo, unread_count: count })
    } catch {
      // skip conversations we can't read info for
    }
    if (unread.length >= maxConversations * 2) break // cap work even if a lot is unread
  }

  const results = []
  for (const convo of unread.slice(0, maxConversations)) {
    let label = convo.name ? `#${convo.name}` : null
    if (!label && convo.is_im) {
      label = `DM: ${await resolveUserName(convo.user)}`
    }
    if (!label) label = `Group DM (${convo.id})`

    let messages = []
    try {
      const history = await slackGet('conversations.history', { channel: convo.id, limit: '3' })
      messages = await Promise.all(
        (history.messages || []).reverse().map(async (m) => ({
          from: await resolveUserName(m.user),
          text: (m.text || '').slice(0, 300),
          ts: m.ts,
        }))
      )
    } catch {
      // history may fail for some conversation types; still report the unread count
    }

    results.push({ channel: label, unreadCount: convo.unread_count, messages })
  }
  return results
}

function isConnected() {
  const tokens = loadTokens()
  return Boolean(tokens?.access_token)
}

export { getConfig, buildAuthUrl, exchangeCodeForTokens, listUnreadSummary, isConnected, clearTokens }
