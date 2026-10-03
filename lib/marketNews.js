// Daily market news for Finance's "Daily Briefing" tab, via Finnhub's free
// tier (confirmed at finnhub.io/pricing: 60 calls/min, no card required).
// Same optional-dependency, never-fabricate shape as lib/marketData.js and
// lib/technicals.js: never throws, always returns { ok, reason? }. No key
// or a provider error just means the tab shows "no_key"/an honest empty
// state instead of inventing headlines -- same house rule as live prices.
import { FINNHUB_NEWS_URL, FINNHUB_TIMEOUT_MS } from './aiConfig.js'
import { getApiKey } from './apiKeys.js'

// Headlines don't move fast enough to justify hitting the API on every tab
// open/poll -- 15 min keeps Dylan comfortably inside the free-tier rate
// limit even if the tab is left open all day.
const CACHE_TTL_MS = 15 * 60 * 1000
let cache = null // { articles, fetchedAt }

function isFresh() {
  return Boolean(cache) && Date.now() - cache.fetchedAt < CACHE_TTL_MS
}

export async function fetchMarketNews() {
  const apiKey = getApiKey('FINNHUB_API_KEY')
  if (!apiKey) {
    return { ok: false, reason: 'no_key', articles: [] }
  }

  if (isFresh()) {
    return { ok: true, articles: cache.articles }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FINNHUB_TIMEOUT_MS)
  try {
    const url = `${FINNHUB_NEWS_URL}?category=general&token=${apiKey}`
    const response = await fetch(url, { signal: controller.signal })
    const payload = await response.json()

    if (!response.ok || !Array.isArray(payload)) {
      const reason = (payload && payload.error) || `Finnhub error (${response.status})`
      console.error(`[marketNews] fetch failed -- httpStatus=${response.status} message=${JSON.stringify(reason)}`)
      // Fall back to the last good cache (if any) rather than a hard
      // error, so one flaky poll doesn't blank out a tab that had real
      // headlines a minute ago.
      return { ok: Boolean(cache), reason, articles: cache ? cache.articles : [] }
    }

    const articles = payload
      .filter((item) => item && item.headline && item.url)
      .slice(0, 20)
      .map((item) => ({
        id: item.id != null ? String(item.id) : `${item.datetime}-${item.headline}`,
        headline: item.headline,
        summary: item.summary || '',
        source: item.source || 'Unknown',
        url: item.url,
        // Finnhub gives unix seconds, not ms.
        datetime: item.datetime ? item.datetime * 1000 : null,
      }))

    cache = { articles, fetchedAt: Date.now() }
    return { ok: true, articles }
  } catch (error) {
    console.error(`[marketNews] threw -- ${error.name}: ${error.message}`)
    return {
      ok: Boolean(cache),
      reason: error.name === 'AbortError' ? 'Timed out' : error.message,
      articles: cache ? cache.articles : [],
    }
  } finally {
    clearTimeout(timeout)
  }
}
