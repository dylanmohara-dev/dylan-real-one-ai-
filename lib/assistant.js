import { loadData, saveData } from './dataStore.js'

const CONTENT_REQUEST_PATTERNS = [
  /\b(business plan|essay|proposal|outline|blog post|article|speech|pitch|cover letter|study guide|meal plan|workout plan|itinerary|summary of|pros and cons|marketing plan|content plan)\b/i,
  /^(write|draft|compose|create|come up with|help me write|help me draft)\b.*\b(a|an|the)\b/i,
  /^(explain|describe|walk me through|help me understand)\b/i,
  /^(brainstorm|give me ideas|help me think through|help me plan out)\b/i,
]

// Deliberately separate from detectCommand: this doesn't identify a specific
// action, it identifies "Dylan wants written content back," so the chat route
// can skip the JSON-action prompt entirely for these and avoid the local
// model hallucinating a chain of fake task-completion turns instead of just
// writing the thing.
export function looksLikeContentRequest(message) {
  const text = message?.trim() || ''
  if (!text) return false
  return CONTENT_REQUEST_PATTERNS.some((pattern) => pattern.test(text))
}

export function detectCommand(message) {
  const text = message?.trim() || ''
  const lower = text.toLowerCase()

  if (!text) return null

  const completeMatch = text.match(/^(?:complete|finish|done with)\s+(.+)$/i)
  if (completeMatch?.[1]?.trim()) {
    return { type: 'complete_task', title: completeMatch[1].trim() }
  }

  const markCompleteMatch = text.match(
    /^mark\s+(.+?)\s+(?:as\s+)?(?:complete|completed|done)$/i
  )
  if (markCompleteMatch?.[1]?.trim()) {
    return { type: 'complete_task', title: markCompleteMatch[1].trim() }
  }

  const goalMatch = text.match(
    /^(?:create|add|make|set)\s+(?:a\s+)?goal\s+(?:to\s+)?(.+)$/i
  )
  if (goalMatch?.[1]?.trim()) {
    return { type: 'create_goal', title: goalMatch[1].trim(), progress: 0 }
  }

  const progressMatch = text.match(
    /^(?:make|set|update)\s+(?:my\s+)?(.+?)\s+goal\s+(?:to\s+)?(\d+)\s*(?:%|percent)?$/i
  )
  if (progressMatch) {
    return {
      type: 'update_goal',
      title: progressMatch[1].trim(),
      progress: Number(progressMatch[2]),
    }
  }

  const noteMatch = text.match(
    /^(?:save|add|write|create)\s+(?:a\s+)?note\s+(?:that\s+)?(.+)$/i
  )
  if (noteMatch?.[1]?.trim()) {
    return { type: 'create_note', content: noteMatch[1].trim() }
  }

  const deleteTaskMatch = text.match(
    /^(?:delete|remove)\s+(?:the\s+)?task\s+(.+)$/i
  )
  if (deleteTaskMatch?.[1]?.trim()) {
    return { type: 'delete_task', title: deleteTaskMatch[1].trim() }
  }

  const forgetMatch = text.match(/^(?:forget|remove)\s+(?:that\s+)?(.+)$/i)
  if (forgetMatch?.[1]?.trim()) {
    return { type: 'forget_memory', content: forgetMatch[1].trim() }
  }

  const memoryMatch = text.match(/^remember\s+(?:that\s+)?(.+)$/i)
  if (memoryMatch?.[1]?.trim()) {
    return { type: 'save_memory', content: memoryMatch[1].trim() }
  }

  const taskPatterns = [
    /^(?:add)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:create)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:add)\s+(.+?)\s+to\s+(?:my\s+)?tasks?$/i,
    /^(?:create)\s+(.+?)\s+as\s+(?:a\s+)?task$/i,
  ]

  for (const pattern of taskPatterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) {
      return { type: 'create_task', title: match[1].trim(), priority: 'medium' }
    }
  }

  return null
}

