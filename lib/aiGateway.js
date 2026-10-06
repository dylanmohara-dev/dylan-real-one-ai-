// AI Gateway (Phase 1A) -- provider abstraction extracted verbatim from
// routes/chat.js so provider/model plumbing lives in one place.
//
// This is a MOVE, not a rewrite: request bodies, endpoints, model names,
// timeouts, keep_alive, streaming shape, the Groq->Ollama fallback, the
// model-install checks, and the /api/tags 15s cache are all unchanged from what
// chat.js did inline. Only the location and the exposed names changed
// (complete / streamTokens / resolveModel / checkModel / getInstalledModels).
//
// PROVIDERS / CATEGORIES at the bottom are DESCRIPTIVE metadata only -- Phase
// 1A does NOT consult them. complete() keeps its exact current behavior (Groq
// first when a key is set and preferGroq is true, else local Ollama).
import {
  OLLAMA_HOST,
  OLLAMA_URL,
  MODEL,
  FALLBACK_MODEL,
  OLLAMA_TIMEOUT_MS,
  OLLAMA_PING_TIMEOUT_MS,
  KEEP_ALIVE,
  GROQ_URL,
  GROQ_MODEL,
  GROQ_TIMEOUT_MS,
} from './aiConfig.js'
import { getApiKey } from './apiKeys.js'

// Every outbound call used to be a bare fetch() with no timeout -- a stalled
// socket never rejects, so the request never returned. Everything below is
// bounded.
export async function fetchWithTimeout(url, options = {}, timeoutMs = OLLAMA_TIMEOUT_MS, label = 'The local AI') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `${label} did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
        `Ollama may be loading the model, stuck, or not running — check it with \`ollama list\`, ` +
        `and restart it with \`ollama serve\` if needed.`,
        { cause: error }
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// Both this and resolveModel() below used to independently ping Ollama's
// /api/tags on every call -- a normal chat message could trigger it twice
// (here or in resolveModel, again in the /memory-check that follows). Cached
// for a short window so it's skipped for the overwhelmingly common case
// (several messages in quick succession) while still noticing a real
// `ollama pull`/`ollama rm` within seconds, not requiring a server restart.
const MODEL_LIST_CACHE_MS = 15000
let modelListCache = { at: 0, models: null }

export async function getInstalledModels() {
  if (modelListCache.models && Date.now() - modelListCache.at < MODEL_LIST_CACHE_MS) {
    return modelListCache.models
  }

  let installedModels = []
  try {
    const tagsResponse = await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`, {}, OLLAMA_PING_TIMEOUT_MS, 'Ollama')
    if (tagsResponse.ok) {
      const tagsData = await tagsResponse.json()
      installedModels = (tagsData.models || []).map((m) => m.name)
    }
  } catch {
    // Deliberately NOT cached -- a transient failure to reach Ollama
    // shouldn't get remembered as "nothing is installed" for the next 15s.
    throw new Error(
      `Could not reach Ollama at all (${OLLAMA_HOST}). Is it running? Try \`ollama serve\` ` + 'or open the Ollama app, then try again.'
    )
  }

  modelListCache = { at: Date.now(), models: installedModels }
  return installedModels
}


