// Central store for the app's optional, user-supplied API keys (Groq,
// Tavily, Twelve Data, Finnhub) -- the real answer to "I don't want to
// hand-edit .env every time." A key saved here through the Settings page
// always wins over .env, and takes effect on the very next request --
// no server restart, unlike the old process.env-at-import-time constants
// in aiConfig.js this replaces. .env still works as a fallback for anyone
// who'd rather set it there (first run, before the server's even up), so
// nothing that worked before breaks.
//
// Same plaintext-JSON-in-data/ trust model this app already uses for
// gmail_tokens.json/slack_tokens.json/drive_tokens.json -- this is a
// single-user, local-first app with no server-side encryption-at-rest
// anywhere else either, so a new, different standard just for this file
// would be inconsistent without actually being safer.
import { loadData, saveData } from './dataStore.js'

const STORE_NAME = 'api_keys'

export const API_KEY_DEFS = [
  {
    key: 'GROQ_API_KEY',
    label: 'Groq',
    description: 'Faster, smarter AI chat (a much bigger model) instead of the local one. Free tier, no card.',
    signupUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'TAVILY_API_KEY',
    label: 'Tavily',
    description: "Live web search inside chat -- scores, prices, today's news. Free tier, no card.",
    signupUrl: 'https://app.tavily.com',
  },
  {
    key: 'TWELVE_DATA_API_KEY',
    label: 'Twelve Data',
    description: "Live stock/crypto/forex quotes for Finance's Market Pulse and Macro Desk. Free tier, no card.",
    signupUrl: 'https://twelvedata.com/account/api-keys',
  },
  {
    key: 'FINNHUB_API_KEY',
    label: 'Finnhub',
    description: "Real market headlines for Finance's Daily Briefing. Free tier, no card.",
    signupUrl: 'https://finnhub.io/dashboard',
  },
]

const VALID_KEYS = new Set(API_KEY_DEFS.map((def) => def.key))

// Resolution order: a value saved through the app beats .env, and .env
// beats nothing. Read fresh from disk every call (not cached in memory) --
// these are tiny files checked at most a few times a minute, and the
// whole point is a save through the Settings page is live immediately.
export function getApiKey(name) {
  if (!VALID_KEYS.has(name)) return null
  const stored = loadData(STORE_NAME, {})
  const value = stored[name]
  if (typeof value === 'string' && value.trim()) return value.trim()
  return process.env[name] || null
}

export function getApiKeyStatuses() {
  const stored = loadData(STORE_NAME, {})
  return API_KEY_DEFS.map((def) => {
    const value = getApiKey(def.key)
    let source = null
    if (stored[def.key]) source = 'app'
    else if (process.env[def.key]) source = 'env'
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      signupUrl: def.signupUrl,
      isSet: Boolean(value),
      source, // 'app' | 'env' | null
      // Last 4 characters only -- enough for Dylan to recognize "yes
      // that's the key I pasted" without this ever echoing the full
      // secret back over the wire once it's saved.
      masked: value ? `••••••••${value.slice(-4)}` : null,
    }
  })
}

export function setApiKey(name, value) {
  if (!VALID_KEYS.has(name)) {
    throw new Error(`Unknown API key: ${name}`)
  }
  const stored = loadData(STORE_NAME, {})
  const trimmed = (value || '').toString().trim()
  if (trimmed) {
    stored[name] = trimmed
  } else {
    delete stored[name]
  }
  saveData(STORE_NAME, stored)
  return getApiKeyStatuses()
}
