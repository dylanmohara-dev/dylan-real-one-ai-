// Live market quotes for Trading/Watchlist tickers (stocks, ETFs, crypto) via
// Twelve Data's free tier (verified: 800 requests/day, no card required,
// covers US equities/ETFs + forex + crypto in one API -- chosen over
// juggling two separate providers for Dylan's mixed watchlist).
//
// Same graceful-degradation shape as lib/webSearch.js: never throws, always
// returns { ok, reason? } so a missing key or a flaky network never breaks
// the Finance tab -- it just shows no live price instead of a fake one.
import { TWELVE_DATA_API_KEY, TWELVE_DATA_URL, TWELVE_DATA_TIMEOUT_MS } from './aiConfig.js'
import { queueTwelveDataRequest } from './twelveDataLimiter.js'

// Twelve Data's free tier is rate-limited (800 requests/day, 8/minute) --
// this cache keeps Dylan's Finance tab from burning through that just
// because he has the tab open and it's polling. The client polls every
// 60s (useLiveQuotes in FinancePage.jsx) -- this MUST stay above that, or
// every single poll lands on an already-expired cache entry and fires a
// fresh upstream call anyway, defeating the cache entirely. At the
// previous 45s TTL, 6 Market Pulse symbols left open for a few hours
// could burn through the entire 800/day cap by themselves. 70s guarantees
// a cache hit on every poll except the very first.
const CACHE_TTL_MS = 70_000
const cache = new Map() // symbol -> { data, fetchedAt }

// Twelve Data wants crypto pairs as "BTC/USD", not "BTCUSD" -- normalize the
// common no-slash shorthand so Dylan can type tickers the way he naturally
// would (watchlist/position tickers are plain strings with no pair syntax).
const KNOWN_QUOTE_CURRENCIES = ['USD', 'USDT', 'EUR', 'GBP']
function normalizeSymbol(raw) {
  const ticker = (raw || '').toString().trim().toUpperCase()
  if (!ticker || ticker.includes('/')) return ticker
  for (const quote of KNOWN_QUOTE_CURRENCIES) {
    if (ticker.length > quote.length && ticker.endsWith(quote)) {
      const base = ticker.slice(0, -quote.length)
      // Only treat it as a crypto pair for recognizable short crypto bases --
      // otherwise a ticker like "AMD" or "BUD" would get mangled.
      if (['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'LTC', 'AVAX', 'LINK', 'DOT', 'MATIC'].includes(base)) {
        return `${base}/${quote}`
      }
    }
  }
  return ticker
}

function isFresh(entry) {
  return entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

async function fetchOne(symbol) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TWELVE_DATA_TIMEOUT_MS)
  try {
    const url = `${TWELVE_DATA_URL}?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_DATA_API_KEY}`
    // Gated through the shared app-wide limiter -- see twelveDataLimiter.js
    // for why a per-file sequential loop alone wasn't enough.
    const response = await queueTwelveDataRequest(() => fetch(url, { signal: controller.signal }))
    const payload = await response.json()

    if (!response.ok || payload.status === 'error' || payload.code) {
      return { ok: false, reason: payload.message || `Twelve Data error (${response.status})` }
    }

    const price = Number(payload.close)
    if (!Number.isFinite(price)) {
      return { ok: false, reason: 'No price in response' }
    }

    return {
      ok: true,
      price,
      change: Number(payload.change) || 0,
      changePercent: Number(payload.percent_change) || 0,
      isMarketOpen: payload.is_market_open ?? null,
      name: payload.name || null,
      fetchedAt: Date.now(),
    }
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'Timed out' : error.message }
  } finally {
    clearTimeout(timeout)
  }
}

// symbols: array of raw tickers as stored on positions/watchlist items.
// Returns { ok: true, quotes: { RAWTICKER: {price, change, changePercent, isMarketOpen} | null } }
// or { ok: false, reason: 'no_key' } when Dylan hasn't added a Twelve Data key yet.
export async function fetchQuotes(symbols) {
  if (!TWELVE_DATA_API_KEY) {
    return { ok: false, reason: 'no_key', quotes: {} }
  }

  const uniqueRaw = [...new Set((symbols || []).filter(Boolean))]
  if (!uniqueRaw.length) return { ok: true, quotes: {} }

  const quotes = {}
  const toFetch = []

  for (const raw of uniqueRaw) {
    const normalized = normalizeSymbol(raw)
    const cached = cache.get(normalized)
    if (isFresh(cached)) {
      quotes[raw] = cached.data
    } else {
      toFetch.push({ raw, normalized })
    }
  }

  // Sequential, not parallel -- Twelve Data's free tier also caps requests
  // per minute (8/min), and a beginner's watchlist is small enough that a
  // short sequential pass is still fast.
  for (const { raw, normalized } of toFetch) {
    const result = await fetchOne(normalized)
    if (result.ok) {
      const data = {
        price: result.price,
        change: result.change,
        changePercent: result.changePercent,
        isMarketOpen: result.isMarketOpen,
      }
      cache.set(normalized, { data, fetchedAt: Date.now() })
      quotes[raw] = data
    } else {
      quotes[raw] = null
    }
  }

  return { ok: true, quotes }
}
