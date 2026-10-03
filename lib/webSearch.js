import { TAVILY_URL, TAVILY_TIMEOUT_MS } from './aiConfig.js'
import { getApiKey } from './apiKeys.js'

// Session 41: the chat route correctly said "I don't have live data" for
// anything time-sensitive (scores, prices, today's news) -- that's honest,
// but Dylan wants it to actually answer those. This is the one tool that
// does it: a real web search, called only when routes/chat.js's
// looksLikeLiveDataRequest() flags the question, with real results handed
// to the model instead of either guessing or refusing. Deliberately NOT a
// hard dependency -- if TAVILY_API_KEY is unset or the call fails, the
// chat route falls back to its normal honest "I don't have that" answer,
// same as Groq falling back to Ollama never breaks the chat outright.

// Round 3 bug: "what was the score of the Philly braves game yesterday"
// came back with the WRONG game (a stale 1-0 result, actual winner even
// flipped). Root cause -- Tavily was being asked to text-match the literal
// word "yesterday," which means nothing to a search index; it has no idea
// that's a date. Confirmed against Tavily's own API docs
// (docs.tavily.com/documentation/api-reference/endpoint/search): topic
// 'news' plus time_range narrows results to what was actually PUBLISHED
// recently, which is the real fix -- not keyword matching, actual
// recency filtering. Only applied when the question itself has a
// relative-day word, so this doesn't regress non-time-sensitive lookups
// like "stats of Joe Burrow" by over-narrowing to the last week.
const RECENCY_HINT = /\b(today|tonight|yesterday|last night|this morning|this week|last week|right now|currently)\b/i

export async function webSearch(query) {
  const apiKey = getApiKey('TAVILY_API_KEY')
  if (!apiKey) {
    return { ok: false, reason: 'no_key', results: [], answer: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS)

  const wantsRecent = RECENCY_HINT.test(query || '')

  const body = {
    api_key: apiKey,
    query,
    // 'advanced' depth (vs 'basic') costs 2 Tavily credits instead of 1 --
    // still nothing against the free 1,000/month quota for one person --
    // for meaningfully more extracted content per result, which is what
    // stopped the model from needing to invent detail past the snippet.
    search_depth: 'advanced',
    max_results: 5,
    include_answer: true,
    // Surfaces each result's actual publish date so the model can state
    // (or rule out) whether a result is really from "yesterday" instead
    // of guessing, which is what let the Austin Riley/Braves-1-0 mix-ups
    // through -- the model had no date to check itself against.
    include_published_date: true,
  }

  if (wantsRecent) {
    body.topic = 'news'
    body.time_range = 'week'
  }

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      return { ok: false, reason: `http_${res.status}: ${bodyText.slice(0, 200)}`, results: [], answer: null }
    }

    const data = await res.json()
    const results = Array.isArray(data.results)
      ? data.results.slice(0, 5).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          publishedDate: r.published_date || null,
          // Trimmed -- this goes straight into the model's prompt, and a
          // full scraped page per result would bloat every live-data
          // message far past the sizes the rest of this app's prompts stay
          // under (see MAX_CHAT_HISTORY_MESSAGES's reasoning in aiConfig.js).
          snippet: (r.content || '').slice(0, 500),
        }))
      : []

    return { ok: true, answer: data.answer || null, results }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : error.message
    return { ok: false, reason, results: [], answer: null }
  } finally {
    clearTimeout(timer)
  }
}
