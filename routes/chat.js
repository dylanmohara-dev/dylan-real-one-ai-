import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'
import { getPersonalContext } from '../lib/personalContext.js'
import { buildDecisionBrief, formatDecisionBrief, isDecisionQuestion } from '../lib/decisionEngine.js'
import { detectCommand, executeAction, looksLikeContentRequest, looksLikeLiveDataRequest } from '../lib/assistant.js'
import { executeActionWithPolicy, confirmPendingAction, cancelPendingAction } from '../lib/actionExecutor.js'
import { createEvent } from '../lib/appleCalendar.js'
import { getCalendarScheduleSource } from '../lib/calendarScheduleSource.js'
import { getUpcomingAssignments, isConnected as isCanvasConnected } from '../lib/canvas.js'
import { webSearch } from '../lib/webSearch.js'
import { getLiveContextBlock } from '../lib/liveContext.js'
import { createReplyExtractor } from '../lib/streamingJson.js'
import { todayKey } from '../lib/studyPlan.js'
import { fetchQuotes } from '../lib/marketData.js'
import { fetchTechnicals } from '../lib/technicals.js'
import { checkModel, complete, streamTokens } from '../lib/aiGateway.js'
import {
  MODEL,
  FALLBACK_MODEL,
  VISION_MODEL,
  MAX_CHAT_HISTORY_MESSAGES,
} from '../lib/aiConfig.js'

const router = Router()




// Every outbound call in this file used to be a bare fetch() with no timeout.
// That is why chat could sit on the "thinking" animation forever instead of
// failing: a stalled socket never rejects, so the route never returned, the
// client never got a response, and its spinner had nothing to turn off. A
// hang is strictly worse than an error — an error at least tells you what to
// fix. Everything below is now bounded.


