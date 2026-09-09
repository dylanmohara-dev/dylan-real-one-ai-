// Keeps the local model resident in RAM.
//
// Ollama evicts an idle model after about five minutes by default. That is
// the real reason a first message after a break felt broken: before a
// single token is generated, Ollama has to read gigabytes of weights back
// off disk. Nothing in the app was slow — it was waiting on a cold start.
//
// Hitting /api/generate with an empty prompt is Ollama's documented way to
// load a model without generating anything, and keep_alive sets how long it
// stays loaded. We do it once at boot and again on an interval that's
// comfortably shorter than the keep_alive window.
import { OLLAMA_HOST, MODEL, KEEP_ALIVE } from './aiConfig.js'

const REWARM_INTERVAL_MS = 10 * 60 * 1000 // well inside the 30m keep_alive
const WARM_TIMEOUT_MS = 60000 // a genuine cold load can take a while

async function preloadModel({ quiet = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: '', keep_alive: KEEP_ALIVE }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
    await response.json().catch(() => ({}))
    if (!quiet) {
      console.log(`Model ${MODEL} warm (${Date.now() - startedAt}ms), staying loaded for ${KEEP_ALIVE}`)
    }
    return true
  } catch (error) {
    // Never fatal. Ollama not running just means the first real message pays
    // the cold-start cost and gets the existing clear error if it's down.
    if (!quiet) {
      console.log(`Could not pre-warm ${MODEL} (${error.message}). Is Ollama running?`)
    }
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function startModelWarmup() {
  preloadModel()
  const handle = setInterval(() => preloadModel({ quiet: true }), REWARM_INTERVAL_MS)
  // Don't hold the process open just for the warmer.
  if (typeof handle.unref === 'function') handle.unref()
  return handle
}

export { preloadModel }
