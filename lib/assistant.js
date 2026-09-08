import { loadData, saveData } from './dataStore.js'

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
