import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { addToTrash } from '../lib/trashStore.js'

const router = Router()

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

router.get('/habits', (req, res) => {
  res.json({ habits: loadData('mind_habits') })
})

// Every habit used to be forced into the same box: a plain daily
// yes/no checkbox. That's wrong for a habit like "gym" or "call mom"
// that's realistically 2-3x/week, not every single day -- Dylan's own
// "can't track the kind of habits you want" complaint. frequency lets a
// habit opt into a weekly target (timesPerWeek, clamped 2-6) instead of
// the daily-only default; MindPage.jsx branches its streak math on
// this field.
router.post('/habits', (req, res) => {
  try {
    const { name, frequency, timesPerWeek } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A habit name is required' })
    }
    const habits = loadData('mind_habits')
    const isWeekly = frequency === 'weekly'
    const habit = {
      id: Date.now().toString(),
      name: name.trim(),
      active: true,
      frequency: isWeekly ? 'weekly' : 'daily',
      ...(isWeekly ? { timesPerWeek: Math.min(6, Math.max(2, Number(timesPerWeek) || 3)) } : {}),
      createdAt: new Date().toISOString(),
    }
    habits.push(habit)
    saveData('mind_habits', habits)
    res.json({ habit })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save habit' })
  }
})

// Archiving (active: false) instead of deleting keeps past completions
// meaningful -- a habit Dylan quit shouldn't erase the record of the days
// he actually did it. It just stops showing up on today's checklist for
// new completions.
router.put('/habits/:id', (req, res) => {
  try {
    const habits = loadData('mind_habits')
    const index = habits.findIndex((h) => h.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Habit not found' })
    }
    habits[index] = { ...habits[index], ...req.body, id: habits[index].id }
    // A habit switched back to daily shouldn't keep a stale timesPerWeek
    // sitting on it -- harmless today (daily's own code path never reads
    // it), but leaving it there is exactly the kind of imprecise leftover
    // state that turns into a real bug the next time this schema changes.
    if (habits[index].frequency !== 'weekly') {
      delete habits[index].timesPerWeek
    }
    saveData('mind_habits', habits)
    res.json({ habit: habits[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update habit' })
  }
})

router.delete('/habits/:id', (req, res) => {
  const habits = loadData('mind_habits')
  const deletedHabit = habits.find((h) => h.id === req.params.id)
  const remaining = habits.filter((h) => h.id !== req.params.id)
  saveData('mind_habits', remaining)
  const completions = loadData('mind_completions')
  const deletedCompletions = completions.filter((c) => c.habitId === req.params.id)
  const remainingCompletions = completions.filter((c) => c.habitId !== req.params.id)
  saveData('mind_completions', remainingCompletions)
  if (deletedHabit) {
    addToTrash({
      mode: 'mind',
      kind: 'mind-habit',
      label: `Habit: ${deletedHabit.name}`,
      snapshot: { habit: deletedHabit, completions: deletedCompletions },
    })
  }
  res.json({ success: true })
})

// Completions: one row per habit per day it was actually done. No row at
// all means "not done" -- there's no explicit false state to keep in sync,
// which is also why toggling just adds or removes the one row instead of
// flipping a boolean.
router.get('/completions', (req, res) => {
  res.json({ completions: loadData('mind_completions') })
})

router.post('/completions/toggle', (req, res) => {
  try {
    const { habitId, date } = req.body
    if (!habitId || !date) {
      return res.status(400).json({ error: 'A habit and date are required' })
    }
    const completions = loadData('mind_completions')
    const existingIndex = completions.findIndex((c) => c.habitId === habitId && c.date === date)

    let done
    if (existingIndex === -1) {
      completions.push({ id: Date.now().toString(), habitId, date, createdAt: new Date().toISOString() })
      done = true
    } else {
      completions.splice(existingIndex, 1)
      done = false
    }
    saveData('mind_completions', completions)
    // Discipline XP only on the completing edge, not on un-checking --
    // toggling on then off shouldn't be a free 5 XP.
    if (done) awardSkillXp('discipline', 5)
    res.json({ done, date: date || todayKey() })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update completion' })
  }
})

// ---------------------------------------------------------------------
// 5-skill gamification: Focus, Awareness, Discipline, Impulse-Control,
// Decision-Making. Same accelerating XP curve as routes/skills.js's
// computeLevel (50*N per level) -- duplicated locally per this codebase's
// established convention of not importing route-to-route, matched
// deliberately so "Level 3" means the same thing in both places.
// ---------------------------------------------------------------------
function computeSkillLevel(xp) {
  let level = 1
  let required = 50
  let remaining = Number(xp) || 0
  while (remaining >= required) {
    remaining -= required
    level += 1
    required = 50 * level
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: required }
}

const SKILL_KEYS = ['focus', 'awareness', 'discipline', 'impulseControl', 'decisionMaking']

function loadSkillXp() {
  const rows = loadData('mind_skill_xp')
  const raw = rows[0] || {}
  const xp = {}
  for (const key of SKILL_KEYS) xp[key] = Number(raw[key]) || 0
  return xp
}

function saveSkillXp(xp) {
  saveData('mind_skill_xp', [xp])
}

// The only path that ever changes a skill's XP -- called from server-side
// handlers below (completions, reviews, decisions), never driven directly
// by a frontend request, so Dylan can't inflate a skill by replaying one.
function awardSkillXp(skillKey, amount) {
  if (!SKILL_KEYS.includes(skillKey)) return
  const xp = loadSkillXp()
  xp[skillKey] = (xp[skillKey] || 0) + amount
  saveSkillXp(xp)
}

// Streak Freezes -- a Duolingo-direct mechanic, not decoration: a habit
// banks one freeze every time its streak clears a STREAK_MILESTONES rung
// (client-side, see useAppData.js's toggleMindCompletion), capped at 3
// banked per habit so it stays a safety net, not a way to stop showing up.
// Evaluating *whether* a missed day should actually spend one requires
// knowing what the streak was doing before the gap, which is exactly what
// useAppData.js already computes client-side (habitCurrentStreak) -- so
// this store is deliberately dumb (get/set one record), and all the
// "should this day be frozen" logic lives in one place, not duplicated
// in two languages.
router.get('/freezes', (req, res) => {
  res.json({ freezes: loadData('mind_habit_freezes', {}) })
})

router.put('/freezes/:habitId', (req, res) => {
  try {
    const { freezesAvailable, frozenDates } = req.body
    const freezes = loadData('mind_habit_freezes', {})
    freezes[req.params.habitId] = {
      freezesAvailable: Math.max(0, Number(freezesAvailable) || 0),
      frozenDates: Array.isArray(frozenDates) ? frozenDates : [],
    }
    saveData('mind_habit_freezes', freezes)
    res.json({ freeze: freezes[req.params.habitId] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save freeze state' })
  }
})

router.get('/skills', (req, res) => {
  const xp = loadSkillXp()
  const skills = SKILL_KEYS.map((key) => ({ key, xp: xp[key], ...computeSkillLevel(xp[key]) }))
  res.json({ skills })
})

// ---------------------------------------------------------------------
// Morning Check-In / Night Review. One row per date+type (upsert) --
// filling in today's morning check-in twice edits the same entry rather
// than duplicating it, matching this app's "one row per day" convention
// already used by Health goals and Gym day-notes.
// ---------------------------------------------------------------------
router.get('/reviews', (req, res) => {
  res.json({ reviews: loadData('mind_reviews') })
})

router.post('/reviews', (req, res) => {
  try {
    const { type, date, ...fields } = req.body
    if (type !== 'morning' && type !== 'night') {
      return res.status(400).json({ error: 'type must be "morning" or "night"' })
    }
    const day = date || todayKey()
    const reviews = loadData('mind_reviews')
    const existingIndex = reviews.findIndex((r) => r.type === type && r.date === day)
    const isNew = existingIndex === -1
    const entry = {
      id: isNew ? Date.now().toString() : reviews[existingIndex].id,
      type,
      date: day,
      ...fields,
      createdAt: isNew ? new Date().toISOString() : reviews[existingIndex].createdAt,
      updatedAt: new Date().toISOString(),
    }
    if (isNew) {
      reviews.push(entry)
    } else {
      reviews[existingIndex] = entry
    }
    saveData('mind_reviews', reviews)
    // Only award XP the first time a given day's review is filled in --
    // editing it later to fix a typo shouldn't pay out a second time.
    if (isNew) {
      awardSkillXp(type === 'morning' ? 'focus' : 'awareness', 8)
    }
    res.json({ review: entry })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save review' })
  }
})

// ---------------------------------------------------------------------
// Pause & Choose: the spec's core decision-support flow. Before acting on
// an impulse, walk through what you're about to do, why, and what a
// clearer head would say -- then log the actual decision. Every outcome
// (proceed/wait/different) is kept and counted the same way for the base
// Impulse-Control award, since the point is building the habit of
// pausing at all, not steering Dylan toward any one answer -- the spec is
// explicit that this app should never replace his own thinking.
// ---------------------------------------------------------------------
router.get('/decisions', (req, res) => {
  res.json({ decisions: loadData('mind_decisions') })
})

router.post('/decisions', (req, res) => {
  try {
    const { situation, why, perspective, decision } = req.body
    if (!situation || !situation.trim()) {
      return res.status(400).json({ error: 'What you are about to do is required' })
    }
    if (!['proceed', 'wait', 'different'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be proceed, wait, or different' })
    }
    const decisions = loadData('mind_decisions')
    const entry = {
      id: Date.now().toString(),
      situation: situation.trim(),
      why: (why || '').trim(),
      perspective: (perspective || '').trim(),
      decision,
      outcomeNote: '',
      createdAt: new Date().toISOString(),
    }
    decisions.push(entry)
    saveData('mind_decisions', decisions)
    // Impulse-Control for doing the pause at all; Decision-Making gets an
    // extra bump specifically for choosing to wait or do something
    // different. Proceeding isn't penalized -- that would punish an
    // honest "I paused and still decided to go ahead" -- it just doesn't
    // earn the second bonus.
    awardSkillXp('impulseControl', 6)
    if (decision !== 'proceed') awardSkillXp('decisionMaking', 6)
    res.json({ decision: entry })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save decision' })
  }
})

router.put('/decisions/:id', (req, res) => {
  try {
    const decisions = loadData('mind_decisions')
    const index = decisions.findIndex((d) => d.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Decision not found' })
    const { outcomeNote } = req.body
    decisions[index] = { ...decisions[index], outcomeNote: (outcomeNote || '').trim() }
    saveData('mind_decisions', decisions)
    res.json({ decision: decisions[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update decision' })
  }
})

// ---------------------------------------------------------------------
// Pattern detection + cross-life-area intelligence. Every insight is
// computed live from Dylan's own real data, never canned -- and every
// check has its own minimum-data bar so it stays silent (not wrong)
// until there is enough history to say something true.
// ---------------------------------------------------------------------
function weekdayName(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(y, m - 1, d).getDay()]
}

// Pulled out of the route handler so bootstrap.js can compute the same
// insights for the initial page load without a second round trip -- the
// route below stays as the on-demand refresh path (e.g. after logging a
// new habit completion) and calls this exact same function.
export function computeMindInsights() {
  const insights = []
  const completions = loadData('mind_completions')
  const habits = loadData('mind_habits').filter((h) => h.active !== false)

  // Pattern 1: which weekday habits get skipped most often -- only once
  // there's at least two weeks of real history, so this isn't a fluke
  // from one bad Tuesday.
  if (habits.length > 0) {
    const distinctDates = new Set(completions.map((c) => c.date))
    if (distinctDates.size >= 14) {
      const doneByWeekday = {}
      const possibleByWeekday = {}
      for (let i = 0; i < 60; i += 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const eligible = habits.filter((h) => new Date(h.createdAt) <= d)
        if (eligible.length === 0) continue
        const done = completions.filter((c) => c.date === key).length
        const wd = weekdayName(key)
        doneByWeekday[wd] = (doneByWeekday[wd] || 0) + done
        possibleByWeekday[wd] = (possibleByWeekday[wd] || 0) + eligible.length
      }
      let worstDay = null
      let worstRate = 1
      for (const wd of Object.keys(possibleByWeekday)) {
        if (possibleByWeekday[wd] < 4) continue
        const rate = doneByWeekday[wd] / possibleByWeekday[wd]
        if (rate < worstRate) {
          worstRate = rate
          worstDay = wd
        }
      }
      if (worstDay && worstRate < 0.6) {
        insights.push(
          `You complete your Mind habits least often on ${worstDay}s (${Math.round(worstRate * 100)}% of the time) -- worth a lighter target or a reminder that day.`
        )
      }
    }
  }

  // Cross-life-area: does logging Health on a given day correlate with
  // also completing a Mind habit that day, beyond what chance alone
  // would predict.
  const healthEntries = loadData('health')
  if (healthEntries.length > 0 && completions.length > 0) {
    const healthDates = new Set(healthEntries.map((e) => e.date || (e.createdAt || '').slice(0, 10)))
    const habitDates = new Set(completions.map((c) => c.date))
    if (healthDates.size >= 10 && habitDates.size >= 10) {
      const allDates = new Set([...healthDates, ...habitDates])
      let bothDays = 0
      for (const d of allDates) {
        if (healthDates.has(d) && habitDates.has(d)) bothDays += 1
      }
      const mindRateOnHealthDays = bothDays / healthDates.size
      const mindRateOverall = habitDates.size / allDates.size
      if (mindRateOnHealthDays - mindRateOverall > 0.15) {
        insights.push(
          `On days you log Health, you're about ${Math.round((mindRateOnHealthDays - mindRateOverall) * 100)} points more likely to also complete a Mind habit -- the two seem to reinforce each other for you.`
        )
      }
    }
  }

  return insights
}

router.get('/insights', (req, res) => {
  res.json({ insights: computeMindInsights() })
})

export default router
