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
  VISION_MODEL,
  OLLAMA_TIMEOUT_MS,
  OLLAMA_PING_TIMEOUT_MS,
  KEEP_ALIVE,
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
  discipline: 'Be blunt, short, almost cold — like a drill sergeant reading a checklist aloud. No hedging, no encouragement, no "great job," just what was done and what is next.',
  family: 'Write warmly, briefly, and personally — like a thoughtful friend, not a task manager. Never talk about people in terms of metrics or completion percentages.',
}

// Small per-mode temperature spread so the actual sampling behavior differs
// too, not just the wording of the instructions — Discipline/Finance stay
// tight and repeatable, Reading/Family get more room to vary phrasing.
const MODE_TEMPERATURE = {
  school: 0.2,
  sports: 0.35,
  gym: 0.2,
  health: 0.25,
  finance: 0.1,
  skills: 0.25,
  reading: 0.55,
  discipline: 0.1,
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
  finance: { name: 'The Analyst', expertise: 'a sharp financial analyst who thinks in concrete numbers, risk, and net worth, the way a top investor would' },
  skills: { name: 'The Mentor', expertise: 'an expert in deliberate practice and skill acquisition who knows how to turn daily reps into real mastery' },
  reading: { name: 'The Librarian', expertise: 'a well-read literary expert with sharp taste who talks about books with real insight, not surface-level summary' },
  discipline: { name: 'The Enforcer', expertise: 'a no-excuses accountability expert who cares about follow-through above everything else' },
  family: { name: 'The Anchor', expertise: 'an expert in family relationships, communication, and staying genuinely connected' },
}

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

  const { messages, mode, image } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required' })
  }

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
      // that isn't there — this turns "some HTTP error came back" into an
      // unmistakable, specific instruction. Ollama's native /api/tags (not
      // the OpenAI-compat endpoint) is what lists installed models.
      let installedModels = []
      try {
        const tagsResponse = await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`, {}, OLLAMA_PING_TIMEOUT_MS, 'Ollama')
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json()
          installedModels = (tagsData.models || []).map((m) => m.name)
        }
      } catch {
        throw new Error(
          `Could not reach Ollama at all (${OLLAMA_HOST}). Is it running? Try \`ollama serve\` ` +
            'or open the Ollama app, then send the image again.'
        )
      }

      const hasVisionModel = installedModels.some(
        (name) => name === VISION_MODEL || name.startsWith(`${VISION_MODEL}:`)
      )

      if (!hasVisionModel) {
        throw new Error(
          `No vision model installed. Dylan AI is currently set to look for "${VISION_MODEL}", but ` +
            `\`ollama list\` shows: ${installedModels.length ? installedModels.join(', ') : '(nothing installed at all)'}. ` +
            `Run \`ollama pull ${VISION_MODEL}\` (or pull a different vision model like moondream or llama3.2-vision and ` +
            'tell me its exact name so I can update VISION_MODEL in routes/chat.js to match).'
        )
      }

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
                { type: 'image_url', image_url: { url: image } },
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
      const contentResponse = await fetchWithTimeout(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          keep_alive: KEEP_ALIVE,
          stream: true,
          messages: [{ role: 'system', content: contentSystemPrompt }, ...messages],
          temperature: modeLabel ? (MODE_TEMPERATURE[modeLabel] ?? 0.4) : 0.4,
          max_tokens: 900,
        }),
      })

      if (!contentResponse.ok) {
        throw new Error(`Local AI returned ${contentResponse.status}`)
      }

      // Same as the vision path -- this prompt also asks for plain text, no
      // JSON wrapper, so deltas stream straight through unmodified.
      let contentText = ''
      await pumpOllamaStream(contentResponse, (delta) => {
        contentText += delta
        writeSSE(res, 'token', { text: delta })
      })

      const contentRaw = contentText.trim()

      return sendDone({
        reply: contentRaw || 'No response from Dylan AI.',
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
${modeLabel ? `\nYou are currently in Dylan's "${modeLabel}" area — keep your focus and suggestions relevant to ${modeLabel} unless Dylan clearly asks about something else.\n${personaFraming(modeLabel) ? `${personaFraming(modeLabel)}\n` : ''}${modeStyle ? `Style for this area: ${modeStyle}\n` : ''}` : ''}
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
log_health — use this whenever Dylan mentions eating/drinking something, sleeping, or physical activity, even casually. Fields: category (must be exactly one of "food", "sleep", "water", "activity"), value (a short quantity/summary, e.g. "300 calories" or "7 hours"), note (the specific detail, e.g. "chicken breast" or "ran 3 miles").

Examples:
Dylan: "I ate 300 calories of chicken"
{"reply": "Logged: 300 calories (chicken) under Health.", "action": {"type": "log_health", "category": "food", "value": "300 calories", "note": "chicken"}}

Dylan: "I slept 7 hours last night"
{"reply": "Logged: 7 hours of sleep.", "action": {"type": "log_health", "category": "sleep", "value": "7 hours", "note": ""}}

Dylan: "drank a liter of water"
{"reply": "Logged: 1 liter of water.", "action": {"type": "log_health", "category": "water", "value": "1 liter", "note": ""}}

Dylan: "went for a 3 mile run"
{"reply": "Logged: activity — ran 3 miles.", "action": {"type": "log_health", "category": "activity", "value": "3 miles", "note": "run"}}

log_skill_practice — use this whenever Dylan mentions practicing or logging progress on a tracked skill (he can track up to 3 at once). Fields: skillName (which skill he means, even a partial/casual name — required if he's tracking more than one skill), quantity (a number, in whatever unit that skill uses — reps, pages, problems, etc.), note (optional short detail).

Dylan: "did 20 reps of squats for gym skill"
{"reply": "Logged 20 reps for Gym Skill.", "action": {"type": "log_skill_practice", "skillName": "gym skill", "quantity": 20, "note": ""}}

Dylan: "practiced guitar, got through 3 pages of sheet music"
{"reply": "Logged 3 pages for Guitar.", "action": {"type": "log_skill_practice", "skillName": "guitar", "quantity": 3, "note": "sheet music"}}

If Dylan only has one skill being tracked, skillName can be omitted or guessed loosely — the app will default to it.

create_event — use this whenever Dylan asks to add, schedule, book, or put something on his REAL calendar (not a task -- an actual Apple Calendar event). This NEVER happens immediately: it always requires Dylan's explicit confirmation first, so phrase "reply" as a genuine proposal or question ("I can add 'Team lunch' on Friday, Sept 12 at 6:00 PM -- want me to add it?"), never as if it is already done. Fields: title (required), start (required -- "YYYY-MM-DDTHH:MM:SS" 24-hour local time for a timed event, or bare "YYYY-MM-DD" when allDay is true), end (optional, same format as start), allDay (boolean), location (optional short string), mode (one of school/sports/gym/health/finance/skills/reading/discipline/family if Dylan's request is clearly about one of those areas, otherwise omit it). Never set a "recurrence" field -- if Dylan wants something repeating, propose only the first occurrence and mention in "reply" that repeating events need to be set up from the Calendar page directly. If Dylan did not give enough detail to know the date (or time, for a non-allDay event), do not produce a create_event action at all -- ask him what's missing in "reply" instead, with "action" set to null.

Dylan: "add a team lunch this friday at 6pm"
{"reply": "I can add 'Team lunch' on Friday, Sept 12 at 6:00 PM to your calendar -- want me to add it?", "action": {"type": "create_event", "title": "Team lunch", "start": "2026-09-12T18:00:00", "allDay": false}}

Never claim an action happened unless the application actually performed it.

${context}
`

    const response = await fetchWithTimeout(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        keep_alive: KEEP_ALIVE,
        stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: modeLabel ? (MODE_TEMPERATURE[modeLabel] ?? 0.2) : 0.2,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      throw new Error(`Local AI returned ${response.status}`)
    }

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
      reply: finalReply || 'No response from Dylan AI.',
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

    const response = await fetchWithTimeout(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        keep_alive: KEEP_ALIVE,
        messages: [
          {
            role: 'system',
            content: `
You are a memory detector.

Only suggest a memory if the user clearly states a real long-term personal fact, preference, goal, routine, or important project detail.

Never invent information. Only extract facts that are explicitly and literally present in the user's message below. If the message does not contain a clear personal fact, you must return NONE.

Do not suggest memories for commands, questions, greetings, casual conversation, or temporary information.

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
      }),
    })

    if (!response.ok) {
      throw new Error(`Local AI returned ${response.status}`)
    }

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