export function executeAction(action) {
  if (!action || !action.type) {
    return { performed: false, message: '' }
  }

  if (action.type === 'create_task') {
    const tasks = loadData('tasks')
    const task = {
      id: Date.now().toString(),
      title: action.title || 'New task',
      priority: action.priority || 'medium',
      dueDate: action.dueDate || '',
      reminder: action.reminder || 'none',
      category: action.category || 'general',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    saveData('tasks', tasks)
    return { performed: true, message: `Added task: ${task.title}` }
  }

  if (action.type === 'complete_task') {
    const tasks = loadData('tasks')
    const search = (action.title || '').toLowerCase().trim()
    const task = tasks.find(
      (item) =>
        !item.completed &&
        (item.title.toLowerCase().includes(search) ||
          search.includes(item.title.toLowerCase()))
    )
    if (!task) {
      return { performed: false, message: 'I could not find that open task.' }
    }
    task.completed = true
    saveData('tasks', tasks)
    return { performed: true, message: `Completed task: ${task.title}` }
  }

  if (action.type === 'delete_task') {
    const tasks = loadData('tasks')
    const search = (action.title || '').toLowerCase().trim()
    const index = tasks.findIndex((item) => item.title.toLowerCase().includes(search))
    if (index === -1) {
      return { performed: false, message: 'I could not find that task.' }
    }
    const removed = tasks[index]
    tasks.splice(index, 1)
    saveData('tasks', tasks)
    return { performed: true, message: `Deleted task: ${removed.title}` }
  }

  if (action.type === 'create_goal') {
    const goals = loadData('goals')
    const goal = {
      id: Date.now().toString(),
      title: action.title || 'New goal',
      progress: Number(action.progress) || 0,
      createdAt: new Date().toISOString(),
    }
    goals.push(goal)
    saveData('goals', goals)
    return { performed: true, message: `Created goal: ${goal.title}` }
  }

  if (action.type === 'update_goal') {
    const goals = loadData('goals')
    const search = (action.title || '').toLowerCase().trim()
    const goal = goals.find((item) => item.title.toLowerCase().includes(search))
    if (!goal) {
      return { performed: false, message: 'I could not find that goal.' }
    }
    if (action.progress !== undefined) {
      goal.progress = Math.max(0, Math.min(100, Number(action.progress)))
    }
    saveData('goals', goals)
    return { performed: true, message: `Updated goal: ${goal.title} to ${goal.progress}%` }
  }

  if (action.type === 'create_note') {
    const notes = loadData('notes')
    const content = (action.content || '').trim()
    if (!content) {
      return { performed: false, message: 'The note was empty.' }
    }
    const note = {
      id: Date.now().toString(),
      content,
      createdAt: new Date().toISOString(),
    }
    notes.push(note)
    saveData('notes', notes)
    return { performed: true, message: 'Saved the note.' }
  }

  if (action.type === 'save_memory') {
    const memories = loadData('memories')
    const content = (action.content || '').trim()
    if (!content) {
      return { performed: false, message: 'The memory was empty.' }
    }
    const exists = memories.some(
      (memory) => memory.content.toLowerCase() === content.toLowerCase()
    )
    if (exists) {
      return { performed: true, message: 'I already remembered that.' }
    }
    memories.push({
      id: Date.now().toString(),
      content,
      createdAt: new Date().toISOString(),
    })
    saveData('memories', memories)
    return { performed: true, message: `I'll remember that: ${content}` }
  }

  if (action.type === 'log_health') {
    const CATEGORIES = ['sleep', 'food', 'water', 'activity']
    const NUMERIC_CATEGORIES = ['sleep', 'water', 'activity']
    const category = (action.category || '').toLowerCase().trim()
    const value = (action.value || '').toString().trim()

    if (!CATEGORIES.includes(category)) {
      return { performed: false, message: '' }
    }
    if (!value) {
      return { performed: false, message: '' }
    }

    const entries = loadData('health')
    const entry = {
      id: Date.now().toString(),
      category,
      value,
      note: (action.note || '').trim(),
      // Bare local date, same convention -- and same fallback if it's ever
      // missing -- as routes/health.js's POST handler, so a chat-logged
      // entry lands in HealthPage's Week grid on the correct day.
      date: (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })(),
      createdAt: new Date().toISOString(),
    }

    // Same "only store a real positive number, otherwise leave it off
    // entirely" rule as routes/health.js -- a plain-text food entry never
    // gets one, and every existing consumer already treats a missing
    // amount as "not counted" rather than crashing on it.
    if (NUMERIC_CATEGORIES.includes(category)) {
      const numericAmount = parseFloat(value)
      if (Number.isFinite(numericAmount) && numericAmount > 0) {
        entry.amount = numericAmount
      }
    }

    entries.push(entry)
    saveData('health', entries)

    const label = entry.note ? `${value} (${entry.note})` : value
    return { performed: true, message: `Logged: ${label} under ${category}.` }
  }

  if (action.type === 'log_skill_practice') {
    const skills = loadData('skills')
    const active = skills.filter((skill) => skill.active)
    if (!active.length) {
      return { performed: false, message: '' }
    }

    const quantity = Number(action.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { performed: false, message: '' }
    }

    // Match by name when the model gave one (case-insensitive, either
    // direction so "guitar" matches a skill named "Guitar practice").
    // With only one active skill, default to it even with no name match —
    // there's nothing else it could mean.
    const requestedName = (action.skillName || '').toLowerCase().trim()
    let skill = requestedName
      ? active.find(
          (item) =>
            item.name.toLowerCase().includes(requestedName) ||
            requestedName.includes(item.name.toLowerCase())
        )
      : null

    if (!skill && active.length === 1) {
      skill = active[0]
    }

    if (!skill) {
      return {
        performed: false,
        message: `Which skill? You're tracking: ${active.map((item) => item.name).join(', ')}.`,
      }
    }

    const sessions = loadData('skill_sessions')
    // Local YYYY-MM-DD -- not toISOString().slice(0, 10), which reads off
    // UTC and can tag an evening practice session as tomorrow's date. Same
    // bug, same fix as routes/skills.js's todayKey() (see that file for
    // the full writeup); duplicated here rather than imported since this
    // handler builds its own "today" independently.
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    sessions.push({
      id: Date.now().toString(),
      skillId: skill.id,
      quantity,
      note: (action.note || '').trim(),
      date: today,
      createdAt: new Date().toISOString(),
    })
    saveData('skill_sessions', sessions)

    skill.xp = (skill.xp || 0) + quantity
    saveData('skills', skills)

    return { performed: true, message: `Logged ${quantity} ${skill.unit || 'reps'} of ${skill.name}.` }
  }

  if (action.type === 'forget_memory') {
    const memories = loadData('memories')
    const search = (action.content || '').toLowerCase().trim()
    const remaining = memories.filter(
      (memory) => !memory.content.toLowerCase().includes(search)
    )
    if (remaining.length === memories.length) {
      return { performed: false, message: 'I could not find that memory.' }
    }
    saveData('memories', remaining)
    return { performed: true, message: 'I forgot that memory.' }
  }

  return { performed: false, message: '' }
}
