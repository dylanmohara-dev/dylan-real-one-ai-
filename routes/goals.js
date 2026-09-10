import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ goals: loadData('goals') })
})

router.post('/', async (req, res) => {
  try {
    const { title, progress, dueDate } = req.body
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Goal title is required' })
    }
    const goals = loadData('goals')
    const goal = {
      id: Date.now().toString(),
      title: title.trim(),
      progress: Number(progress) || 0,
      // Optional — a goal with no deadline just never shows on the
      // calendar (in-app or real), same as before this existed.
      dueDate: dueDate || null,
      createdAt: new Date().toISOString(),
    }
    // Best-effort real-calendar write -- see lib/calendarAutoSync.js. No
    // specific life-area mode: a goal isn't tied to just one of the 9, so
    // this falls back to the single default target calendar.
    await syncCalendarEvent(goal, { title: goal.title, date: goal.dueDate })
    goals.push(goal)
    saveData('goals', goals)
    res.json({ goal })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save goal' })
  }
})

router.put('/:id', async (req, res) => {
  const goals = loadData('goals')
  const index = goals.findIndex((goal) => goal.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Goal not found' })
  }
  goals[index] = { ...goals[index], ...req.body, id: goals[index].id }
  await syncCalendarEvent(goals[index], { title: goals[index].title, date: goals[index].dueDate })
  saveData('goals', goals)
  res.json({ goal: goals[index] })
})

router.delete('/:id', async (req, res) => {
  const goals = loadData('goals')
  const goal = goals.find((g) => g.id === req.params.id)
  if (goal) await clearCalendarEvent(goal)
  const remaining = goals.filter((g) => g.id !== req.params.id)
  saveData('goals', remaining)
  res.json({ success: true })
})

export default router
