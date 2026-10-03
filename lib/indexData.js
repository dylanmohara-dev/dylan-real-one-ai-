// Real market INDEX values -- the actual S&P 500 / Nasdaq Composite numbers
// (e.g. "the S&P 500 is at 7,668.82"), NOT the price of an ETF that tracks
// them. Dylan was explicit: SPY (the ETF, ~$764) and "the S&P 500" (the
// index, ~7,668) are two different numbers and must never be shown as if
// they were the same thing.
//
// Twelve Data's free plan was checked directly against its API and
// confirmed to block raw index symbols outright: a request for SPX or NDX
// returns {"code":404,"message":"...available starting with the Pro or
// Grow or Venture plan..."}. So real index values come from Yahoo
// Finance's public chart endpoint instead -- no API key, no daily/minute
// cap to manage, and it returns the same regularMarketPrice shown on
// finance.yahoo.com. It's an unofficial/undocumented endpoint (Yahoo could
// change it without notice, and in practice its two load-balanced hosts
// (query1/query2) each throttle unauthenticated requests on their own --
// confirmed live: a request for ^IXIC right after a successful ^GSPC
// request came back "429 Too Many Requests" from query1 even though
// nothing else was polling it). This follows the same house rule as every
// other data source here: never fabricate a number -- if every attempt
// fails, the index comes back null and the UI says so, it never falls
// back to a guess or an ETF price standing in for the index.
const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart/',
  'https://query2.finance.yahoo.com/v8/finance/chart/',
]
const FETCH_TIMEOUT_MS = 6000
const CACHE_TTL_MS = 70_000 // same reasoning as lib/marketData.js: stay above the 60s client poll
const RETRY_DELAY_MS = 600 // brief backoff before trying the second host on a rate-limit/parse failure

export const INDEX_DEFS = {
  SPX: { yahooSymbol: '^GSPC', label: 'S&P 500' },
  IXIC: { yahooSymbol: '^IXIC', label: 'Nasdaq Composite' },
  NDX: { yahooSymbol: '^NDX', label: 'Nasdaq 100' },
  DJI: { yahooSymbol: '^DJI', label: 'Dow Jones' },
  RUT: { yahooSymbol: '^RUT', label: 'Russell 2000' },
  VIX: { yahooSymbol: '^VIX', label: 'VIX (Volatility)' },
}

const cache = new Map() // key -> { data, fetchedAt }

function isFresh(entry) {
  return entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchFromHost(host, yahooSymbol) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const url = `${host}${encodeURIComponent(yahooSymbol)}?range=1mo&interval=1d`
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Yahoo's chart endpoint rejects requests with no User-Agent.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
    })

    if (response.status === 429) {
      console.error(`[indexData] ${yahooSymbol} rate limited (429) by ${host}`)
      return { ok: false, retryable: true, reason: 'Rate limited (429)' }
    }

    const raw = await response.text()
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      // Yahoo sometimes answers a throttle with a plain-text body ("Too
      // Many Requests") instead of JSON -- treat any unparseable body as
      // retryable rather than surfacing a confusing JSON-parse error.
      return { ok: false, retryable: true, reason: raw.slice(0, 120) || `Non-JSON response (${response.status})` }
    }

    const result = payload?.chart?.result?.[0]
    const meta = result?.meta
    const price = Number(meta?.regularMarketPrice)
    const previousClose = Number(meta?.previousClose ?? meta?.chartPreviousClose)

    if (!response.ok || !Number.isFinite(price)) {
      const reason = payload?.chart?.error?.description || `Yahoo index fetch failed (${response.status})`
      console.error(`[indexData] ${yahooSymbol} failed via ${host} -- httpStatus=${response.status} reason=${reason}`)
      return { ok: false, retryable: response.status >= 500, reason }
    }

    const change = Number.isFinite(previousClose) ? price - previousClose : 0
    const changePercent = Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : 0

    // Same response the range/interval params above add to this one
    // call -- zero extra network requests on an already-throttled feed.
    // Real daily closes only, oldest-first; a few missing/null bars
    // (market holidays, a half day) are just dropped rather than
    // interpolated into a fake value.
    const rawCloses = result?.indicators?.quote?.[0]?.close
    const closes = Array.isArray(rawCloses) ? rawCloses.filter((v) => Number.isFinite(v)) : []

    return { ok: true, price, change, changePercent, closes, asOf: Date.now() }
  } catch (error) {
    console.error(`[indexData] ${yahooSymbol} threw via ${host} -- ${error.name}: ${error.message}`)
    return { ok: false, retryable: true, reason: error.name === 'AbortError' ? 'Timed out' : error.message }
  } finally {
    clearTimeout(timeout)
  }
}

// Tries query1, then query2 on a retryable failure (rate limit, timeout,
// 5xx, bad body), then query1 again after a short backoff. Three attempts
// across two hosts is enough to ride out Yahoo's per-host throttling
// without hammering it or stalling the UI for long.
async function fetchOne(yahooSymbol) {
  let lastResult = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const host = YAHOO_HOSTS[attempt % YAHOO_HOSTS.length]
    if (attempt > 0) await sleep(RETRY_DELAY_MS)
    const result = await fetchFromHost(host, yahooSymbol)
    if (result.ok) return result
    lastResult = result
    if (!result.retryable) break
  }
  return lastResult
}

// keys: array drawn from INDEX_DEFS (e.g. ['SPX', 'IXIC']).
// Returns { ok: true, indices: { SPX: {price, change, changePercent} | null, ... } }
// Always ok:true at the envelope level (there's no API key to be missing) --
// per-index null means that one fetch failed, same honesty rule as quotes.
// Yahoo's unofficial endpoint throttles aggressively and unpredictably
// (confirmed live: it will 429 several index requests in a row with
// nothing else polling it). A beginner checking the Finance tab shouldn't
// see "no live index value" every time Yahoo has a bad minute, so a failed
// fetch falls back to the last REAL value this server actually fetched --
// never a guess, never an ETF price -- clearly marked stale with the real
// timestamp of when it was last confirmed, so Dylan always knows whether
// he's looking at a live number or an old one and never mistakes one for
// the other.
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // don't serve a number older than a day as if it still means something

export async function fetchIndices(keys) {
  const uniqueKeys = [...new Set((keys || []).filter((k) => INDEX_DEFS[k]))]
  if (!uniqueKeys.length) return { ok: true, indices: {} }

  const indices = {}
  for (const key of uniqueKeys) {
    const def = INDEX_DEFS[key]
    const cached = cache.get(key)
    if (isFresh(cached)) {
      indices[key] = { ...cached.data, stale: false, asOf: cached.fetchedAt }
      continue
    }
    const result = await fetchOne(def.yahooSymbol)
    if (result.ok) {
      const data = { price: result.price, change: result.change, changePercent: result.changePercent, closes: result.closes || [] }
      cache.set(key, { data, fetchedAt: Date.now() })
      indices[key] = { ...data, stale: false, asOf: Date.now() }
    } else if (cached && Date.now() - cached.fetchedAt < STALE_MAX_AGE_MS) {
      // Fresh fetch failed (likely a Yahoo throttle) -- serve the last real
      // number instead of nothing, marked stale with its real age.
      indices[key] = { ...cached.data, stale: true, asOf: cached.fetchedAt }
    } else {
      console.error(`[indexData] ${key} (${def.yahooSymbol}) -- all retries exhausted, no cached value to fall back on. Last reason: ${result?.reason || 'unknown'}`)
      indices[key] = null
    }
  }
  return { ok: true, indices }
}
