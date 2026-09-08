import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ goals: loadData('goals') })
})

router.post('/', (req, res) => {
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

router.put('/:id', (req, res) => {
  const goals = loadData('goals')
  const index = goals.findIndex((goal) => goal.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: 'Goal not found' })
  }
  goals[index] = { ...goals[index], ...req.body, id: goals[index].id }
  saveData('goals', goals)
  res.json({ goal: goals[index] })
})

router.delete('/:id', (req, res) => {
  const goals = loadData('goals')
  const remaining = goals.filter((goal) => goal.id !== req.params.id)
  saveData('goals', remaining)
  res.json({ success: true })
})

export default router
