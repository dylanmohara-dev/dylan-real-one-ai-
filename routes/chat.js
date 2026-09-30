import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'
import { detectCommand, executeAction, looksLikeContentRequest } from '../lib/assistant.js'
import { getLiveContextBlock } from '../lib/liveContext.js'
import { createReplyExtractor } from '../lib/streamingJson.js'
import { todayKey } from '../lib/studyPlan.js'
import {
  OLLAMA_HOST,
  OLLAMA_URL,
  MODEL,
  FALLBACK_MODEL,
  VISION_MODEL,
  OLLAMA_TIMEOUT_MS,
  OLLAMA_PING_TIMEOUT_MS,
  KEEP_ALIVE,
  MAX_CHAT_HISTORY_MESSAGES,
  GROQ_API_KEY,
  GROQ_URL,
  GROQ_MODEL,
  GROQ_TIMEOUT_MS,
} from '../lib/aiConfig.js'

const router = Router()




// Every outbound call in this file used to be a bare fetch() with no timeout.
// That is why chat could sit on the "thinking" animation forever instead of
// failing: a stalled socket never rejects, so the route never returned, the
// client never got a response, and its spinner had nothing to turn off. A
// hang is strictly worse than an error — an error at least tells you what to
// fix. Everything below is now bounded.

async function fetchWithTimeout(url, options = {}, timeoutMs = OLLAMA_TIMEOUT_MS, label = 'The local AI') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `${label} did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
        `Ollama may be loading the model, stuck, or not running — check it with \`ollama list\`, ` +
        `and restart it with \`ollama serve\` if needed.`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// Both this and resolveAvailableModel() below used to independently ping
// Ollama's /api/tags on every single call -- meaning a normal chat message
// could trigger it twice (once here or in resolveAvailableModel, again in
// the /memory-check that follows), and a back-and-forth conversation paid
// that extra local round trip before every message with zero benefit --
// which model is pulled essentially never changes mid-conversation.
// Cached for a short window so it's skipped for the overwhelmingly common
// case (several messages in quick succession) while still noticing a real
// `ollama pull`/`ollama rm` within seconds, not requiring a server
// restart.
const MODEL_LIST_CACHE_MS = 15000
let modelListCache = { at: 0, models: null }

async function getInstalledModels() {
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

// Checks whether a given model name is actually pulled in Ollama BEFORE
// spending a request on it -- this is what turns "some HTTP error came
// back" into an unmistakable, specific instruction ("run ollama pull X").
// Originally only the vision path did this; pulled out here so the main
// and content-request paths can do the same check now that MODEL is no
// longer guaranteed to already be installed (see lib/aiConfig.js -- Dylan
// chose a bigger, smarter, NOT-yet-pulled model over the previous default).
async function checkModelInstalled(modelName) {
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

// Like checkModelInstalled, but for the everyday text paths (content-request
// and main) that have a known-good fallback to drop back to: if the
// preferred MODEL isn't pulled yet but FALLBACK_MODEL is, use the fallback
// for THIS request instead of hard-blocking every single message on a
// one-time setup step Dylan hasn't gotten to yet. Real example that
// prompted this: Dylan switched MODEL to llama3.1:8b, hadn't run
// `ollama pull` yet, and every message failed outright until he did --
// this keeps chat usable in the meantime, at the smaller model's quality,
// while still telling him plainly (see callers below) that he's on the
// fallback and what to run to get the better one.
async function resolveAvailableModel(preferredModel, fallbackModel) {
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

// Runs one non-vision chat completion. Prefers Groq (see aiConfig.js for
// why -- llama3.2:3b's speed AND quality ceiling on this Mac can't both be
// fixed locally) whenever GROQ_API_KEY is set, and transparently falls back
// to local Ollama if Groq itself fails for this request (rate limit, no
// internet, a Groq outage) -- Groq is a preference, never a hard
// dependency, so the app keeps working exactly as it always did if it's
// unreachable. Every call site hands this a buildBody(model) function that
// returns the OpenAI-compatible request body for whichever model gets
// resolved (Groq's fixed GROQ_MODEL, or Ollama's resolved MODEL/
// FALLBACK_MODEL) -- callers never need their own Groq-vs-Ollama branching.
// `streaming` controls whether stream: true is set (memory-check wants a
// single JSON response, the other two text paths want token-by-token SSE).
async function runChatCompletion(buildBody, { streaming = true, preferGroq = true } = {}) {
  if (preferGroq && GROQ_API_KEY) {
    try {
      const body = buildBody(GROQ_MODEL)
      const groqResponse = await fetchWithTimeout(
        GROQ_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          // include_reasoning: false -- gpt-oss models can return their own
          // internal chain-of-thought in a separate `reasoning` field;
          // Dylan never asked to see that, and the main chat path's JSON
          // action-contract parsing has no use for it either, so it's
          // turned off at the source rather than filtered client-side.
          body: JSON.stringify({ ...body, stream: streaming, include_reasoning: false }),
        },
        GROQ_TIMEOUT_MS,
        'Groq'
      )
      if (!groqResponse.ok) {
        // Session 39: the old `throw new Error('Groq returned 400')` told
        // us THAT it failed but never WHY -- a 400 is Groq rejecting the
        // request body itself (as opposed to a network/rate-limit/outage
        // problem), and the actual reason lives in the response body we
        // were discarding. Reading it here is the whole difference between
        // guessing at the fix and knowing it.
        const errorBody = await groqResponse.text().catch(() => '(could not read response body)')
        throw new Error(`Groq returned ${groqResponse.status}: ${errorBody}`)
      }
      return { response: groqResponse, usedFallback: false, backendNotice: '' }
    } catch (groqError) {
      // Deliberately swallowed here, not re-thrown -- falling through to
      // Ollama below is the whole point of this catch. Logged so a real,
      // recurring Groq problem (a bad key, a dead free-tier account) is
      // still visible in the server log instead of silently invisible.
      console.error('Groq request failed, falling back to local Ollama:', groqError.message)
    }
  }

  const { model: resolvedModel, usedFallback } = await resolveAvailableModel(MODEL, FALLBACK_MODEL)
  const body = buildBody(resolvedModel)
  const response = await fetchWithTimeout(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, keep_alive: KEEP_ALIVE, stream: streaming }),
  })
  if (!response.ok) throw new Error(`Local AI returned ${response.status}`)
  return {
    response,
    usedFallback,
    backendNotice: GROQ_API_KEY
      ? '\n\n(Groq is unreachable right now -- answered with the local model instead.)'
      : '',
  }
}

