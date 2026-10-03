// Daily market news for Finance's "Daily Briefing" tab, via Finnhub's free
// tier (confirmed at finnhub.io/pricing: 60 calls/min, no card required).
// Same optional-dependency, never-fabricate shape as lib/marketData.js and
// lib/technicals.js: never throws, always returns { ok, reason? }. No key
// or a provider error just means the tab shows "no_key"/an honest empty
// state instead of inventing headlines -- same house rule as live prices.
//
// Session: Dylan asked for the Daily Briefing to section news by type and
// show what it's doing instead of one flat list. Finnhub's /news endpoint
// takes a real `category` param (general/forex/crypto/merger) -- fetching
// each one separately and keeping that real category on every article is
// what "section each news type" means honestly here, vs guessing a
// category from headline text. Each article also carries Finnhub's own
// `related` field (comma-separated tickers) UNCHANGED -- for category
// news (as opposed to company-specific news) this is almost always blank,
// which is disclosed to Dylan rather than silently faked from keyword
// matching against the headline.
import { FINNHUB_NEWS_URL, FINNHUB_TIMEOUT_MS } from './aiConfig.js'
import { getApiKey } from './apiKeys.js'

// Session: Dylan saw Japanese/German/French/Spanish headlines mixed into
// the feed (Finnhub's category endpoints aren't English-only) and called
// it out as unprofessional -- a customer-facing feed shouldn't show
// stories it can't even read. Finnhub's /news response has no language
// field to filter on, so this is a heuristic, not a guarantee: non-Latin
// scripts (Japanese/Chinese/Korean/Arabic/Cyrillic/Hebrew) are caught
// reliably; Latin-alphabet languages (French/German/Spanish/Portuguese)
// are caught by diacritic density plus a short list of common foreign
// business words actually seen in Dylan's real feed. This will
// occasionally misjudge an edge case -- it's a practical filter, not a
// translator, and errs toward excluding rather than showing something
// unreadable.
const NON_LATIN_SCRIPT = /[Ѐ-ӿ؀-ۿ぀-ヿ㐀-鿿가-힯֐-׿]/
const FOREIGN_DIACRITICS = /[àâäèéêëîïôöùûüçñãõ]/gi
const FOREIGN_WORDS = /\b(und|mit|für|über|wird|eine|einen|unterzeichnet|übernahme|signe|accord|accords|acquiert|établit|société|adquiere|empresa|establece|según|anuncia|convenio|concluye)\b/i

function looksEnglish(text) {
  if (!text) return true // nothing to judge -- don't reject on an absent field
  if (NON_LATIN_SCRIPT.test(text)) return false
  const diacriticHits = text.match(FOREIGN_DIACRITICS)
  if (diacriticHits && diacriticHits.length >= 2) return false
  if (FOREIGN_WORDS.test(text)) return false
  return true
}

export const NEWS_CATEGORIES = [
  { key: 'general', label: 'Top News' },
  { key: 'forex', label: 'Forex' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'merger', label: 'M&A' },
]

// Headlines don't move fast enough to justify hitting the API on every tab
// open/poll -- 15 min keeps Dylan comfortably inside the free-tier rate
// limit even if the tab is left open all day. Keyed per category now
// (used to be one global cache) since each category is its own Finnhub
// call with its own freshness.
const CACHE_TTL_MS = 15 * 60 * 1000
const caches = new Map() // category -> { articles, fetchedAt }

function isFresh(entry) {
  return Boolean(entry) && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

async function fetchCategory(category) {
  const apiKey = getApiKey('FINNHUB_API_KEY')
  const cached = caches.get(category)

  if (isFresh(cached)) {
    return { ok: true, articles: cached.articles }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FINNHUB_TIMEOUT_MS)
  try {
    const url = `${FINNHUB_NEWS_URL}?category=${encodeURIComponent(category)}&token=${apiKey}`
    const response = await fetch(url, { signal: controller.signal })
    const payload = await response.json()

    if (!response.ok || !Array.isArray(payload)) {
      const reason = (payload && payload.error) || `Finnhub error (${response.status})`
      console.error(`[marketNews] ${category} fetch failed -- httpStatus=${response.status} message=${JSON.stringify(reason)}`)
      return { ok: Boolean(cached), reason, articles: cached ? cached.articles : [] }
    }

    const articles = payload
      .filter((item) => item && item.headline && item.url)
      .filter((item) => looksEnglish(item.headline) && looksEnglish(item.summary))
      .slice(0, 20)
      .map((item) => ({
        id: item.id != null ? String(item.id) : `${category}-${item.datetime}-${item.headline}`,
        headline: item.headline,
        summary: item.summary || '',
        source: item.source || 'Unknown',
        url: item.url,
        // Finnhub gives unix seconds, not ms.
        datetime: item.datetime ? item.datetime * 1000 : null,
        category,
        image: item.image || null,
        // Real pass-through only -- never guessed from the headline. Blank
        // for the vast majority of category-feed articles; Finnhub only
        // reliably populates this for its separate /company-news endpoint
        // (called per-symbol), which this app doesn't call yet.
        related: (item.related || '')
          .split(',')
          .map((ticker) => ticker.trim())
          .filter(Boolean),
      }))

    caches.set(category, { articles, fetchedAt: Date.now() })
    return { ok: true, articles }
  } catch (error) {
    console.error(`[marketNews] ${category} threw -- ${error.name}: ${error.message}`)
    return {
      ok: Boolean(cached),
      reason: error.name === 'AbortError' ? 'Timed out' : error.message,
      articles: cached ? cached.articles : [],
    }
  } finally {
    clearTimeout(timeout)
  }
}

// Fetches every category in NEWS_CATEGORIES in parallel and returns one
// combined, newest-first list -- each article keeps its own real
// `category` so the Daily Briefing tab can section without guessing.
// ok is true as long as at least one category came back with real
// articles, so one slow/failed Finnhub call doesn't blank out the whole
// tab when the other three succeeded.
export async function fetchMarketNews() {
  if (!getApiKey('FINNHUB_API_KEY')) {
    return { ok: false, reason: 'no_key', articles: [] }
  }

  const results = await Promise.all(NEWS_CATEGORIES.map((c) => fetchCategory(c.key)))
  const articles = results
    .flatMap((r) => r.articles)
    .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
  const anyOk = results.some((r) => r.ok)

  if (!anyOk) {
    const firstFailure = results.find((r) => r.reason)
    return { ok: false, reason: firstFailure?.reason || 'Could not fetch news', articles: [] }
  }
  return { ok: true, articles }
}