// Runs one chat completion using the exact provider-selection behavior that
// previously lived in routes/chat.js.
export async function complete(
  buildBody,
  { streaming = true, preferCloud = true, forceLocal = false, modelOverride = null } = {}
) {
  const groqApiKey = getApiKey('GROQ_API_KEY')

  if (!forceLocal && preferCloud && groqApiKey) {
    try {
      const body = buildBody(GROQ_MODEL)
      const groqResponse = await fetchWithTimeout(
        GROQ_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            ...body,
            stream: streaming,
            include_reasoning: false,
          }),
        },
        GROQ_TIMEOUT_MS,
        'Groq'
      )

      if (!groqResponse.ok) {
        const errorBody = await groqResponse.text().catch(() => '(could not read response body)')
        throw new Error(`Groq returned ${groqResponse.status}: ${errorBody}`)
      }

      return {
        response: groqResponse,
        usedFallback: false,
        backendNotice: '',
      }
    } catch (groqError) {
      console.error('Groq request failed, falling back to local Ollama:', groqError.message)
    }
  }

  const { model: resolvedModel, usedFallback } = modelOverride
    ? { model: modelOverride, usedFallback: false }
    : await resolveModel(MODEL, FALLBACK_MODEL)
  const body = buildBody(resolvedModel)

  const response = await fetchWithTimeout(
    OLLAMA_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        keep_alive: KEEP_ALIVE,
        stream: streaming,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Local AI returned ${response.status}`)
  }

  return {
    response,
    usedFallback,
    backendNotice: groqApiKey
      ? '\n\n(Groq is unreachable right now -- answered with the local model instead.)'
      : '',
  }
}

// Consumes the OpenAI-compatible streaming response used by both Groq and
// Ollama. The callback receives only content deltas.
export async function streamTokens(response, onDelta) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (!line.startsWith('data:')) continue

        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return

        let json
        try {
          json = JSON.parse(payload)
        } catch {
          continue
        }

        const delta = json.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      }
    }
  } finally {
    reader.releaseLock?.()
  }
}


// Checks whether a given model name is actually pulled in Ollama BEFORE
// spending a request on it -- this is what turns "some HTTP error came back"
// into an unmistakable, specific instruction ("run ollama pull X"). Originally
// only the vision path did this; pulled out here so the main and content-request
// paths can do the same check now that MODEL is no longer guaranteed to already
// be installed (see ./aiConfig.js -- Dylan chose a bigger, smarter,
// NOT-yet-pulled model over the previous default).
export async function checkModel(modelName) {
  const installedModels = await getInstalledModels()

  const isInstalled = installedModels.some((name) => name === modelName || name.startsWith(`${modelName}:`))
  if (!isInstalled) {
    throw new Error(
      `Dylan AI is set to use "${modelName}", but it isn't pulled yet. \`ollama list\` shows: ` +
        `${installedModels.length ? installedModels.join(', ') : '(nothing installed at all)'}. ` +
        `Run \`ollama pull ${modelName}\` in a terminal on this Mac, then try again -- it only needs to be done once.`
    )
  }
}

// Like checkModel, but for the everyday text paths (content-request and main)
// that have a known-good fallback to drop back to: if the preferred MODEL isn't
// pulled yet but FALLBACK_MODEL is, use the fallback for THIS request instead of
// hard-blocking every single message on a one-time setup step Dylan hasn't
// gotten to yet. Real example that prompted this: Dylan switched MODEL to
// llama3.1:8b, hadn't run `ollama pull` yet, and every message failed outright
// until he did -- this keeps chat usable in the meantime, at the smaller model's
// quality, while still telling him plainly (see callers below) that he's on the
// fallback and what to run to get the better one.
export async function resolveModel(preferredModel, fallbackModel) {
  const installedModels = await getInstalledModels()

  const isModelInstalled = (name) => installedModels.some((m) => m === name || m.startsWith(`${name}:`))

  if (isModelInstalled(preferredModel)) {
    return { model: preferredModel, usedFallback: false }
  }
  if (fallbackModel && isModelInstalled(fallbackModel)) {
    return { model: fallbackModel, usedFallback: true }
  }
  throw new Error(
    `Dylan AI is set to use "${preferredModel}", but it isn't pulled yet` +
      `${fallbackModel ? ` (and neither is the fallback, "${fallbackModel}")` : ''}. ` +
      `\`ollama list\` shows: ${installedModels.length ? installedModels.join(', ') : '(nothing installed at all)'}. ` +
      `Run \`ollama pull ${preferredModel}\` in a terminal on this Mac, then try again -- it only needs to be done once.`
  )
}