// Runs one non-vision chat completion. Prefers Groq (see aiConfig.js for
// why -- llama3.2:3b's speed AND quality ceiling on this Mac can't both be
// fixed locally) whenever GROQ_API_KEY is set, and transparently falls back
// to local Ollama if Groq itself fails for this request (rate limit, no
// internet, a Groq outage) -- Groq is a preference, never a hard
// dependency, so the app keeps working exactly as it always did if it's
// unreachable. Every call site hands this a buildBody(model) function that
// returns the OpenAI-compatible request body for whichever model gets
// FALLBACK_MODEL) -- callers never need their own Groq-vs-Ollama branching.
// `streaming` controls whether stream: true is set (memory-check wants a
// single JSON response, the other two text paths want token-by-token SSE).
async function runChatCompletion(buildBody, { streaming = true, preferGroq = true } = {}) {
  return complete(buildBody, { streaming, preferCloud: preferGroq })
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
- You have REAL live price + RSI(14)/trend data ONLY for tickers Dylan already holds as an open position or has on his watchlist -- shown per-ticker below under OPEN TRADING POSITIONS / WATCHLIST as "| LIVE: ...". Use those numbers as fact when present; never restate or round them from memory, always read the figure given. For any OTHER ticker (a brand-new name Dylan asks about that isn't on his watchlist yet, or one marked "LIVE: no data"), you have NO live market data and NO internet access -- NEVER state a current price, quote, earnings figure, or news item as fact for it. Say plainly you don't have live data on that one, tell him to add it to his watchlist first (so the next message has real numbers) or paste the current price/figures himself, and never guess or use a stale number from training.
- Never give a bare buy/sell directive. Every real answer covers: the thesis (his, or ask for one), what would prove it wrong (the invalidation point), a position size appropriate to a beginner, and the risk/reward.
- Risk first. Flag any position or idea sized above roughly 5-10% of his trading capital as overconcentrated for a beginner -- say so by name, every time, even if he doesn't ask. Never encourage margin, leverage, or an all-in position.
- Screen ideas on real criteria -- valuation vs. history/peers, business quality, the actual catalyst and its timeline, risk/reward -- not hype. If his "thesis" is just "it's going up," say so and demand the real one.
- Call out behavior, not just numbers: FOMO language, revenge trading after a loss, chasing something already up big, or skipping his own stated process. Name it directly.
- Be concrete and precise. Give a clear verdict -- "could go either way" is a failure unless the evidence is genuinely split, and if so say exactly what would tip it.
- This is analysis and education, not licensed financial advice -- say so once, briefly, without repeating it every message.
- NEVER issue a blanket refusal ("I can't help with that," "I'm not able to give financial advice," "consult a professional" as a full answer). That is a worse failure than an imperfect answer -- it gives Dylan nothing to work with. If he asks something like "what should I buy" or "top stocks right now," you still don't have live data, so say that once, then immediately do the real job anyway: name concrete, well-known candidates worth him researching (by category/sector if he gave no direction), and run each one through the screening rules above -- thesis, invalidation point, position size, risk/reward. A shortlist to verify and screen is a real answer; silence is not.
`

// Extra hard rules layered on top of the style/persona framing above, only
// in Skills mode -- same reasoning as FINANCE_MENTOR_RULES: turn "The
// Mentor" persona into concrete deliberate-practice coaching behavior
// instead of a vibe, grounded in Dylan's REAL level/streak/quest data
// (assembled in the personal context below), never a guess.
const SKILLS_MENTOR_RULES = `
You coach deliberate practice, not generic encouragement. Follow these rules without exception:
- You have current level, XP, streak, and weekly quest data for active skills in the relevant mode context below. Use only the figures supplied there; never estimate or round from memory.
- Never say just "good job" or "keep practicing." Every real answer gives one concrete, specific next action for TODAY's session -- what to focus on, a target quantity, or a specific weak point to drill -- grounded in what he actually told you he practiced.
- If a streak broke, say so plainly and matter-of-factly (not a lecture), then immediately pivot to today: "the streak reset, here's the one thing that gets a new one started today."
- If a weekly quest (shown in the relevant mode context) is close to completion, point it out -- use only its supplied progress and target.
- Call out when effort is spread too thin (many skills logged once, none with real reps) versus genuine progress (consistent reps on fewer skills) -- deliberate practice rewards focus and repetition, not breadth for its own sake.
- Deliberate practice, not just volume: push for a specific sub-skill or weak point to isolate and drill, not just "do more reps" -- ask what felt hardest in today's session if he hasn't said.
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

set_budget — use this whenever Dylan tells you a monthly spending limit for one category, instead of him clicking into that category's box on the Budget tab himself. Fields: category (required, must be exactly one of groceries/dining/transport/housing/utilities/entertainment/shopping/health/subscriptions/other), monthlyLimit (positive number; 0 or omitted clears that category's budget instead of setting one).

Dylan: "set my grocery budget to 400 a month"
{"reply": "Set groceries budget to $400.00/month.", "action": {"type": "set_budget", "category": "groceries", "monthlyLimit": 400}}

Dylan: "take off my dining budget, I don't want a limit there anymore"
{"reply": "Cleared the dining budget.", "action": {"type": "set_budget", "category": "dining", "monthlyLimit": 0}}

If the category he means isn't one of the ten listed above, ask which one in "reply" instead.

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

  // Session 41 bug: the frontend (useAppData.js's sendMessage) stores an
  // `image` field on EVERY user message object it keeps in chatThreads --
  // not just ones that actually attached an image, it's `imageDataUrl ||
  // null` every time -- so that it can re-render a past image if the thread
  // is ever reloaded. That's correct for the frontend's own state, but this
  // `messages` array is exactly that same object shape, spread straight
  // into the Groq request body below (`...messages`). Groq's endpoint does
  // strict schema validation on `role: user` messages and rejects ANY
  // extra property, even `image: null` -- confirmed via Dylan's own pasted
  // log: `'messages.1' : property 'image' is unsupported`. That means
  // *every* chat message, not just ones following an image, has been
  // falling back to local Ollama ever since that frontend field was added --
  // which is exactly why re-keying Groq's dead API key alone didn't speed
  // anything up. Stripping down to just {role, content} here, once, before
  // any model call, fixes every call site without touching the frontend's
  // own (correct) state shape.
  const modelMessages = messages.map((m) => ({ role: m.role, content: m.content }))

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
    const decisionQuestion = isDecisionQuestion(latestMessage)

    // Image-attached messages are a completely separate path — isolated the
    // same way content requests are, so this new (and currently unverified,
    // pending a vision model actually being installed) behavior can't affect
    // the existing text-only chat flow at all.
    if (image) {
      // Check what's actually installed BEFORE spending a request on a model
      // that isn't there -- see checkModelInstalled above.
      await checkModel(VISION_MODEL)

      const modeLabelForImage = mode && mode !== 'general' ? mode : null
      const visionPersona = personaFraming(modeLabelForImage)
      const visionSystemPrompt = `You are Dylan AI. Dylan sent an image${modeLabelForImage ? ` while in his "${modeLabelForImage}" area` : ''}. ${visionPersona ? `${visionPersona} ` : ''}Describe what's relevant in it and answer his message about it directly and plainly. No JSON, no code fences.`

      const { response: visionResponse } = await complete(
        () => ({
          model: VISION_MODEL,
          messages: [
            { role: 'system', content: visionSystemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: latestMessage || 'What do you see in this image?' },
                // Ollama's OpenAI-compatible endpoint expects image_url as the
                // bare base64 data-URL string, not { url: image }.
                { type: 'image_url', image_url: image },
              ],
            },
          ],
          temperature: 0.4,
          max_tokens: 700,
        }),
        {
          streaming: true,
          preferCloud: false,
          forceLocal: true,
          modelOverride: VISION_MODEL,
        }
      )

      if (!visionResponse.ok) {
        const bodyText = await visionResponse.text().catch(() => '')
        throw new Error(
          `Local AI returned ${visionResponse.status} for the vision model "${VISION_MODEL}". ` +
            `Make sure it's pulled (\`ollama pull ${VISION_MODEL}\`) and the name matches \`ollama list\` exactly. ${bodyText.slice(0, 200)}`
        )
      }

      let visionReplyText = ''
      await streamTokens(visionResponse, (delta) => {
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
      const actionResult = await executeActionWithPolicy(directAction, {
        actionsEnabled: req.body?.settings?.allowActions !== false,
        explicitlyRequested: directAction.type === 'save_memory',
        executionContext: { modeScope: mode || 'general' },
      })
      return sendDone({
        reply: actionResult.message || 'Command could not be completed.',
        actionPerformed: actionResult.performed,
        skipMemoryCheck: true,
        pendingAction: actionResult.pendingAction || null,
      })
    }

    const modeLabel = mode && mode !== 'general' ? mode : null
    const modeStyle = modeLabel ? MODE_STYLE[modeLabel] : null

    // Session 41: Dylan asked why the chat can't answer "how many yards does
    // Joe Burrow have" or "what's happening with the Phillies-Braves series."
    // The honest "I don't have that" the model was giving is correct --
    // neither Groq nor local Ollama has internet access -- but not what he
    // wants. This runs a real search (lib/webSearch.js, Tavily) only for
    // questions that look time-sensitive, and hands the model real results
    // to answer from. Checked before the JSON-action contract for the same
    // reason looksLikeContentRequest is below: no action schema for the
    // model to hallucinate fake progress into. If TAVILY_API_KEY isn't set,
    // or the search fails or comes back empty, this falls straight through
    // to the normal flow -- live search is a bonus, never a hard dependency.
    if (looksLikeLiveDataRequest(latestMessage)) {
      // Round 3 bug: "game yesterday" as a bare follow-up, with "Phillies
      // Braves" only mentioned a turn or two earlier, was searched as just
      // that literal fragment -- no team names, nothing for Tavily to
      // anchor on, which is exactly how it surfaced an unrelated stale
      // game. Pulling in the last couple of Dylan's own messages (not the
      // assistant's replies, which would just be noise/already-wrong
      // answers feeding back in) gives the search the same context Dylan
      // himself was relying on when he typed a short follow-up.
      const recentUserText = messages
        .filter((m) => m.role === 'user')
        .slice(-2)
        .map((m) => m.content)
        .join(' ')
      const searchQuery = recentUserText.trim() || latestMessage

      const searchResult = await webSearch(searchQuery)

      if (searchResult.ok && (searchResult.results.length > 0 || searchResult.answer)) {
        const sourcesBlock = searchResult.results
          .map((r, i) => `${i + 1}. [${r.publishedDate || 'date unknown'}] ${r.title} -- ${r.snippet} (${r.url})`)
          .join('\n')

        // Round 3 bug #2: the model had no idea what "today" actually is,
        // so even a correctly-dated result couldn't be checked against
        // "yesterday" -- it just guessed. todayKey() is the same
        // server-local date already used elsewhere in this file (see
        // todayForModel below) for exactly this reason.
        const liveDataToday = todayKey()

        const liveDataSystemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.
${modeLabel ? `You are currently in Dylan's "${modeLabel}" area — keep it relevant to ${modeLabel} unless Dylan clearly asks about something else.
` : ''}
Today's real date is ${liveDataToday}. Dylan asked a time-sensitive question. Below are real, just-fetched web search results, each tagged with its actual publish date where known -- this is the ONLY source of truth for this answer.

Hard rules, no exceptions:
- Every number, name, score, date, or specific detail you state must appear literally in the text below. Do not calculate, round, estimate, or "fill in" anything not written there -- not a single stat, not a score, not a play-by-play detail like who scored.
- Compare each result's tagged date against today's real date (${liveDataToday}) yourself before calling anything "today's," "yesterday's," or "the latest" -- if the closest result is from several days or weeks ago, say the actual date instead of implying it's current.
- If the results partially answer the question, state only the part they actually support, and say what's missing rather than guessing the rest.
- If the results don't answer it at all, say so directly -- an honest "I couldn't find that" beats a confident wrong answer every time.

Write plain text -- no JSON, no code fences, no markdown headers or asterisks.
${searchResult.answer ? `
Quick answer from search: ${searchResult.answer}
` : ''}
Search results:
${sourcesBlock || '(no detailed results, just the quick answer above)'}
`
        const { response: liveResponse, usedFallback: liveUsedFallback, backendNotice: liveBackendNotice } = await runChatCompletion((model) => ({
          model,
          messages: [{ role: 'system', content: liveDataSystemPrompt }, ...modelMessages],
          temperature: 0.2,
          max_tokens: 500,
        }))

        let liveText = ''
        await pumpOllamaStream(liveResponse, (delta) => {
          liveText += delta
          writeSSE(res, 'token', { text: delta })
        })

        const liveRaw = liveText.trim()

        return sendDone({
          reply: (liveRaw || 'No response from Dylan AI.') + fallbackNotice(liveUsedFallback) + liveBackendNotice,
          actionPerformed: false,
          skipMemoryCheck: true,
        })
      }
      // No key set, search failed, or came back empty -- fall through to
      // the normal flow below rather than blocking the whole chat on this.
    }

    // Requests to write/draft/plan/explain something substantial skip the
    // JSON-action contract entirely — the model never sees the action schema,
    // so it has no format to hallucinate a fake multi-turn "completing tasks"
    // sequence into. This is the actual fix for that failure mode; the
    // instruction in the main system prompt below is a backstop, not the fix.
    if (looksLikeContentRequest(latestMessage) && !decisionQuestion) {
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
        messages: [{ role: 'system', content: contentSystemPrompt }, ...modelMessages],
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

    let calendarSource = { events: [], status: { source: 'apple_calendar', state: 'unknown', eventCount: null } }
    let canvasAssignments = []
    if (decisionQuestion) {
      calendarSource = await getCalendarScheduleSource()
      if (isCanvasConnected()) {
        try {
          canvasAssignments = await getUpcomingAssignments()
        } catch (error) {
          console.warn('Could not load Canvas work for decision brief:', error?.message || error)
        }
      }
    }
    const personalContext = getPersonalContext({
      mode: mode || 'general',
      conversationContext: latestMessage,
      preferences: req.body?.settings,
      includeCommitments: decisionQuestion,
      calendarEvents: calendarSource.events,
      calendarStatus: calendarSource.status,
      canvasAssignments,
    })
    const decisionBrief = decisionQuestion ? buildDecisionBrief(personalContext) : null
    const liveContext = await getLiveContextBlock()

    // Only pulled in Finance mode -- keeps the prompt short everywhere else,
    // same reasoning as GMAIL/SLACK sections only appearing when connected.
    // Real holdings and screened ideas, not just style rules, are what let
    // the mentor persona actually reference Dylan's own positions instead
    // of speaking in the abstract.
    const tradingContext = modeLabel === 'finance' ? await (async () => {
      const openPositions = loadData('trading_positions').filter((p) => p.status === 'open')
      const watchlist = loadData('trading_watchlist')
      if (!openPositions.length && !watchlist.length) return ''

      // Real quotes + RSI/trend for every ticker Dylan actually holds or is
      // screening -- the exact same lib/marketData.js + lib/technicals.js
      // Market Pulse and the Macro Desk already use, so the Analyst is
      // never a second, divergent source of truth for the same number.
      // Twelve Data's free tier (TWELVE_DATA_API_KEY in aiConfig.js) gates
      // this the same way it gates every other live-data surface in this
      // app -- a missing/invalid key means quotes/technicals come back
      // {ok: false}, and liveLine() below just says so per ticker rather
      // than fabricating a number. This is what finally lets FINANCE_MENTOR
      // _RULES' old blanket "you have no live data" instruction retire --
      // see that block immediately below this one.
      const allTickers = [...new Set([...openPositions.map((p) => p.ticker), ...watchlist.map((w) => w.ticker)])]
      const [quoteResult, technicalResult] = await Promise.all([
        fetchQuotes(allTickers),
        fetchTechnicals(allTickers),
      ])
      const quotes = quoteResult.ok ? quoteResult.quotes : {}
      const technicals = technicalResult.ok ? technicalResult.technicals : {}

      const liveLine = (ticker) => {
        const q = quotes[ticker]
        const t = technicals[ticker]
        const parts = []
        if (q) parts.push(`external market quote $${q.price.toFixed(2)} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% today)`)
        if (t && t.rsi !== null) parts.push(`external technical data RSI(14) ${t.rsi}, trend ${t.trend || 'unknown'}, bias ${t.bias || 'unknown'}`)
        return parts.length ? ` | LIVE: ${parts.join(', ')}` : ' | LIVE: no external data for this ticker (not covered by Twelve Data free tier, or key missing/invalid)'
      }

      return `
CURRENT STRUCTURED TRADING RECORDS — open positions:
${openPositions.map((p) => `- ${p.ticker}: ${p.shares} sh @ $${p.avgCost} | Thesis: ${p.thesis} | Invalidation: ${p.invalidation}${liveLine(p.ticker)}`).join('\n') || '- None'}

CURRENT STRUCTURED TRADING RECORDS — watchlist (ideas being screened, not yet positions):
${watchlist.map((w) => `- ${w.ticker} (${w.verdict}): ${w.thesis}${liveLine(w.ticker)}`).join('\n') || '- None'}
`
    })() : ''

    const context = `
CURRENT DYLAN AI DATA
${personalContext.prompt}
${decisionBrief ? formatDecisionBrief(decisionBrief) : ''}
${tradingContext}
${liveContext ? `EXTERNAL DATA — connected integrations; use only the content actually provided below\n${liveContext}` : ''}
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
${modeLabel ? `\nYou are currently in Dylan's "${modeLabel}" area — keep your focus and suggestions relevant to ${modeLabel} unless Dylan clearly asks about something else.\n${personaFraming(modeLabel) ? `${personaFraming(modeLabel)}\n` : ''}${modeStyle ? `Style for this area: ${modeStyle}\n` : ''}${modeLabel === 'finance' ? FINANCE_MENTOR_RULES : ''}${modeLabel === 'skills' ? SKILLS_MENTOR_RULES : ''}` : ''}
PROVENANCE AND CLAIMS: Treat current structured records/settings in CURRENT DYLAN AI DATA as facts about the recorded state. Treat stored memories and notes as user-provided content that may be historical. Values labeled calculated/derived are summaries computed from source records, not independently recorded facts. Treat external data as facts only to the extent the supplied source content supports them. Never invent missing facts about Dylan. AI-GENERATED INFERENCE / RECOMMENDATION: Any inference or recommendation you produce is generated analysis, not a stored or known user fact. Label inferences as tentative and explain which supplied facts they rely on; phrase recommendations as suggestions (for example, "One option you could consider is…").
${decisionBrief ? 'DECISION REQUEST: The DECISION BRIEF is read-only evidence, not a command or complete plan. Recommend only among its actual candidates, cite their supplied evidence, state uncertainty when ranking is weak, and label your choice as an AI recommendation. Historical memories and derived summaries are context only and do not prove a current obligation. Do not create or change records for this request; return "action": null.' : ''}
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
      messages: [{ role: 'system', content: systemPrompt }, ...modelMessages],
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

    // All returned actions pass through the same server policy boundary.
    // create_event remains an explicit-confirmation proposal and is adapted
    // to the existing pendingEvent response consumed by the current UI.
    let pendingEvent = null
    const actionResult = await executeActionWithPolicy(parsed.action, {
      actionsEnabled: req.body?.settings?.allowActions !== false,
      // detectCommand runs before the model call and handles explicit
      // "remember ..." requests; a model-generated action is never proof.
      explicitlyRequested: false,
      executionContext: { modeScope: mode || 'general' },
    })
    let pendingAction = actionResult.pendingAction || null

    if (pendingAction?.type === 'create_event') {
      const { title, start, end, allDay, location, mode: eventMode } = pendingAction.action
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
      // Do not expose an incomplete calendar proposal.
      if (!pendingEvent) pendingAction = null
    }
    let finalReply = parsed.reply || raw

    if (actionResult.performed) {
      finalReply = actionResult.message
    } else if (pendingAction && pendingEvent) {
      // Keep the model's proposed wording alongside the existing calendar
      // confirmation card.
      finalReply = parsed.reply || actionResult.message
    } else if (actionResult.message) {
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
      skipMemoryCheck: Boolean(parsed.action),
      pendingEvent,
      pendingAction,
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

router.post('/chat/confirm-action', async (req, res) => {
  const id = req.body?.id
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Action confirmation token is required.' })
  }

  try {
    const result = await confirmPendingAction(id, {
      execute: async (action) => {
        if (action.type === 'create_event') {
          await createEvent(action)
          return { performed: true, message: `Added ${action.title} to your calendar.` }
        }
        return executeAction(action)
      },
    })
    if (result.status !== 'executed') {
      return res.status(result.status === 'expired' ? 410 : 400).json({ error: result.message })
    }
    return res.json({ success: true, reply: result.message })
  } catch (error) {
    console.error('Action confirmation failed:', error)
    return res.status(400).json({ error: error?.message || 'Could not perform the confirmed action.' })
  }
})

router.post('/chat/cancel-action', (req, res) => {
  const id = req.body?.id
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Action confirmation token is required.' })
  }
  cancelPendingAction(id)
  return res.json({ success: true })
})

router.post('/memory-check', async (req, res) => {
  try {
    const { message, mode } = req.body
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
        const modeScope = ['general', 'school', 'sports', 'gym', 'health', 'finance', 'skills', 'reading', 'mind', 'family'].includes(mode) ? mode : 'general'
        return res.json({
          shouldSuggest: true,
          memory,
          metadata: {
            source: 'suggestion',
            modeScope,
            sharingPermission: modeScope === 'general' ? 'all_modes' : 'mode_only',
            sensitivity: ['health', 'finance'].includes(modeScope) ? 'sensitive' : 'normal',
          },
        })
      }
    }

    res.json({ shouldSuggest: false, memory: '' })
  } catch (error) {
    console.error('Memory check failed:', error)
    res.json({ shouldSuggest: false, memory: '' })
  }
})

export default router
