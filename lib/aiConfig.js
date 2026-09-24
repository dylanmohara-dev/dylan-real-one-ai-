// Single source of truth for which local model the app talks to and how
// long it's allowed to take. Previously these constants lived inside
// routes/chat.js, which meant "try a bigger model" was an edit buried in a
// 460-line route file. Now it's one line, in one place.
export const OLLAMA_HOST = 'http://127.0.0.1:11434'
export const OLLAMA_URL = `${OLLAMA_HOST}/v1/chat/completions`

// The everyday text model. Session 23 tried the "smarter, slower" tradeoff
// (llama3.1:8b) at Dylan's own request, then he explicitly reversed that
// choice a session later -- speed matters more to him day-to-day than the
// quality gain, so this is back to llama3.2:3b, the fast/small model this
// project ran on for most of its life. If Dylan wants to revisit the
// bigger model later, this single line (plus `ollama pull llama3.1:8b`
// once on his Mac) is the whole change -- the fallback machinery below
// stays in place either way, so trying a bigger model again is never a
// hard outage if it isn't pulled yet.
export const MODEL = 'llama3.2:3b'

// Safety-net model used instead of MODEL if MODEL itself somehow isn't
// installed (e.g. Dylan points MODEL at something new without pulling it
// first). Currently the same as MODEL, which makes resolveAvailableModel's
// fallback path a no-op today -- that's fine, it costs nothing and means
// this doesn't need touching again the next time MODEL changes to
// something genuinely bigger.
export const FALLBACK_MODEL = 'llama3.2:3b'

// Vision-capable model for image-attached messages. llama3.2:3b is
// text-only, so messages with an image are routed here instead. Requires
// `ollama pull llava` (or moondream / bakllava / llama3.2-vision, with this
// constant updated to match).
export const VISION_MODEL = 'llava'

export const OLLAMA_TIMEOUT_MS = 120000
export const OLLAMA_PING_TIMEOUT_MS = 4000

// How long Ollama should keep the model resident in RAM after a request.
// This is the fix for the "first message after a break takes forever"
// problem: by default Ollama evicts a model after ~5 minutes idle, and the
// next message pays multiple seconds to reload gigabytes from disk before
// a single token is generated.
export const KEEP_ALIVE = '30m'

// How many of the most recent chat-thread messages actually get sent to the
// model per request. chatThreads persists per-mode in localStorage forever
// (see useAppData.js), so without a cap a long-lived thread resends its
// whole history every single message -- growing prefill time forever and,
// since the OpenAI-compatible endpoint has no per-request num_ctx control,
// risking silent context-window overflow on a long enough thread. 16
// messages is 8 back-and-forth exchanges -- enough for the model to track
// the live conversation, small enough to keep prefill fast and bounded no
// matter how old or long the thread actually is.
export const MAX_CHAT_HISTORY_MESSAGES = 8

// --- Optional cloud backend (Groq) ---
// Session 36: llama3.2:3b's speed AND quality can't both be fixed locally
// on this Mac -- a model small enough to run fast here will never be
// smart, and a local model smart enough to be good will be slow here.
// Dylan's own choice, after being told this plainly, was "smartest and
// most efficient and free" -- which only exists outside fully-local.
// Groq's free tier serves openai/gpt-oss-120b (a real, much bigger model)
// on custom inference hardware that's faster than any local option, at
// zero cost within its rate limits (confirmed directly against Groq's own
// docs: console.groq.com/docs/rate-limits, ~30 req/min, ~1000 req/day on
// the free tier -- plenty for one person). Setting GROQ_API_KEY in .env is
// what turns this on; see routes/chat.js's runChatCompletion for the
// automatic per-request fallback to local Ollama if Groq itself fails
// (rate limit, no internet, a Groq outage) or the key is simply unset --
// Groq is a preference, never a hard dependency. The vision path always
// stays on local Ollama regardless, since gpt-oss-120b is text-only.
export const GROQ_API_KEY = process.env.GROQ_API_KEY || null
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const GROQ_MODEL = 'openai/gpt-oss-120b'
export const GROQ_TIMEOUT_MS = 20000

