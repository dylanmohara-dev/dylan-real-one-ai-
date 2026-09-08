import { Router } from 'express'
import { loadData } from '../lib/dataStore.js'
import { detectCommand, executeAction } from '../lib/assistant.js'

const router = Router()

const OLLAMA_URL = 'http://127.0.0.1:11434/v1/chat/completions'
const MODEL = 'llama3.2:3b'

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

    const memories = loadData('memories')
    const tasks = loadData('tasks')
    const goals = loadData('goals')
    const notes = loadData('notes')

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
`

    const modeLabel = mode && mode !== 'general' ? mode : null

    const systemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.
${modeLabel ? `\nYou are currently in Dylan's "${modeLabel}" area — keep your focus and suggestions relevant to ${modeLabel} unless Dylan clearly asks about something else.\n` : ''}
You have access to Dylan's tasks, goals, notes, and memories.

Be concise, useful, organized and action-oriented.

For normal conversation, answer naturally.

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
    "reminder": "none"
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
        max_tokens: 500,
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
      parsed = JSON.parse(cleaned)
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
