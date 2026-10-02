// Real technical-indicator bias for the Macro Desk cards -- RSI(14) and a
// moving-average trend read, computed here from actual historical closes
// (Twelve Data's time_series endpoint). No LLM narrative, no invented
// confidence score, no fabricated news summary. Every number on these
// cards is reproducible by hand from the same closes.
//
// Deliberately computed from raw closes rather than hitting Twelve Data's
// separate /rsi endpoint -- one time_series call per symbol gives us both
// RSI and the moving averages, instead of two API credits per symbol. The
// free tier is 800 requests/day; this app's existing Market Pulse polling
// already leans on that budget (see the cache TTL fix in marketData.js),
// so this engine uses a much longer cache -- RSI/trend don't need
// to be fresher than that.
import { TWELVE_DATA_API_KEY, TWELVE_DATA_TIMEOUT_MS } from './aiConfig.js'
import { queueTwelveDataRequest } from './twelveDataLimiter.js'

const TIME_SERIES_URL = 'https://api.twelvedata.com/time_series'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 min -- a trend/RSI read doesn't change minute to minute
const cache = new Map() // symbol -> { data, fetchedAt }

function isFresh(entry) {
  return entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

// Wilder's RSI. closes must be ordered oldest -> newest.
export function computeRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null

  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10
}

function sma(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((sum, value) => sum + value, 0) / period
}

// 'bullish' when the short-term average trades above the long-term one
// (an actual real trend state, the plainest version of "the trend is up"),
// 'bearish' the other way, 'neutral' on a near-exact tie.
export function computeTrend(closes, shortPeriod = 10, longPeriod = 30) {
  const shortMA = sma(closes, shortPeriod)
  const longMA = sma(closes, longPeriod)
  if (shortMA === null || longMA === null) return null
  const diffPct = ((shortMA - longMA) / longMA) * 100
  if (Math.abs(diffPct) < 0.05) return 'neutral'
  return diffPct > 0 ? 'bullish' : 'bearish'
}

// A plain, fully mechanical combination of the two real reads above --
// never a third, separately-invented signal. RSI >=70/<=30 (overbought/
// oversold) takes priority as a reversal-risk read; otherwise it defers to
// the trend. When the two disagree outright, that's reported as 'mixed'
// rather than silently picking a side.
export function computeBias(rsi, trend) {
  if (rsi === null || !trend) return null
  let rsiLean = 'neutral'
  if (rsi >= 70) rsiLean = 'bearish'
  else if (rsi <= 30) rsiLean = 'bullish'
  else rsiLean = trend

  if (rsiLean === trend) return trend
  if (rsiLean === 'neutral') return trend
  return 'mixed'
}

async function fetchCloses(symbol) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TWELVE_DATA_TIMEOUT_MS)
  try {
    const url = `${TIME_SERIES_URL}?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=40&apikey=${TWELVE_DATA_API_KEY}`
    // Gated through the same shared app-wide limiter marketData.js uses --
    // Market Pulse and Macro Desk must never spend the per-minute budget
    // without seeing each other's requests. See twelveDataLimiter.js.
    const response = await queueTwelveDataRequest(() => fetch(url, { signal: controller.signal }))
    const payload = await response.json()

    if (!response.ok || payload.status === 'error' || payload.code) {
      return { ok: false, reason: payload.message || `Twelve Data error (${response.status})` }
    }
    if (!Array.isArray(payload.values) || !payload.values.length) {
      return { ok: false, reason: 'No historical data in response' }
    }

    // Twelve Data returns newest-first; every computation above assumes
    // oldest-first, so reverse once here rather than re-deriving order
    // assumptions in each function.
    const closes = payload.values
      .map((bar) => Number(bar.close))
      .filter((value) => Number.isFinite(value))
      .reverse()

    return { ok: true, closes }
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'Timed out' : error.message }
  } finally {
    clearTimeout(timeout)
  }
}

// symbols: array of raw tickers. Returns { ok, reason?, technicals: { SYMBOL: {rsi, trend, bias, asOf} | null } }
export async function fetchTechnicals(symbols) {
  if (!TWELVE_DATA_API_KEY) {
    return { ok: false, reason: 'no_key', technicals: {} }
  }

  const uniqueSymbols = [...new Set((symbols || []).filter(Boolean))]
  if (!uniqueSymbols.length) return { ok: true, technicals: {} }

  const technicals = {}
  const toFetch = []

  for (const symbol of uniqueSymbols) {
    const cached = cache.get(symbol)
    if (isFresh(cached)) {
      technicals[symbol] = cached.data
    } else {
      toFetch.push(symbol)
    }
  }

  // Sequential, not parallel -- same free-tier per-minute credit cap
  // reasoning as lib/marketData.js's fetchQuotes.
  for (const symbol of toFetch) {
    const result = await fetchCloses(symbol)
    if (result.ok) {
      const rsi = computeRSI(result.closes)
      const trend = computeTrend(result.closes)
      const bias = computeBias(rsi, trend)
      const data = { rsi, trend, bias, asOf: new Date().toISOString() }
      cache.set(symbol, { data, fetchedAt: Date.now() })
      technicals[symbol] = data
    } else {
      technicals[symbol] = null
    }
  }

  return { ok: true, technicals }
}
