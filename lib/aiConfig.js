// Single source of truth for which local model the app talks to and how
// long it's allowed to take. Previously these constants lived inside
// routes/chat.js, which meant "try a bigger model" was an edit buried in a
// 460-line route file. Now it's one line, in one place.
export const OLLAMA_HOST = 'http://127.0.0.1:11434'
export const OLLAMA_URL = `${OLLAMA_HOST}/v1/chat/completions`

// The everyday text model. Dylan chose the "smarter, slower, still fully
// local/private" tradeoff explicitly (session 23) over both leaving this
// alone and adding a paid cloud model -- llama3.1:8b measurably improves
// answer quality over the previous llama3.2:3b default, at the cost of
// being slower per response since it's a bigger model running on the same
// Mac hardware. REQUIRES `ollama pull llama3.1:8b` to be run once in a
// terminal on this Mac before it will work at full quality -- until then,
// routes/chat.js automatically falls back to FALLBACK_MODEL below instead
// of hard-blocking every message, and says so plainly in the reply itself.
export const MODEL = 'llama3.1:8b'

// Known-good model used instead of MODEL when MODEL isn't pulled yet. This
// is the previous default (already confirmed installed and working
// throughout this project) -- picked specifically so switching MODEL to
// something bigger is never a hard outage between "I changed the setting"
// and "I got around to running ollama pull," just a disclosed, temporary
// quality step-down.
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
