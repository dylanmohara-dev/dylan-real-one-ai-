import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const port = 3001

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(cors())
app.use(express.json())

const dataDirectory = path.join(__dirname, 'data')

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true })
}

function getDataPath(name) {
  return path.join(dataDirectory, `${name}.json`)
}

function loadData(name) {
  try {
    const filePath = getDataPath(name)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf8')
      return []
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return []
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Could not load ${name}:`, error)
    return []
  }
}

function saveData(name, data) {
  const filePath = getDataPath(name)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: loadData('tasks') })
})

app.post('/api/tasks', (req, res) => {
  try {
    const { title, priority, dueDate, reminder, completed, category } = req.body
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Task title is required' })
    }
    const tasks = loadData('tasks')
    const task = {
      id: Date.now().toString(),
      title: title.trim(),
      priority: priority || 'medium',
      dueDate: dueDate || '',
      reminder: reminder || 'none',
      category: category || 'general',
      completed: Boolean(completed),
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    saveData('tasks', tasks)
    res.json({ task })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save task' })
  }
})

app.put('/api/tasks/:id', (req, res) => {
  const tasks = loadData('tasks')
  const index = tasks.findIndex((task) => task.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' })
  }
  tasks[index] = { ...tasks[index], ...req.body, id: tasks[index].id }
  saveData('tasks', tasks)
  res.json({ task: tasks[index] })
})

app.delete('/api/tasks/:id', (req, res) => {
  const tasks = loadData('tasks')
  const remaining = tasks.filter((task) => task.id !== req.params.id)
  saveData('tasks', remaining)
  res.json({ success: true })
})

app.get('/api/goals', (req, res) => {
  res.json({ goals: loadData('goals') })
})

app.post('/api/goals', (req, res) => {
  try {
    const { title, progress } = req.body
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Goal title is required' })
    }
    const goals = loadData('goals')
    const goal = {
      id: Date.now().toString(),
      title: title.trim(),
      progress: Number(progress) || 0,
      createdAt: new Date().toISOString(),
    }
    goals.push(goal)
    saveData('goals', goals)
    res.json({ goal })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save goal' })
  }
})

app.put('/api/goals/:id', (req, res) => {
  const goals = loadData('goals')
  const index = goals.findIndex((goal) => goal.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Goal not found' })
  }
  goals[index] = { ...goals[index], ...req.body, id: goals[index].id }
  saveData('goals', goals)
  res.json({ goal: goals[index] })
})

app.delete('/api/goals/:id', (req, res) => {
  const goals = loadData('goals')
  const remaining = goals.filter((goal) => goal.id !== req.params.id)
  saveData('goals', remaining)
  res.json({ success: true })
})

app.get('/api/notes', (req, res) => {
  res.json({ notes: loadData('notes') })
})

app.post('/api/notes', (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Note content is required' })
    }
    const notes = loadData('notes')
    const note = {
      id: Date.now().toString(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    notes.push(note)
    saveData('notes', notes)
    res.json({ note })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save note' })
  }
})

app.delete('/api/notes/:id', (req, res) => {
  const notes = loadData('notes')
  const remaining = notes.filter((note) => note.id !== req.params.id)
  saveData('notes', remaining)
  res.json({ success: true })
})

app.get('/api/memories', (req, res) => {
  res.json({ memories: loadData('memories') })
})

app.post('/api/memories', (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Memory content is required' })
    }
    const memories = loadData('memories')
    const existing = memories.find(
      (memory) => memory.content.toLowerCase() === content.trim().toLowerCase()
    )
    if (existing) {
      return res.json({ memory: existing })
    }
    const memory = {
      id: Date.now().toString(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    memories.push(memory)
    saveData('memories', memories)
    res.json({ memory })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save memory' })
  }
})

app.delete('/api/memories/:id', (req, res) => {
  const memories = loadData('memories')
  const remaining = memories.filter((memory) => memory.id !== req.params.id)
  saveData('memories', remaining)
  res.json({ success: true })
})

app.get('/api/classes', (req, res) => {
  res.json({ classes: loadData('classes') })
})

app.post('/api/classes', (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Class name is required' })
    }
    const classes = loadData('classes')
    const schoolClass = {
      id: Date.now().toString(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    }
    classes.push(schoolClass)
    saveData('classes', classes)
    res.json({ class: schoolClass })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save class' })
  }
})

app.delete('/api/classes/:id', (req, res) => {
  const classes = loadData('classes')
  const remaining = classes.filter((c) => c.id !== req.params.id)
  saveData('classes', remaining)
  const assignments = loadData('assignments').filter((a) => a.classId !== req.params.id)
  saveData('assignments', assignments)
  const tests = loadData('tests').filter((t) => t.classId !== req.params.id)
  saveData('tests', tests)
  res.json({ success: true })
})

app.get('/api/assignments', (req, res) => {
  res.json({ assignments: loadData('assignments') })
})

app.post('/api/assignments', (req, res) => {
  try {
    const { classId, title, dueDate } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const assignments = loadData('assignments')
    const assignment = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      dueDate: dueDate || '',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    assignments.push(assignment)
    saveData('assignments', assignments)
    res.json({ assignment })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save assignment' })
  }
})

app.put('/api/assignments/:id', (req, res) => {
  const assignments = loadData('assignments')
  const index = assignments.findIndex((a) => a.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' })
  }
  assignments[index] = { ...assignments[index], ...req.body, id: assignments[index].id }
  saveData('assignments', assignments)
  res.json({ assignment: assignments[index] })
})

app.delete('/api/assignments/:id', (req, res) => {
  const assignments = loadData('assignments')
  const remaining = assignments.filter((a) => a.id !== req.params.id)
  saveData('assignments', remaining)
  res.json({ success: true })
})

app.get('/api/tests', (req, res) => {
  res.json({ tests: loadData('tests') })
})

app.post('/api/tests', (req, res) => {
  try {
    const { classId, title, date } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const tests = loadData('tests')
    const test = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      date: date || '',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    tests.push(test)
    saveData('tests', tests)
    res.json({ test })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save test' })
  }
})

app.put('/api/tests/:id', (req, res) => {
  const tests = loadData('tests')
  const index = tests.findIndex((t) => t.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Test not found' })
  }
  tests[index] = { ...tests[index], ...req.body, id: tests[index].id }
  saveData('tests', tests)
  res.json({ test: tests[index] })
})

app.delete('/api/tests/:id', (req, res) => {
  const tests = loadData('tests')
  const remaining = tests.filter((t) => t.id !== req.params.id)
  saveData('tests', remaining)
  res.json({ success: true })
})

function detectCommand(message) {
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

function executeAction(action) {
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

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body
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

    const systemPrompt = `
You are Dylan AI, Dylan's personal AI operating system.

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

    const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:3b',
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

app.post('/api/memory-check', async (req, res) => {
  try {
    const { message } = req.body
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }

    if (detectCommand(message)) {
      return res.json({ shouldSuggest: false, memory: '' })
    }

    const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:3b',
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

app.listen(port, () => {
  console.log(`Dylan AI server running on http://localhost:${port}`)
})
