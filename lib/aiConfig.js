// Single source of truth for which local model the app talks to and how
// long it's allowed to take. Previously these constants lived inside
// routes/chat.js, which meant "try a bigger model" was an edit buried in a
// 460-line route file. Now it's one line, in one place.
export const OLLAMA_HOST = 'http://127.0.0.1:11434'
export const OLLAMA_URL = `${OLLAMA_HOST}/v1/chat/completions`

// The everyday text model. Swapping this to something larger (llama3.1:8b)
// is the single highest-impact change available for answer quality — it
// only requires `ollama pull <name>` first, and the name must match what
// `ollama list` shows exactly.
export const MODEL = 'llama3.2:3b'

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
