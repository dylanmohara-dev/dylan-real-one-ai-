import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ tasks: loadData('tasks') })
})

router.post('/', (req, res) => {
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

router.put('/:id', (req, res) => {
  const tasks = loadData('tasks')
  const index = tasks.findIndex((task) => task.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' })
  }
  tasks[index] = { ...tasks[index], ...req.body, id: tasks[index].id }
  saveData('tasks', tasks)
  res.json({ task: tasks[index] })
})

router.delete('/:id', (req, res) => {
  const tasks = loadData('tasks')
  const remaining = tasks.filter((task) => task.id !== req.params.id)
  saveData('tasks', remaining)
  res.json({ success: true })
})

export default router
