import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/', (req, res) => {
  res.json({ notes: loadData('notes') })
})

router.post('/', (req, res) => {
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

router.delete('/:id', (req, res) => {
  const notes = loadData('notes')
  const remaining = notes.filter((note) => note.id !== req.params.id)
  saveData('notes', remaining)
  res.json({ success: true })
})

export default router
