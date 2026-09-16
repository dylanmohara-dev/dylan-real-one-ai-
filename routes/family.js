import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

router.get('/members', (req, res) => {
  res.json({ members: loadData('family_members') })
})

router.post('/members', (req, res) => {
  try {
    const { name, relationship } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A name is required' })
    }
    const members = loadData('family_members')
    const member = {
      id: Date.now().toString(),
      name: name.trim(),
      relationship: (relationship || '').trim(),
      createdAt: new Date().toISOString(),
    }
    members.push(member)
    saveData('family_members', members)
    res.json({ member })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save family member' })
  }
})

router.delete('/members/:id', (req, res) => {
  const members = loadData('family_members')
  const remaining = members.filter((m) => m.id !== req.params.id)
  saveData('family_members', remaining)
  // Deleting a person doesn't erase the memory of time already spent with
  // them -- past log entries keep the (now-orphaned) memberId rather than
  // getting deleted, same reasoning as Discipline archiving over deleting.
  res.json({ success: true })
})

// One shared log for both concerns this mode covers -- a check-in/time-
// together entry (tied to a family member, carries minutes spent, feeds
// the "hours this week" card metric) and a faith-practice entry (not tied
// to any one person, just a note). One list keeps a combined recent-
// activity feed trivial instead of merging two separate collections by
// date every time the UI wants to show "what happened lately."
router.get('/log', (req, res) => {
  res.json({ log: loadData('family_log') })
})

router.post('/log', (req, res) => {
  try {
    const { type, date, memberId, minutesSpent, note } = req.body
    if (type !== 'checkin' && type !== 'faith') {
      return res.status(400).json({ error: "type must be 'checkin' or 'faith'" })
    }
    if (!date) {
      return res.status(400).json({ error: 'A date is required' })
    }
    if (type === 'checkin' && !memberId) {
      return res.status(400).json({ error: 'A family member is required for a check-in' })
    }

    const log = loadData('family_log')
    const entry = {
      id: Date.now().toString(),
      type,
      date,
      memberId: type === 'checkin' ? memberId : null,
      minutesSpent: type === 'checkin' ? Number(minutesSpent) || 0 : 0,
      practiceType: type === 'faith' ? (req.body.practiceType || '').trim() : null,
      note: (note || '').trim(),
      createdAt: new Date().toISOString(),
    }
    log.push(entry)
    saveData('family_log', log)

    if (type === 'checkin') {
      const members = loadData('family_members')
      const index = members.findIndex((m) => m.id === memberId)
      if (index !== -1) {
        members[index] = { ...members[index], lastCheckIn: date }
        saveData('family_members', members)
      }
    }

    res.json({ entry })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save log entry' })
  }
})

router.delete('/log/:id', (req, res) => {
  const log = loadData('family_log')
  const remaining = log.filter((entry) => entry.id !== req.params.id)
  saveData('family_log', remaining)
  res.json({ success: true })
})

const DEFAULT_FAMILY_GOALS = { weeklyMinutesGoal: 360 } // 6 hours, matching the old hardcoded default

router.get('/goals', (req, res) => {
  res.json({ goals: loadData('family_goals', DEFAULT_FAMILY_GOALS) })
})

router.post('/goals', (req, res) => {
  try {
    const { weeklyMinutesGoal } = req.body
    const goal = Number(weeklyMinutesGoal)
    if (!goal || goal <= 0) {
      return res.status(400).json({ error: 'weeklyMinutesGoal must be a positive number' })
    }
    const goals = { ...loadData('family_goals', DEFAULT_FAMILY_GOALS), weeklyMinutesGoal: goal }
    saveData('family_goals', goals)
    res.json({ goals })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save family goal' })
  }
})

export default router
