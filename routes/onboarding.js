import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { OLLAMA_URL, MODEL } from '../lib/aiConfig.js'

const router = Router()

const MEMORY_ONLY_MODES = {
  sports: 'Sports',
  gym: 'Gym',
  skills: 'Skills',
  reading: 'Reading',
  mind: 'Mind',
  family: 'Family',
}

function uid(offset = 0) {
  return `${Date.now()}-${offset}-${Math.random().toString(36).slice(2, 7)}`
}

function saveMemory(content) {
  const trimmed = content.trim()
  if (!trimmed) return false
  const memories = loadData('memories')
  const exists = memories.some((m) => m.content.toLowerCase() === trimmed.toLowerCase())
  if (exists) return false
  memories.push({ id: uid(), content: trimmed, createdAt: new Date().toISOString() })
  saveData('memories', memories)
  return true
}

async function askOllama(systemPrompt, userText) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.1,
      max_tokens: 400,
    }),
  })
  if (!response.ok) throw new Error(`Local AI returned ${response.status}`)
  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content?.trim() || ''
  return raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim()
}

function safeParseArray(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const SCHOOL_PROMPT = `Extract a JSON array of class names from the message below.
Return ONLY a JSON array of strings, nothing else. Example: ["Biology", "Calculus II"]
If no specific class names are mentioned, return []`

const HEALTH_PROMPT = `Extract a JSON array of health log entries from the message below.
Each entry must look like: {"category": "sleep" | "food" | "water" | "activity", "value": "short string", "note": "short string or empty"}
Return ONLY a JSON array, nothing else. Example: [{"category":"activity","value":"3 miles","note":"morning run"}]
If nothing concrete is mentioned, return []`

const FINANCE_PROMPT = `Extract a JSON array of financial accounts from the message below.
Each entry must look like: {"name": "short label", "type": "checking" | "savings" | "investment" | "credit" | "loan", "balance": number}
Return ONLY a JSON array, nothing else. Example: [{"name":"Chase Checking","type":"checking","balance":2400}]
If nothing concrete is mentioned, return []`

router.post('/', async (req, res) => {
  const { name, answers = {} } = req.body || {}
  const summary = { classes: 0, healthEntries: 0, financeAccounts: 0, memories: 0, failures: [] }

  // Dylan's name is set client-side via existing Settings (localStorage) — nothing
  // to persist server-side here, `name` is only used for the response summary below.

  // School — structured extraction with a memory fallback
  if (answers.school?.trim()) {
    try {
      const raw = await askOllama(SCHOOL_PROMPT, answers.school)
      const names = safeParseArray(raw).filter((n) => typeof n === 'string' && n.trim())
      if (names.length) {
        const classes = loadData('classes')
        names.forEach((n, i) => {
          classes.push({ id: uid(i), name: n.trim(), createdAt: new Date().toISOString() })
        })
        saveData('classes', classes)
        summary.classes = names.length
      } else {
        throw new Error('nothing extracted')
      }
    } catch {
      if (saveMemory(`School: ${answers.school.trim()}`)) summary.memories += 1
      summary.failures.push('school')
    }
  }

  // Health — structured extraction with a memory fallback
  if (answers.health?.trim()) {
    try {
      const raw = await askOllama(HEALTH_PROMPT, answers.health)
      const entries = safeParseArray(raw).filter(
        (e) => e && ['sleep', 'food', 'water', 'activity'].includes(e.category) && e.value
      )
      if (entries.length) {
        const health = loadData('health')
        entries.forEach((e) => {
          health.push({
            id: uid(),
            category: e.category,
            value: String(e.value).trim(),
            note: (e.note || '').toString().trim(),
            createdAt: new Date().toISOString(),
          })
        })
        saveData('health', health)
        summary.healthEntries = entries.length
      } else {
        throw new Error('nothing extracted')
      }
    } catch {
      if (saveMemory(`Health: ${answers.health.trim()}`)) summary.memories += 1
      summary.failures.push('health')
    }
  }

  // Finance — structured extraction with a memory fallback
  if (answers.finance?.trim()) {
    try {
      const raw = await askOllama(FINANCE_PROMPT, answers.finance)
      const ACCOUNT_TYPES = ['checking', 'savings', 'investment', 'credit', 'loan']
      const accounts = safeParseArray(raw).filter(
        (a) => a && a.name && ACCOUNT_TYPES.includes(a.type) && !Number.isNaN(Number(a.balance))
      )
      if (accounts.length) {
        const financeAccounts = loadData('finance_accounts')
        accounts.forEach((a) => {
          financeAccounts.push({
            id: uid(),
            name: String(a.name).trim(),
            type: a.type,
            balance: Number(a.balance),
            createdAt: new Date().toISOString(),
          })
        })
        saveData('finance_accounts', financeAccounts)
        summary.financeAccounts = accounts.length
      } else {
        throw new Error('nothing extracted')
      }
    } catch {
      if (saveMemory(`Finance: ${answers.finance.trim()}`)) summary.memories += 1
      summary.failures.push('finance')
    }
  }

  // The remaining six modes have no real backend yet — save as memories, no LLM needed.
  Object.entries(MEMORY_ONLY_MODES).forEach(([key, label]) => {
    if (answers[key]?.trim()) {
      if (saveMemory(`${label}: ${answers[key].trim()}`)) summary.memories += 1
    }
  })

  res.json({ summary })
})

export default router