// One-line, low-noise heads-up appended to a reply when the fallback model
// answered instead of the preferred one -- so a degraded answer is always
// disclosed rather than silently passed off as the smarter model's work.
function fallbackNotice(usedFallback) {
  return usedFallback ? `

(Using ${FALLBACK_MODEL} right now -- run \`ollama pull ${MODEL}\` for smarter answers.)` : ''
}

// Writes one Server-Sent-Events frame. `event` names the frame type the
// frontend switches on ("token" | "done" | "error"); `data` is JSON-encoded
// so the frontend never has to guess at escaping.
function writeSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Reads an Ollama OpenAI-compatible streaming response (`stream: true`) and
// calls onDelta(text) for every token chunk as it arrives. Ollama's stream is
// newline-delimited `data: {...}` lines, terminated by `data: [DONE]` --
// same shape as OpenAI's own streaming API. A malformed line is skipped
// rather than blowing up the whole stream, since one bad line shouldn't cost
// Dylan the rest of an otherwise-good answer.
async function pumpOllamaStream(response, onDelta) {
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

// Each life area gets its own voice AND its own answer structure, not just a
// different accent color in the UI — this is what actually shows up in the
// text the model writes. Pushed harder (session 8) after Dylan reported the
// modes still sounded too similar to each other — each entry now names what
// NOT to sound like, not just what to sound like, since a single positive
// instruction is easy for a 3B model to drift away from.
const MODE_STYLE = {
  school: 'Answer like a sharp study coach: short numbered steps or a checklist, always call out deadlines. Never write flowing paragraphs here — if it is not a step or a list item, cut it.',
  sports: 'Answer like a loud, energetic coach mid-practice: short punchy sentences, imperative verbs ("Run it back", "Push the pace"). A drill list or a quick plan, never a reflective or analytical tone.',
  gym: 'Answer like a strength coach: sets/reps/rest on their own lines, numbers first. Zero fluff, zero motivational filler — just the program.',
  health: 'Keep it short, warm, and clinical-lite: one line summarizing what was logged, one small concrete next step. No jargon, no lecturing.',
  finance: 'Answer like a numbers-first analyst: concrete figures, short line items, one bottom-line takeaway at the end. Cold and precise — no encouragement, no hedging, just the math and the call.',
  skills: 'Answer like a practice coach: one focused suggestion at a time, framed around today\'s practice session. Forward-looking and specific — never generic "keep practicing" filler.',
  reading: 'Write in a genuinely literary, reflective register — longer, more considered sentences are welcome here, the only area that rewards them. Never reduce this to a checklist or bullet points.',
  mind: 'Speak like a calm, rational mentor who respects that Dylan can think for himself -- direct and honest, never harsh, never a cheerleader, never manipulative or guilt-tripping. Ask a real question when one would sharpen his own thinking instead of just handing him an answer.',
  family: 'Write warmly, briefly, and personally — like a thoughtful friend, not a task manager. Never talk about people in terms of metrics or completion percentages.',
}

// Small per-mode temperature spread so the actual sampling behavior differs
// too, not just the wording of the instructions — Finance stays
// tight and repeatable, Reading/Family get more room to vary phrasing.
const MODE_TEMPERATURE = {
  school: 0.2,
  sports: 0.35,
  gym: 0.2,
  health: 0.25,
  finance: 0.1,
  skills: 0.25,
  reading: 0.55,
  mind: 0.3,
  family: 0.45,
}

// Named expert persona per life area — this is what actually makes each
// mode feel like a different specialist rather than the same assistant with
// a tone tweak. Keep these names in sync with assistantName/assistantTitle
// in src/data/lifeModes.js so the UI and the model agree on who's talking.
const MODE_PERSONA = {
  school: { name: 'The Professor', expertise: 'a world-class academic strategist and study coach who has helped students master tough coursework and hit deadlines' },
  sports: { name: 'The Coach', expertise: 'an elite athletic performance coach who has trained competitive athletes on technique, conditioning, and game plans' },
  gym: { name: 'The Trainer', expertise: 'a strength and conditioning expert who programs serious training splits and knows sets, reps, and recovery cold' },
  health: { name: 'The Physician', expertise: 'a health and wellness expert versed in sleep, nutrition, and recovery science — not a replacement for real medical care, and you say so when something sounds like it needs a doctor' },
  finance: { name: 'The Analyst', expertise: 'a sharp financial analyst and trading/investing mentor who thinks in concrete numbers, risk, and net worth the way a top investor would -- ruthless with weak theses, relentless about risk discipline' },
  skills: { name: 'The Mentor', expertise: 'an expert in deliberate practice and skill acquisition who knows how to turn daily reps into real mastery' },
  reading: { name: 'The Librarian', expertise: 'a well-read literary expert with sharp taste who talks about books with real insight, not surface-level summary' },
  mind: { name: 'The Compass', expertise: 'a self-mastery guide combining a rational advisor, a philosophical mentor, and a fair-but-firm coach -- helps Dylan understand and control himself, think more clearly, and make deliberate decisions, without ever insulting him, manipulating him, or just telling him what he wants to hear' },
  family: { name: 'The Anchor', expertise: 'an expert in family relationships, communication, and staying genuinely connected' },
}

// Extra hard rules layered on top of the style/persona framing above, only
// in Finance mode -- this is what turns "The Analyst" persona into the
// specific ruthless, fact-checked, risk-first trading/investing mentor
// Dylan asked for, as concrete behavior rather than a vibe. Kept separate
// from MODE_STYLE so tone (short/cold) and substance (these rules) can be
// edited independently.
const FINANCE_MENTOR_RULES = `
Dylan is a BEGINNER investor currently focused on stocks and ETFs. You are his ruthless, precision-first trading/investing mentor -- not a cheerleader. Follow these rules without exception:
- You have NO live market data and NO internet access. NEVER state a current price, quote, earnings figure, or news item as fact -- you cannot know it. If Dylan's message doesn't give you the number you need, say plainly that you don't have live data and ask him to paste the current price/figures rather than guessing or using a stale number from training.
- Never give a bare buy/sell directive. Every real answer covers: the thesis (his, or ask for one), what would prove it wrong (the invalidation point), a position size appropriate to a beginner, and the risk/reward.
- Risk first. Flag any position or idea sized above roughly 5-10% of his trading capital as overconcentrated for a beginner -- say so by name, every time, even if he doesn't ask. Never encourage margin, leverage, or an all-in position.
- Screen ideas on real criteria -- valuation vs. history/peers, business quality, the actual catalyst and its timeline, risk/reward -- not hype. If his "thesis" is just "it's going up," say so and demand the real one.
- Call out behavior, not just numbers: FOMO language, revenge trading after a loss, chasing something already up big, or skipping his own stated process. Name it directly.
- Be concrete and precise. Give a clear verdict -- "could go either way" is a failure unless the evidence is genuinely split, and if so say exactly what would tip it.
- This is analysis and education, not licensed financial advice -- say so once, briefly, without repeating it every message.
- NEVER issue a blanket refusal ("I can't help with that," "I'm not able to give financial advice," "consult a professional" as a full answer). That is a worse failure than an imperfect answer -- it gives Dylan nothing to work with. If he asks something like "what should I buy" or "top stocks right now," you still don't have live data, so say that once, then immediately do the real job anyway: name concrete, well-known candidates worth him researching (by category/sector if he gave no direction), and run each one through the screening rules above -- thesis, invalidation point, position size, risk/reward. A shortlist to verify and screen is a real answer; silence is not.
`

const MODE_ACTION_DOCS = {
  health: `log_health — use this whenever Dylan mentions eating/drinking something, sleeping, or physical activity, even casually. Fields: category (must be exactly one of "food", "sleep", "water", "activity"), value (a short quantity/summary, e.g. "300 calories" or "7 hours"), note (the specific detail, e.g. "chicken breast" or "ran 3 miles").

Examples:
Dylan: "I ate 300 calories of chicken"
{"reply": "Logged: 300 calories (chicken) under Health.", "action": {"type": "log_health", "category": "food", "value": "300 calories", "note": "chicken"}}

Dylan: "I slept 7 hours last night"
{"reply": "Logged: 7 hours of sleep.", "action": {"type": "log_health", "category": "sleep", "value": "7 hours", "note": ""}}

Dylan: "drank a liter of water"
{"reply": "Logged: 1 liter of water.", "action": {"type": "log_health", "category": "water", "value": "1 liter", "note": ""}}

Dylan: "went for a 3 mile run"
{"reply": "Logged: activity — ran 3 miles.", "action": {"type": "log_health", "category": "activity", "value": "3 miles", "note": "run"}}

`,
  skills: `log_skill_practice — use this whenever Dylan mentions practicing or logging progress on a tracked skill (he can track any number of skills at once -- there is no cap). Fields: skillName (which skill he means, even a partial/casual name — required if he's tracking more than one skill), quantity (a number, in whatever unit that skill uses — reps, pages, problems, etc.), note (optional short detail).

Dylan: "did 20 reps of squats for gym skill"
{"reply": "Logged 20 reps for Gym Skill.", "action": {"type": "log_skill_practice", "skillName": "gym skill", "quantity": 20, "note": ""}}

Dylan: "practiced guitar, got through 3 pages of sheet music"
{"reply": "Logged 3 pages for Guitar.", "action": {"type": "log_skill_practice", "skillName": "guitar", "quantity": 3, "note": "sheet music"}}

If Dylan only has one skill being tracked, skillName can be omitted or guessed loosely — the app will default to it.

`,
  sports: `log_sports_session — use this whenever Dylan logs a practice or game he actually did (not something upcoming -- that's create_event or a task). Fields: sessionType (must be exactly "practice" or "game"), durationMinutes (number, practice only), intensity (short string, practice only, e.g. "hard"), opponent (string, game only), teamScore (number, game only), opponentScore (number, game only), notes (optional).

Dylan: "had a hard 90 minute practice today"
{"reply": "Logged practice (90 min).", "action": {"type": "log_sports_session", "sessionType": "practice", "durationMinutes": 90, "intensity": "hard"}}

Dylan: "we beat Central 4-2 tonight"
{"reply": "Logged game vs Central (win, 4-2).", "action": {"type": "log_sports_session", "sessionType": "game", "opponent": "Central", "teamScore": 4, "opponentScore": 2}}

`,
  gym: `log_gym_set — use this whenever Dylan logs a set he actually lifted for an exercise he already tracks in the Gym tab. Fields: exerciseName (required, even a partial/casual name -- matched against his existing exercise library), weight (number), reps (number), sets (optional -- an array of {weight, reps} instead of the single weight/reps pair, for multiple work sets in one message), date (optional, defaults to today).

Dylan: "hit 225 for 5 on bench"
{"reply": "Logged Bench Press: 225x5.", "action": {"type": "log_gym_set", "exerciseName": "bench press", "weight": 225, "reps": 5}}

Dylan: "3 sets of 135x8 on squats"
{"reply": "Logged Squat: 135x8, 135x8, 135x8.", "action": {"type": "log_gym_set", "exerciseName": "squat", "sets": [{"weight": 135, "reps": 8}, {"weight": 135, "reps": 8}, {"weight": 135, "reps": 8}]}}

If the exercise doesn't match anything in his library, say so in "reply" and ask him to add it in the Gym tab first -- never invent a new exercise name.

`,
  mind: `complete_habit — use this whenever Dylan says he did a habit he already tracks in the Mind tab (not a one-off task). Fields: habitName (required, even a partial/casual name), date (optional, defaults to today).

Dylan: "did my cold shower today"
{"reply": "Marked Cold Shower done for today.", "action": {"type": "complete_habit", "habitName": "cold shower"}}

If the habit doesn't match anything he tracks, ask which habit in "reply" instead.

`,
  finance: `log_transaction — use this whenever Dylan logs real money moving through an actual Finance account he already has (not a hypothetical, and not a trade -- that's Trading). Fields: accountName (required, matched against his existing accounts), transactionType (must be exactly "income" or "expense"), amount (positive number), category (required for an expense, must be exactly one of groceries/dining/transport/housing/utilities/entertainment/shopping/health/subscriptions/other), note (optional), date (optional, defaults to today).

Dylan: "spent 40 bucks on groceries from checking"
{"reply": "Logged -$40.00 (groceries) on Checking.", "action": {"type": "log_transaction", "accountName": "checking", "transactionType": "expense", "amount": 40, "category": "groceries"}}

Dylan: "got paid, 2000 into checking"
{"reply": "Logged +$2000.00 (income) on Checking.", "action": {"type": "log_transaction", "accountName": "checking", "transactionType": "income", "amount": 2000}}

If the account doesn't match anything he has, ask which account in "reply" instead.

`,
  family: `log_family_entry — use this whenever Dylan mentions spending time with a family member he already has in the Family tab, or a faith-practice moment. Fields: entryType (must be exactly "checkin" or "faith"), memberName (required for a checkin, matched against his existing family members), minutesSpent (number, checkin only), note (optional), date (optional, defaults to today).

Dylan: "spent an hour with mom today"
{"reply": "Logged time with Mom (60 min).", "action": {"type": "log_family_entry", "entryType": "checkin", "memberName": "mom", "minutesSpent": 60}}

Dylan: "did my devotional this morning"
{"reply": "Logged faith practice.", "action": {"type": "log_family_entry", "entryType": "faith", "note": "morning devotional"}}

If a checkin's family member doesn't match anyone he has, ask who in "reply" instead.

`,
  reading: `log_reading_session — use this whenever Dylan mentions pages he actually read. Fields: bookTitle (required, even a partial/casual title), pagesRead (positive number), date (optional, defaults to today). Unlike Gym/Mind/Finance/Family, a book he mentions for the first time is added automatically -- there's nothing to configure for it.

Dylan: "read 20 pages of Atomic Habits"
{"reply": "Logged 20 pages of Atomic Habits.", "action": {"type": "log_reading_session", "bookTitle": "Atomic Habits", "pagesRead": 20}}

`,
  school: `complete_assignment — use this whenever Dylan says he finished a school assignment he already has (not a general task). Fields: title (required, even a partial/casual title).

Dylan: "finished my calc homework"
{"reply": "Completed assignment: Calc homework.", "action": {"type": "complete_assignment", "title": "calc homework"}}

If it doesn't match an open assignment, say so in "reply" instead.

`,
}

// Reconstructs the original always-everything prompt for general (non-mode-scoped)
// chat, where we genuinely don't know which action the user might mean.
const ALL_MODE_ACTION_DOCS = Object.values(MODE_ACTION_DOCS).join('')


function personaFraming(modeLabel) {
  const persona = modeLabel ? MODE_PERSONA[modeLabel] : null
  if (!persona) return ''
  return `For this conversation you are "${persona.name}" — ${persona.expertise}. Let that expertise show in the substance and confidence of your answers; don't announce your own name or title back to Dylan every message.`
}

// Ollama sometimes appends stray text after the JSON object, or (rarely, on
// long/unusual requests) hallucinates several JSON objects back to back. Pull
// out just the first complete, balanced {...} rather than trying to parse the
// whole raw string, so one bad tail doesn't blow up the whole reply.
function extractFirstJsonObject(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

router.post('/chat', async (req, res) => {
  // Dylan asked to see how long the AI actually thought. Timed here rather
  // than on the client so it measures real model work, not network jitter
  // or React render time.
  const startedAt = Date.now()

  const { messages: incomingMessages, mode, image } = req.body
  if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
    return res.status(400).json({ error: 'Messages are required' })
  }

  // Bounded sliding window on how much prior conversation actually gets sent
  // to the model. chatThreads persists in localStorage indefinitely per mode
  // (never trimmed on the frontend), so a long-running thread would otherwise
  // resend its ENTIRE history on every single message -- strictly more
  // prefill work every time, which is real, measurable slowness on a small
  // local model. Worse: Ollama's OpenAI-compatible endpoint (what OLLAMA_URL
  // points at) has no per-request way to raise num_ctx -- confirmed against
  // Ollama's own docs, which say the only way is a custom Modelfile -- so an
  // unbounded history is also a real risk of silently pushing the system
  // prompt itself (the JSON-action contract, today's date, all of it) out of
  // whatever the context window actually is. Anything worth keeping across a
  // long conversation already has its own durable path via save_memory (see
  // the MEMORIES block below), so trimming raw turns here costs nothing that
  // actually matters.
  const messages = incomingMessages.length > MAX_CHAT_HISTORY_MESSAGES
    ? incomingMessages.slice(-MAX_CHAT_HISTORY_MESSAGES)
    : incomingMessages

  // From here on, every response this route sends -- success or failure --
  // goes out as Server-Sent Events, so the frontend has exactly one response
  // shape to deal with instead of "JSON on success, but sometimes a
  // different JSON shape and status code on failure." Headers go out now,
  // before any network call that can fail or hang, so a dead/slow Ollama
  // shows up to the client as an `event: error` frame (same as any other
  // failure) instead of a request that just never resolves.
  //
  // This is also the actual fix for Dylan's "I'd like it faster" complaint,
  // backed by his own pasted transcript showing a real 14.7s gap before
  // anything appeared: previously the ENTIRE model response (thinking +
  // generating every token of the JSON-wrapped reply) had to finish before
  // res.json() could send anything at all. Now the model's answer streams
  // out as `event: token` frames the moment each piece of it is generated.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  function sendError(error) {
    writeSSE(res, 'error', {
      error: error?.message || 'Could not connect to the local AI.',
      thinkingMs: Date.now() - startedAt,
    })
    res.end()
  }

  function sendDone(payload) {
    writeSSE(res, 'done', { ...payload, thinkingMs: Date.now() - startedAt })
    res.end()
  }

  try {
    const latestMessage = messages[messages.length - 1]?.content || ''

    // Image-attached messages are a completely separate path — isolated the
    // same way content requests are, so this new (and currently unverified,
    // pending a vision model actually being installed) behavior can't affect
    // the existing text-only chat flow at all.
    if (image) {
      // Check what's actually installed BEFORE spending a request on a model
      // that isn't there -- see checkModelInstalled above.
      await checkModelInstalled(VISION_MODEL)

      const modeLabelForImage = mode && mode !== 'general' ? mode : null
      const visionPersona = personaFraming(modeLabelForImage)
      const visionSystemPrompt = `You are Dylan AI. Dylan sent an image${modeLabelForImage ? ` while in his "${modeLabelForImage}" area` : ''}. ${visionPersona ? `${visionPersona} ` : ''}Describe what's relevant in it and answer his message about it directly and plainly. No JSON, no code fences.`

      const visionResponse = await fetchWithTimeout(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VISION_MODEL,
          keep_alive: KEEP_ALIVE,
          stream: true,
          messages: [
            { role: 'system', content: visionSystemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: latestMessage || 'What do you see in this image?' },
                // Session 40: this was `image_url: { url: image }` -- the
                // OpenAI API's own shape, and what every generic example
                // online shows. Confirmed against Ollama's actual current
                // docs (docs.ollama.com/api/openai-compatibility) that its
                // OpenAI-COMPATIBLE endpoint does NOT mirror that: it wants
                // image_url as the bare base64 data-URL string itself, not
                // nested under a `url` key. The wrong shape doesn't error --
                // Ollama still returns 200 and the model still replies, it
                // just never actually received the image, so the model
                // answers as if nothing was attached. That's exactly "I sent
                // a picture and the AI couldn't read it" with no visible
                // error anywhere -- a silently-ignored field, not a crash.
                { type: 'image_url', image_url: image },
              ],
            },
          ],
          temperature: 0.4,
          max_tokens: 700,
        }),
      })

      if (!visionResponse.ok) {
        const bodyText = await visionResponse.text().catch(() => '')
        throw new Error(
          `Local AI returned ${visionResponse.status} for the vision model "${VISION_MODEL}". ` +
            `Make sure it's pulled (\`ollama pull ${VISION_MODEL}\`) and the name matches \`ollama list\` exactly. ${bodyText.slice(0, 200)}`
        )
      }

      // No JSON wrapper on this path (the vision prompt above explicitly asks
      // for plain text), so every delta is shown to Dylan as-is, no
      // extraction needed.
      let visionReplyText = ''
      await pumpOllamaStream(visionResponse, (delta) => {
        visionReplyText += delta
        writeSSE(res, 'token', { text: delta })
      })

      const visionReply = visionReplyText.trim() || 'No response from Dylan AI.'
      return sendDone({ reply: visionReply, actionPerformed: false, skipMemoryCheck: true })
    }

    const directAction = detectCommand(latestMessage)

    if (directAction) {
      // No model call on this path at all -- it never had a "thinking" delay
      // to fix, so it just reports done immediately with no token frames.
      const actionResult = executeAction(directAction)
      return sendDone({
        reply: actionResult.message || 'Command could not be completed.',
        actionPerformed: actionResult.performed,
        skipMemoryCheck: true,
      })
    }

    const modeLabel = mode && mode !== 'general' ? mode : null
    const modeStyle = modeLabel ? MODE_STYLE[modeLabel] : null

    // Requests to write/draft/plan/explain something substantial skip the
    // JSON-action contract entirely — the model never sees the action schema,
    // so it has no format to hallucinate a fake multi-turn "completing tasks"
    // sequence into. This is the actual fix for that failure mode; the
    // instruction in the main system prompt below is a backstop, not the fix.
    if (looksLikeContentRequest(latestMessage)) {
      const contentSystemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.
${modeLabel ? `You are currently in Dylan's "${modeLabel}" area — keep it relevant to ${modeLabel} unless Dylan clearly asks about something else.
${personaFraming(modeLabel) ? `${personaFraming(modeLabel)}
` : ''}${modeStyle ? `Style for this area: ${modeStyle}
` : ''}` : ''}
Dylan asked you to write, draft, plan, explain, or brainstorm something. Write the complete answer as plain text — no JSON, no code fences, no markdown headers or asterisks. Use plain dashes for lists and blank lines between sections. This is a single response, not a conversation — write the whole thing now and stop; never simulate additional turns, progress updates, or "steps completed."
`
      const { response: contentResponse, usedFallback: contentUsedFallback, backendNotice: contentBackendNotice } = await runChatCompletion((model) => ({
        model,
        messages: [{ role: 'system', content: contentSystemPrompt }, ...messages],
        temperature: modeLabel ? (MODE_TEMPERATURE[modeLabel] ?? 0.4) : 0.4,
        max_tokens: 900,
      }))

      // Same as the vision path -- this prompt also asks for plain text, no
      // JSON wrapper, so deltas stream straight through unmodified.
      let contentText = ''
      await pumpOllamaStream(contentResponse, (delta) => {
        contentText += delta
        writeSSE(res, 'token', { text: delta })
      })

      const contentRaw = contentText.trim()

      return sendDone({
        reply: (contentRaw || 'No response from Dylan AI.') + fallbackNotice(contentUsedFallback) + contentBackendNotice,
        actionPerformed: false,
        skipMemoryCheck: false,
      })
    }

    const memories = loadData('memories').slice(-50)
    const allTasks = loadData('tasks')
    const openTasks = allTasks.filter((t) => !t.completed)
    const goals = loadData('goals')
    const notes = loadData('notes').slice(-50)
    const liveContext = await getLiveContextBlock()

    // Session 40: this system prompt used to cover ONLY tasks/goals/notes/
    // memories, so any question about a specific life area -- "how many
    // classes do I have," anything about workouts, reading, habits, family,
    // accounts -- had zero real data behind it. The model didn't refuse or
    // hedge, it just guessed and stated the guess as fact (a real, confirmed
    // case: asked "how many classes," told 2, actual answer 9). This block
    // gives it real counts and names for every area covered elsewhere in
    // the app, so a gap becomes an honest "I don't have that specific
    // detail" instead of an invented number. Kept to counts/names, not full
    // records, to avoid ballooning every single message's prompt size on
    // top of an already-real speed problem.
    const snapshotClasses = loadData('classes')
    const snapshotAssignments = loadData('assignments')
    const snapshotTests = loadData('tests')
    const snapshotOpenAssignments = snapshotAssignments.filter((a) => !a.completed).length
    const snapshotOpenTests = snapshotTests.filter((t) => !t.completed).length
    const snapshotSportsSessions = loadData('sports_sessions')
    const snapshotGymSessions = loadData('gym_sessions')
    const snapshotGymRoutines = loadData('gym_routines')
    const snapshotToday = todayKey()
    // health.json is inconsistent -- older rows never got a `date` field at
    // all, only `createdAt` (an ISO timestamp). Filtering on `.date` alone
    // silently dropped every entry that predates when `date` was added,
    // which would have made this snapshot say "0 entries today" even on a
    // day with real entries logged -- a false negative that's just as much
    // a lie as the hallucinated numbers this whole feature exists to stop.
    // Falling back to createdAt's LOCAL calendar date (same y/m/d approach
    // todayKey() itself uses, not a UTC string slice) covers both shapes.
    const localDateKeyFromISO = (iso) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const snapshotHealthToday = loadData('health').filter(
      (e) => (e.date || (e.createdAt && localDateKeyFromISO(e.createdAt))) === snapshotToday
    )
    const snapshotFinanceAccounts = loadData('finance_accounts')
    const snapshotNetWorth = snapshotFinanceAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
    const snapshotSkills = loadData('skills').filter((s) => s.active !== false)
    const snapshotBooks = loadData('reading_books').filter((b) => b.status !== 'finished' && b.status !== 'dropped')
    const snapshotHabits = loadData('mind_habits').filter((h) => h.active !== false)
    const snapshotFamily = loadData('family_members')

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
    const pluralY = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`

    const lifeAreasSnapshot = `
LIFE AREAS SNAPSHOT (real counts and names, not estimates -- if Dylan asks about a life area and the detail he wants isn't listed here, say plainly that you don't have that specific detail rather than guessing a number):
- School: ${pluralY(snapshotClasses.length, 'class', 'classes')}${snapshotClasses.length ? ` (${snapshotClasses.map((c) => c.name).join('; ')})` : ''}, ${plural(snapshotOpenAssignments, 'open assignment')} and ${plural(snapshotOpenTests, 'open test')} tracked locally (this does NOT include Canvas-synced assignments/tests -- say you don't have live access to that list if Dylan asks specifically about Canvas items)
- Sports: ${plural(snapshotSportsSessions.length, 'session')} logged
- Gym: ${plural(snapshotGymSessions.length, 'session')} logged, ${plural(snapshotGymRoutines.length, 'routine')} saved
- Health: ${pluralY(snapshotHealthToday.length, 'entry', 'entries')} logged today
- Finance: ${plural(snapshotFinanceAccounts.length, 'account')}${snapshotFinanceAccounts.length ? `, net worth $${snapshotNetWorth.toLocaleString()}` : ''}
- Skills: ${plural(snapshotSkills.length, 'active skill')}${snapshotSkills.length ? ` (${snapshotSkills.map((s) => s.name).join(', ')})` : ''}
- Reading: ${plural(snapshotBooks.length, 'book')} in progress${snapshotBooks.length ? ` (${snapshotBooks.map((b) => `${b.title}: ${b.currentPage}/${b.totalPages || '?'} pages`).join(', ')})` : ''}
- Mind: ${plural(snapshotHabits.length, 'active habit')}${snapshotHabits.length ? ` (${snapshotHabits.map((h) => h.name).join(', ')})` : ''}
- Family: ${plural(snapshotFamily.length, 'member')}${snapshotFamily.length ? ` (${snapshotFamily.map((m) => m.name).join(', ')})` : ''}
`

    // Only pulled in Finance mode -- keeps the prompt short everywhere else,
    // same reasoning as GMAIL/SLACK sections only appearing when connected.
    // Real holdings and screened ideas, not just style rules, are what let
    // the mentor persona actually reference Dylan's own positions instead
    // of speaking in the abstract.
    const tradingContext = modeLabel === 'finance' ? (() => {
      const openPositions = loadData('trading_positions').filter((p) => p.status === 'open')
      const watchlist = loadData('trading_watchlist')
      if (!openPositions.length && !watchlist.length) return ''
      return `
OPEN TRADING POSITIONS:
${openPositions.map((p) => `- ${p.ticker}: ${p.shares} sh @ $${p.avgCost} | Thesis: ${p.thesis} | Invalidation: ${p.invalidation}`).join('\n') || '- None'}

WATCHLIST (ideas being screened, not yet positions):
${watchlist.map((w) => `- ${w.ticker} (${w.verdict}): ${w.thesis}`).join('\n') || '- None'}
`
    })() : ''

    const context = `
CURRENT DYLAN AI DATA

MEMORIES:
${memories.map((m) => `- ${m.content}`).join('\n') || '- None'}

OPEN TASKS (completed tasks are hidden here to keep this short -- they still exist and can still be found/managed by name):
${openTasks.map((t) => `- ${t.title} | Priority: ${t.priority}`).join('\n') || '- None open'}

GOALS:
${goals.map((g) => `- ${g.title} | ${g.progress}% complete`).join('\n') || '- None'}

NOTES:
${notes.map((n) => `- ${n.content}`).join('\n') || '- None'}
${lifeAreasSnapshot}
${tradingContext}
${liveContext}
`

    // Needed so the model can correctly resolve relative dates Dylan
    // actually says out loud -- "tomorrow," "next Friday," "in two weeks."
    // Without this the model has no way to know what day it even is, which
    // makes create_event's proposed start/end dates a guess rather than a
    // calculation. Computed the same way every other "today" in this app
    // is (lib/studyPlan.js's todayKey(), server-local, bare YYYY-MM-DD --
    // consistent with the bare-date convention used everywhere else here).
    const todayForModel = todayKey()
    const weekdayForModel = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const nowForModel = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    const systemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.
Today's date is ${todayForModel} (${weekdayForModel}), current local time is roughly ${nowForModel}. Use this to resolve any relative date or time Dylan mentions ("tomorrow," "next Friday," "in two weeks") into an actual calendar date -- never guess or leave it vague.
${modeLabel ? `\nYou are currently in Dylan's "${modeLabel}" area — keep your focus and suggestions relevant to ${modeLabel} unless Dylan clearly asks about something else.\n${personaFraming(modeLabel) ? `${personaFraming(modeLabel)}\n` : ''}${modeStyle ? `Style for this area: ${modeStyle}\n` : ''}${modeLabel === 'finance' ? FINANCE_MENTOR_RULES : ''}` : ''}
You have access to Dylan's tasks, goals, notes, and memories, plus live data from any of Gmail, Google Drive, and Slack that Dylan has connected (shown below under CURRENT DYLAN AI DATA when connected). If a section like GMAIL or SLACK is missing entirely, that integration is not connected — say so plainly rather than guessing at its contents.

Be concise, useful, organized and action-oriented.

For normal conversation, answer naturally.

CONTENT REQUESTS: If Dylan asks you to write, draft, plan, explain, or brainstorm something substantial (a business plan, an essay, a list, an email, an explanation) — put the FULL answer directly in the "reply" field as plain text (use \n for line breaks, plain dashes for lists, no markdown headers). Set "action" to null. You are having ONE turn of a conversation, not several — never invent follow-up progress updates, never simulate multiple steps being "completed," never produce more than one JSON object. Write the whole thing in this single reply and stop.

If you need to perform an action, return ONLY valid JSON:

{
  "reply": "short response",
  "action": {
    "type": "action_type",
    "title": "",
    "content": "",
    "priority": "medium",
    "progress": 0,
    "dueDate": "",
    "reminder": "none",
    "category": "",
    "value": "",
    "note": ""
  }
}

If no action is needed:

{
  "reply": "short response",
  "action": null
}

AVAILABLE ACTIONS:

create_task
complete_task
delete_task
create_goal
update_goal
create_note
save_memory
forget_memory
${modeLabel && MODE_ACTION_DOCS[modeLabel] ? MODE_ACTION_DOCS[modeLabel] : ALL_MODE_ACTION_DOCS}
create_event — use this whenever Dylan asks to add, schedule, book, or put something on his REAL calendar (not a task -- an actual Apple Calendar event). This NEVER happens immediately: it always requires Dylan's explicit confirmation first, so phrase "reply" as a genuine proposal or question ("I can add 'Team lunch' on Friday, Sept 12 at 6:00 PM -- want me to add it?"), never as if it is already done. Fields: title (required), start (required -- "YYYY-MM-DDTHH:MM:SS" 24-hour local time for a timed event, or bare "YYYY-MM-DD" when allDay is true), end (optional, same format as start), allDay (boolean), location (optional short string), mode (one of school/sports/gym/health/finance/skills/reading/mind/family if Dylan's request is clearly about one of those areas, otherwise omit it). Never set a "recurrence" field -- if Dylan wants something repeating, propose only the first occurrence and mention in "reply" that repeating events need to be set up from the Calendar page directly. If Dylan did not give enough detail to know the date (or time, for a non-allDay event), do not produce a create_event action at all -- ask him what's missing in "reply" instead, with "action" set to null.

