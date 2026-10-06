import { Router } from 'express'
import { deleteMemoryById, listMemories, saveMemory } from '../lib/memoryService.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ memories: listMemories() })
})

router.post('/', (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Memory content is required' })
    }
    const memory = saveMemory(content, req.body?.metadata || { source: 'memory_page' })
    if (!memory) return res.status(400).json({ error: 'Memory content is required' })
    res.json({ memory })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save memory' })
  }
})

router.delete('/:id', (req, res) => {
  deleteMemoryById(req.params.id)
  res.json({ success: true })
})

export default router
