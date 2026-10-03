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
//
// Session 42: Dylan is stock/trading-focused and said Forex and Crypto
// were cluttering the feed with news he doesn't trade -- cut both
// categories entirely (not fetched at all now, not just hidden) so the
// feed is just Top News + M&A, the two categories actually relevant to
// equities.
import { FINNHUB_NEWS_URL, FINNHUB_TIMEOUT_MS } from './aiConfig.js'
import { getApiKey } from './apiKeys.js'
import { loadData } from './dataStore.js'

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

// Session: Dylan flagged a live example where the expanded card's
// "summary" was just the headline restated -- a real Finnhub data
// characteristic (some articles get a thin auto-summary), not a bug in
// how this app renders it. Showing a second line that says nothing new
// reads as broken/lazy, so when the summary is the headline in different
// clothes, it's dropped entirely -- same "say nothing rather than fake
// depth" rule as the old missing-summary case, just triggered by
// near-duplicate text instead of an absent field.
function normalizeForCompare(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function summaryDuplicatesHeadline(headline, summary) {
  if (!summary) return false
  const h = normalizeForCompare(headline)
  const s = normalizeForCompare(summary)
  if (!h || !s) return false
  if (s === h) return true
  // Finnhub sometimes emits the summary as the headline plus a trailing
  // fragment, or the headline truncated -- a straight prefix match on
  // either side catches both shapes without being so loose it eats a
  // summary that happens to open with similar words to its own headline.
  return s.startsWith(h) || h.startsWith(s)
}

export const NEWS_CATEGORIES = [
  { key: 'general', label: 'Top News' },
  { key: 'merger', label: 'M&A' },
]

// Session 42: Dylan asked to see what stocks a story affects right in the
// title. Finnhub's own `related` field (kept, untouched, as `related`
// below) is real but almost always blank for category news -- so this
// adds a second, equally honest source: literal name/ticker mentions in
// the article's own headline/summary text. Nothing here is a sentiment
// call or a prediction -- it's surfacing a fact (this company's name is
// literally in this story) the same way Finnhub's own tagging would, just
// derived from the words instead of Finnhub's metadata. A well-known,
// large-cap universe -- the names actually likely to turn up in general
// market/M&A headlines -- not an attempt at every public company.
const KNOWN_COMPANIES = [
  ['Apple', 'AAPL'], ['Microsoft', 'MSFT'], ['Amazon', 'AMZN'],
  ['Alphabet', 'GOOGL'], ['Google', 'GOOGL'], ['Meta', 'META'], ['Facebook', 'META'],
  ['Tesla', 'TSLA'], ['Nvidia', 'NVDA'], ['Netflix', 'NFLX'],
  ['Berkshire Hathaway', 'BRK.B'], ['JPMorgan Chase', 'JPM'], ['JPMorgan', 'JPM'],
  ['Visa', 'V'], ['Mastercard', 'MA'], ['Walmart', 'WMT'],
  ['ExxonMobil', 'XOM'], ['Exxon Mobil', 'XOM'], ['Exxon', 'XOM'],
  ['UnitedHealth', 'UNH'], ['Johnson & Johnson', 'JNJ'],
  ['Procter & Gamble', 'PG'], ['Eli Lilly', 'LLY'], ['Broadcom', 'AVGO'],
  ['Home Depot', 'HD'], ['Chevron', 'CVX'], ['Costco', 'COST'],
  ['Advanced Micro Devices', 'AMD'], ['Intel', 'INTC'], ['Boeing', 'BA'],
  ['Disney', 'DIS'], ['Coca-Cola', 'KO'], ['PepsiCo', 'PEP'],
  ["McDonald's", 'MCD'], ['Nike', 'NKE'], ['Starbucks', 'SBUX'],
  ['AMD', 'AMD'], ['IBM', 'IBM'],
  ['Goldman Sachs', 'GS'], ['Morgan Stanley', 'MS'], ['Bank of America', 'BAC'],
  ['Wells Fargo', 'WFC'], ['Citigroup', 'C'], ['PayPal', 'PYPL'],
  ['Salesforce', 'CRM'], ['Oracle', 'ORCL'],
  ['Adobe', 'ADBE'], ['Qualcomm', 'QCOM'], ['Uber', 'UBER'],
  ['Airbnb', 'ABNB'], ['Coinbase', 'COIN'], ['Palantir', 'PLTR'],
  ['Robinhood', 'HOOD'], ['Ford Motor', 'F'], ['General Motors', 'GM'],
  ['Pfizer', 'PFE'], ['Moderna', 'MRNA'], ['Verizon', 'VZ'],
  ['Micron', 'MU'], ['Palo Alto Networks', 'PANW'], ['ServiceNow', 'NOW'],
  ['Shopify', 'SHOP'], ['Block Inc', 'SQ'], ['Snap Inc', 'SNAP'], ['Spotify', 'SPOT'],
]

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const COMPANY_PATTERNS = KNOWN_COMPANIES.map(([name, ticker]) => ({
  ticker,
  pattern: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'),
}))

// Dylan's own real watchlist + open positions -- matched as a strict,
// fully-uppercase whole-word token (e.g. bare "AAPL" in the text, not
// "Aapl" or "aapl") specifically because a loose, case-insensitive match
// on a short ticker risks colliding with an ordinary English word (a
// position in "ALL" the insurer would false-positive on every "all" in
// a headline otherwise). Financial journalism conventionally writes a
// real ticker mention fully capitalized, so this stays precise without
// needing a manual stoplist.
function getWatchedTickers() {
  try {
    const positions = loadData('trading_positions', [])
    const watchlist = loadData('trading_watchlist', [])
    const tickers = new Set()
    for (const p of Array.isArray(positions) ? positions : []) {
      if (p?.ticker) tickers.add(String(p.ticker).toUpperCase())
    }
    for (const w of Array.isArray(watchlist) ? watchlist : []) {
      if (w?.ticker) tickers.add(String(w.ticker).toUpperCase())
    }
    return tickers
  } catch {
    return new Set()
  }
}

function findAffectedTickers(article, watchedTickers) {
  const tags = new Set(article.related)
  const text = `${article.headline} ${article.summary}`

  for (const { ticker, pattern } of COMPANY_PATTERNS) {
    if (pattern.test(text)) tags.add(ticker)
  }

  for (const ticker of watchedTickers) {
    if (ticker.length < 2) continue
    const tokenPattern = new RegExp(`\\b${escapeRegExp(ticker)}\\b`)
    if (tokenPattern.test(text)) tags.add(ticker)
  }

  return [...tags]
}

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
        summary: summaryDuplicatesHeadline(item.headline, item.summary) ? '' : (item.summary || ''),
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

  // Session: Dylan's real feed showed the same Reuters masthead image
  // repeated across several unrelated headlines -- Finnhub's `image`
  // field for wire-service stories is often just the outlet's generic
  // logo graphic, not a photo of that specific story. A real photo is
  // essentially never reused byte-for-byte across different stories, so
  // the tell is frequency: any image URL appearing 3+ times in this
  // batch gets dropped for those articles rather than shown as if it
  // were a real picture of each one. Articles with a genuine, unique
  // image (like the CNBC photo Dylan saw in the same screenshot) are
  // completely unaffected.
  const imageCounts = new Map()
  for (const article of articles) {
    if (article.image) imageCounts.set(article.image, (imageCounts.get(article.image) || 0) + 1)
  }
  const deduped = articles.map((article) =>
    article.image && imageCounts.get(article.image) >= 3 ? { ...article, image: null } : article
  )

  // Session 42: "what stocks it affects" in the title -- real Finnhub
  // `related` tags plus honest text-derived ones, see findAffectedTickers
  // above. watchedTickers is read once per fetch, not per article.
  const watchedTickers = getWatchedTickers()
  const tagged = deduped.map((article) => ({
    ...article,
    affectedTickers: findAffectedTickers(article, watchedTickers),
  }))

  return { ok: true, articles: tagged }
}