Dylan: "add a team lunch this friday at 6pm"
{"reply": "I can add 'Team lunch' on Friday, Sept 12 at 6:00 PM to your calendar -- want me to add it?", "action": {"type": "create_event", "title": "Team lunch", "start": "2026-09-12T18:00:00", "allDay": false}}

Never claim an action happened unless the application actually performed it.

${context}
`

    const { response, usedFallback, backendNotice } = await runChatCompletion((model) => ({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: modeLabel ? (MODE_TEMPERATURE[modeLabel] ?? 0.2) : 0.2,
      max_tokens: 500,
    }))

    // This path is the whole reason streaming needed the JSON-extraction
    // helper: the model wraps its answer in {"reply": "...", "action": {...}}
    // so action-detection has something reliable to parse, and that "action"
    // object always comes AFTER "reply" in the JSON. Without pulling just the
    // reply text out as it arrives, Dylan would still be stuck waiting for
    // the model to finish generating the action block too before seeing a
    // single word -- i.e. still the same 14.7s wait this whole change exists
    // to fix. extractor.feed() hands back only newly-decoded reply text, so
    // only that gets forwarded as token frames; nothing about the action
    // schema or how actions get parsed/executed below changes at all.
    const extractor = createReplyExtractor()
    await pumpOllamaStream(response, (delta) => {
      const newText = extractor.feed(delta)
      if (newText) writeSSE(res, 'token', { text: newText })
    })

    const raw = extractor.getRaw().trim()

    let parsed
    try {
      const cleaned = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
      const jsonSlice = extractFirstJsonObject(cleaned) || cleaned
      parsed = JSON.parse(jsonSlice)
      if (!parsed || typeof parsed.reply !== 'string') throw new Error('malformed shape')
    } catch {
      // Dylan hit this directly: asked for a top-10 fantasy football list,
      // and the model forgot to close the "reply" string before writing
      // "action" -- e.g. `...(RB)\n\naction": { "type": "create_task", ... }`
      // with no closing quote/comma in between. JSON.parse understandably
      // fails on that, and until this fix the fallback below was `reply:
      // raw` -- i.e. the ENTIRE malformed JSON blob (curly braces, escape
      // sequences, the whole action object) got dumped straight into the
      // chat as if it were the answer. That is a real, screenshotted bug,
      // not a hypothetical.
      //
      // Reusing createReplyExtractor -- the same escape-aware "read the
      // reply string value out of possibly-incomplete JSON" logic built for
      // streaming, already unit-tested across 30 chunk/escape combinations
      // -- as a one-shot fallback here recovers just the "reply" text up to
      // wherever its string actually ends, instead of the raw JSON syntax.
      // It is not a perfect recovery (a model malformation like this one can
      // still merge a stray word or two off the following key into the
      // tail of the text), but it reliably hides the JSON structure itself,
      // which is the part that actually looked broken to Dylan.
      const fallbackExtractor = createReplyExtractor()
      // The specific failure Dylan hit leaves one telltale artifact behind:
      // a bare, punctuation-free "action" word trailing the real text
      // (from the missing quote/comma that caused the parse failure in the
      // first place -- decoding stops at the next literal quote, which is
      // the one right after that stray "action"). Stripping just that
      // exact trailing shape is narrow enough not to touch a legitimate
      // reply that happens to end a sentence with the word "action".
      const fallbackReply = fallbackExtractor.feed(raw).replace(/\n+action$/, '').trim()
      parsed = { reply: fallbackReply || raw, action: null }
    }

    // create_event is deliberately never handed to executeAction: every
    // other action here is a same-process, instantly-reversible write to a
    // local JSON file, while this one is a real, one-way write to Dylan's
    // actual Apple/iCloud calendar -- Dylan explicitly chose (session 23)
    // that a 3B model proposing one is not enough on its own, it must be
    // confirmed first. So this branch never touches the calendar; it just
    // hands the proposed fields back to the frontend as `pendingEvent`,
    // which renders Confirm/Cancel and only calls the real
    // POST /calendar/events route (already used by the Calendar page's own
    // manual "add event" form) once Dylan actually clicks Confirm.
    let pendingEvent = null
    if (parsed.action?.type === 'create_event') {
      const { title, start, end, allDay, location, mode: eventMode } = parsed.action
      if (title?.trim() && start) {
        pendingEvent = {
          title: title.trim(),
          start,
          end: end || null,
          allDay: Boolean(allDay),
          location: location || '',
          mode: eventMode || modeLabel || null,
        }
      }
      // Missing title/start: treat as no action at all rather than showing
      // a broken confirm button with nothing to confirm. The system prompt
      // already tells the model to ask a clarifying question instead of
      // proposing an incomplete event, so parsed.reply should already read
      // like a question in this case.
      parsed.action = null
    }

    const actionResult = pendingEvent ? { performed: false, message: '' } : executeAction(parsed.action)
    let finalReply = parsed.reply || raw

    if (actionResult.performed) {
      finalReply = actionResult.message
    } else if (parsed.action && actionResult.message) {
      finalReply = actionResult.message
    }

    // finalReply can legitimately differ from what was just streamed token by
    // token (e.g. the model's own short "reply" text gets swapped for
    // actionResult.message once an action actually runs) -- the `done` frame
    // is always the authoritative final text, and the frontend replaces the
    // in-progress streamed text with it rather than appending.
    sendDone({
      reply: (finalReply || 'No response from Dylan AI.') + fallbackNotice(usedFallback) + backendNotice,
      actionPerformed: actionResult.performed,
      skipMemoryCheck: actionResult.performed,
      pendingEvent,
    })
  } catch (error) {
    // This was the other half of the "real errors reach Dylan" fix from a
    // previous session — the CLIENT side was fixed to show error.message
    // instead of a generic string, but the SERVER was still discarding
    // every specific error (including the vision pre-flight checks above)
    // and always sending back one hardcoded string. Every specific error
    // message built into this route reaches Dylan now, just as an
    // `event: error` SSE frame instead of a 500 JSON response, since SSE
    // headers are already committed by the time any of this route's logic
    // runs.
    console.error('Chat failed:', error)
    sendError(error)
  }
})

