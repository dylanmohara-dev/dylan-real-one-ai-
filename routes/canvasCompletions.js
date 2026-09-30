import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Canvas assignments are otherwise fully read-only in this app (a
// deliberate earlier choice -- checking one off here must never look like
// or touch a real Canvas submission). This is a SEPARATE, local-only
// completion layer keyed by the Canvas assignment's own id, so School's
// Quest Log/XP/level system has something real to react to for Dylan's
// actual work -- virtually 100% of his real assignments are Canvas-synced,
// so without this, the whole "check it off -> animation -> level up"
// system he asked for (session 38 round 2) would never fire in practice.
// classId/category are stored on the completion record itself (denormalized
// at the moment it's checked) rather than re-derived from the live Canvas
// assignment list every time, since a submitted/removed Canvas item can
// disappear from that list -- the completion and its earned XP should
// survive that.
const CATEGORIES = ['homework', 'quiz', 'test', 'project']

router.get('/', (req, res) => {
  res.json({ canvasCompletions: loadData('canvas_completions', {}) })
})

router.put('/:canvasId', (req, res) => {
  try {
    const { canvasId } = req.params
    const { completed, classId, category, title } = req.body
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed (boolean) is required' })
    }
    const completions = loadData('canvas_completions', {})
    if (completed) {
      if (!classId) return res.status(400).json({ error: 'classId is required to mark a Canvas item done' })
      completions[canvasId] = {
        classId,
        title: title || completions[canvasId]?.title || '',
        category: CATEGORIES.includes(category) ? category : completions[canvasId]?.category || 'homework',
        completed: true,
        completedAt: new Date().toISOString(),
      }
    } else if (completions[canvasId]) {
      // Un-checking keeps the record (so a re-check doesn't lose its
      // chosen category) but clears completed/completedAt -- same
      // convention as native assignments' toggleAssignment.
      completions[canvasId] = { ...completions[canvasId], completed: false, completedAt: null }
    }
    saveData('canvas_completions', completions)
    res.json({ canvasCompletions: completions })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save that.' })
  }
})

// Category can be changed independent of completion, same as native
// assignments' setAssignmentCategory -- Dylan often won't know an item's
// real weight until it's assigned.
router.put('/:canvasId/category', (req, res) => {
  try {
    const { canvasId } = req.params
    const { category, classId, title } = req.body
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' })
    }
    const completions = loadData('canvas_completions', {})
    completions[canvasId] = {
      classId: classId || completions[canvasId]?.classId,
      title: title || completions[canvasId]?.title || '',
      category,
      completed: completions[canvasId]?.completed || false,
      completedAt: completions[canvasId]?.completedAt || null,
    }
    saveData('canvas_completions', completions)
    res.json({ canvasCompletions: completions })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save that.' })
  }
})

export default router
