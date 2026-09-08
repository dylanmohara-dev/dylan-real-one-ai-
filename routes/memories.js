import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ memories: loadData('memories') })
})

router.post('/', (req, res) => {
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

router.delete('/:id', (req, res) => {
  const memories = loadData('memories')
  const remaining = memories.filter((memory) => memory.id !== req.params.id)
  saveData('memories', remaining)
  res.json({ success: true })
})

export default router