router.post('/memory-check', async (req, res) => {
  try {
    const { message } = req.body
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }

    if (detectCommand(message)) {
      return res.json({ shouldSuggest: false, memory: '' })
    }

    // Same fallback as the main chat paths -- memory detection is already
    // fire-and-forget/non-blocking (see aiConfig.js history), so this was
    // never going to surface an error to Dylan either way, but there's no
    // reason to skip a memory this could have caught just because the
    // bigger model isn't pulled yet when the smaller one still works fine
    // for this narrow a task.
    // preferGroq: false -- this is a tiny, fire-and-forget classification
    // call (max_tokens: 80, temp 0) that never needed Groq's bigger model
    // in the first place, and it runs on every single message Dylan
    // sends. Spending a Groq request on it doubled how fast a real chat
    // session burned through the free tier's per-minute cap for no
    // quality benefit here -- routing it straight to local Ollama instead
    // leaves that whole budget for the calls that actually show up on
    // screen and are worth waiting on.
    const { response } = await runChatCompletion((model) => ({
      model,
      messages: [
        {
          role: 'system',
          content: `
You are a memory detector.

Suggest a memory whenever the user's message reveals something worth remembering about him long-term -- not just an explicit "remember that" statement. This includes, mentioned in ANY of these ways -- directly stated, mentioned in passing, or implied by what he's doing:
- Facts about himself (school, sports, family, routines, schedule)
- Preferences, opinions, likes/dislikes ("I hate mornings," "I prefer typing over voice")
- Goals, plans, or things he's working toward
- Named specifics he uses regularly (an account, tool, app, teacher, coach, teammate, or place he mentions)
- Ongoing projects or commitments, even mentioned casually ("I'm building an app," "I'm on the team this year")

Still never invent information -- only extract what's explicitly and literally present in the user's message below, worded as a real durable fact rather than a quote of the whole message. If the message genuinely contains nothing worth remembering later, return NONE.

Do not suggest memories for commands, questions, greetings, small talk with no lasting content, or purely temporary/one-off information (e.g. "I'm tired right now" is temporary; "I usually get tired around 2pm" is a routine worth keeping).

Return ONLY:

MEMORY: <fact directly stated>

or:

NONE
`,
          },
        { role: 'user', content: message.trim() },
      ],
      temperature: 0,
      max_tokens: 80,
    }), { streaming: false, preferGroq: false })

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''

    if (raw.toUpperCase().startsWith('MEMORY:')) {
      const memory = raw.replace(/^MEMORY:\s*/i, '').trim()
      if (memory) {
        return res.json({ shouldSuggest: true, memory })
      }
    }

    res.json({ shouldSuggest: false, memory: '' })
  } catch (error) {
    console.error('Memory check failed:', error)
    res.json({ shouldSuggest: false, memory: '' })
  }
})

export default router
