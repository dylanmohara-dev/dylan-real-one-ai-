import { TAVILY_API_KEY, TAVILY_URL, TAVILY_TIMEOUT_MS } from './aiConfig.js'

// Session 41: the chat route correctly said "I don't have live data" for
// anything time-sensitive (scores, prices, today's news) -- that's honest,
// but Dylan wants it to actually answer those. This is the one tool that
// does it: a real web search, called only when routes/chat.js's
// looksLikeLiveDataRequest() flags the question, with real results handed
// to the model instead of either guessing or refusing. Deliberately NOT a
// hard dependency -- if TAVILY_API_KEY is unset or the call fails, the
// chat route falls back to its normal honest "I don't have that" answer,
// same as Groq falling back to Ollama never breaks the chat outright.
export async function webSearch(query) {
  if (!TAVILY_API_KEY) {
    return { ok: false, reason: 'no_key', results: [], answer: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS)

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        // Session 41 round 2: 'basic' depth was returning thin snippets --
        // plenty to name the right game/player but not enough detail for
        // the model to answer from without filling gaps itself, which is
        // exactly how it invented an Austin Riley home run that never
        // happened. 'advanced' costs 2 Tavily credits instead of 1 (still
        // nothing against the 1,000/month free quota for one person) for
        // meaningfully more extracted content per result.
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
      }),
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
