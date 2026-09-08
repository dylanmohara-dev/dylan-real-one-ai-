import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'
import { detectCommand, executeAction, looksLikeContentRequest } from '../lib/assistant.js'
import { getLiveContextBlock } from '../lib/liveContext.js'

const router = Router()

const OLLAMA_URL = 'http://127.0.0.1:11434/v1/chat/completions'
const MODEL = 'llama3.2:3b'

// Each life area gets its own voice AND its own answer structure, not just a
// different accent color in the UI — this is what actually shows up in the
// text the model writes.
const MODE_STYLE = {
  school: 'Answer like a study coach: short numbered steps or a checklist. Call out deadlines when Dylan mentions them.',
  sports: 'Answer like a coach: brief and energetic. A short drill list or a quick plan, not long paragraphs.',
  gym: 'Answer like a trainer: sets/reps/rest broken onto their own lines when relevant. Short and direct, no fluff.',
  health: 'Keep it short and supportive: a quick summary of what was logged, plus one small, concrete next step.',
  finance: 'Answer like a numbers-first analyst: concrete figures, short line items, and one bottom-line takeaway at the end.',
  skills: 'Answer like a practice coach: one focused suggestion at a time, framed around today\'s practice session.',
  reading: 'Write in a more reflective, literary tone. Slightly longer sentences are fine here — this is the one area that rewards it.',
  discipline: 'Be blunt and short, like a checklist being read out loud. No hedging, no encouragement fluff.',
  family: 'Write warmly and briefly. This is about people, not tasks or metrics.',
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
  try {
    const { messages, mode } = req.body
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' })
    }

    const latestMessage = messages[messages.length - 1]?.content || ''
    const directAction = detectCommand(latestMessage)

    if (directAction) {
      const actionResult = executeAction(directAction)
      return res.json({
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
${modeStyle ? `Style for this area: ${modeStyle}
` : ''}` : ''}
Dylan asked you to write, draft, plan, explain, or brainstorm something. Write the complete answer as plain text — no JSON, no code fences, no markdown headers or asterisks. Use plain dashes for lists and blank lines between sections. This is a single response, not a conversation — write the whole thing now and stop; never simulate additional turns, progress updates, or "steps completed."
`
      const contentResponse = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: contentSystemPrompt }, ...messages],
          temperature: 0.4,
          max_tokens: 900,
        }),
      })

      if (!contentResponse.ok) {
        throw new Error(`Local AI returned ${contentResponse.status}`)
      }

      const contentData = await contentResponse.json()
      const contentRaw = contentData.choices?.[0]?.message?.content?.trim() || ''

      return res.json({
        reply: contentRaw || 'No response from Dylan AI.',
        actionPerformed: false,
        skipMemoryCheck: false,
      })
    }

    const memories = loadData('memories')
    const tasks = loadData('tasks')
    const goals = loadData('goals')
    const notes = loadData('notes')
    const liveContext = await getLiveContextBlock()

    const context = `
CURRENT DYLAN AI DATA

MEMORIES:
${memories.map((m) => `- ${m.content}`).join('\n') || '- None'}

TASKS:
${tasks.map((t) => `- ${t.title} | ${t.completed ? 'Completed' : 'Open'} | Priority: ${t.priority}`).join('\n') || '- None'}

GOALS:
${goals.map((g) => `- ${g.title} | ${g.progress}% complete`).join('\n') || '- None'}

NOTES:
${notes.map((n) => `- ${n.content}`).join('\n') || '- None'}
${liveContext}
`

    const systemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.
${modeLabel ? `\nYou are currently in Dylan's "${modeLabel}" area — keep your focus and suggestions relevant to ${modeLabel} unless Dylan clearly asks about something else.\n${modeStyle ? `Style for this area: ${modeStyle}\n` : ''}` : ''}
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

Never claim an action happened unless the application actually performed it.

${context}
`

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.2,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      throw new Error(`Local AI returned ${response.status}`)
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''

    let parsed
    try {
      const cleaned = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
      const jsonSlice = extractFirstJsonObject(cleaned) || cleaned
      parsed = JSON.parse(jsonSlice)
      if (!parsed || typeof parsed.reply !== 'string') throw new Error('malformed shape')
    } catch {
      parsed = { reply: raw, action: null }
    }

    const actionResult = executeAction(parsed.action)
    let finalReply = parsed.reply || raw

    if (actionResult.performed) {
      finalReply = actionResult.message
    } else if (parsed.action && actionResult.message) {
      finalReply = actionResult.message
    }

    res.json({
      reply: finalReply || 'No response from Dylan AI.',
      actionPerformed: actionResult.performed,
      skipMemoryCheck: actionResult.performed,
    })
  } catch (error) {
    console.error('Chat failed:', error)
    res.status(500).json({ error: 'Could not connect to the local AI.' })
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

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
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
