import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { buildStudySessions } from '../lib/studyPlan.js'
import { syncCalendarEvent, clearCalendarEvent } from '../lib/calendarAutoSync.js'
import { addToTrash } from '../lib/trashStore.js'
import { effortFieldsForCreate, effortFieldsForUpdate, EffortEstimateValidationError } from '../lib/effortEstimate.js'

const router = Router()

// See routes/assignments.js's ASSIGNMENT_CATEGORIES for why this exists.
// A test defaults to 'test' (not 'homework') since that's what a Test
// mode entry almost always is; 'quiz' covers a lower-stakes in-class quiz
// logged here instead of as an assignment.
const TEST_CATEGORIES = ['homework', 'quiz', 'test', 'project']

router.get('/', (req, res) => {
  res.json({ tests: loadData('tests') })
})

router.post('/', async (req, res) => {
  try {
    const { classId, title, date, topics, category } = req.body
    if (!title?.trim() || !classId) {
      return res.status(400).json({ error: 'classId and title are required' })
    }
    const tests = loadData('tests')
    const test = {
      id: Date.now().toString(),
      classId,
      title: title.trim(),
      date: date || '',
      category: TEST_CATEGORIES.includes(category) ? category : 'test',
      // Comma-separated, optional -- what the test actually covers. Empty
      // by default; a generated study plan falls back to generic
      // technique-only guidance when this is blank (see lib/studyPlan.js),
      // but naming real topics is what turns that into a plan Dylan can
      // actually act on.
      topics: (topics || '').trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      ...effortFieldsForCreate(req.body),
    }
    // Best-effort real-calendar write -- see lib/calendarAutoSync.js.
    await syncCalendarEvent(test, { title: test.title, date: test.date, mode: 'school' })
    tests.push(test)
    saveData('tests', tests)
    res.json({ test })
  } catch (error) {
    if (error instanceof EffortEstimateValidationError) return res.status(400).json({ error: error.message })
    console.error(error)
    res.status(500).json({ error: 'Could not save test' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { fields, clear } = effortFieldsForUpdate(req.body)
    const tests = loadData('tests')
    const index = tests.findIndex((t) => t.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Test not found' })
    tests[index] = { ...tests[index], ...fields, id: tests[index].id }
    if (clear) {
      delete tests[index].estimatedEffortMinutes
      delete tests[index].estimatedEffortProvenance
    }
    const effortOnly = Object.keys(req.body).length === 1 && Object.hasOwn(req.body, 'estimatedEffortMinutes')
    if (!effortOnly) {
      await syncCalendarEvent(tests[index], { title: tests[index].title, date: tests[index].date, mode: 'school' })
    }
    saveData('tests', tests)
    res.json({ test: tests[index] })
  } catch (error) {
    if (error instanceof EffortEstimateValidationError) return res.status(400).json({ error: error.message })
    console.error(error)
    res.status(500).json({ error: 'Could not update test' })
  }
})

router.delete('/:id', async (req, res) => {
  const tests = loadData('tests')
  const test = tests.find((t) => t.id === req.params.id)
  // Any study-plan tasks generated for this test are now pointing at
  // nothing -- clean them (and their own real calendar events, if any)
  // up in the same request rather than leaving orphaned "study for X"
  // tasks -- or orphaned calendar entries -- behind forever.
  const allTasks = loadData('tasks')
  const orphaned = allTasks.filter((t) => t.studyPlanFor === req.params.id)

  if (test) {
    addToTrash({ mode: 'school', kind: 'test', label: `Test: ${test.title}`, snapshot: { test, tasks: orphaned } })
    await clearCalendarEvent(test)
  }

  const remaining = tests.filter((t) => t.id !== req.params.id)
  saveData('tests', remaining)
  for (const orphan of orphaned) await clearCalendarEvent(orphan)
  const tasks = allTasks.filter((t) => t.studyPlanFor !== req.params.id)
  saveData('tasks', tasks)
  res.json({ success: true })
})

// AI-generated (really: research-backed deterministic) study plan for one
// test. Creates a set of real Task entries -- one per study session, each
// with its own due date -- so the plan shows up wherever tasks already
// show up (Tasks list, Calendar) with no new screen required. See
// lib/studyPlan.js for the actual scheduling logic and the research
// behind it.
router.post('/:id/study-plan', async (req, res) => {
  try {
    const tests = loadData('tests')
    const test = tests.find((t) => t.id === req.params.id)
    if (!test) {
      return res.status(404).json({ error: 'Test not found' })
    }
    if (!test.date) {
      return res.status(400).json({ error: 'This test has no date set yet -- add one before generating a study plan.' })
    }

    const sessions = buildStudySessions(test.date, test.topics || '')
    if (!sessions.length) {
      return res.status(400).json({ error: 'This test is today or already past -- nothing left to schedule.' })
    }

    const classes = loadData('classes')
    const className = classes.find((c) => c.id === test.classId)?.name || 'this class'

    // Real gap Dylan named directly: a schedule that only ever says WHICH
    // TECHNIQUE to use (per lib/studyPlan.js's research-backed rotation)
    // "doesn't actually help" if it never connects back to where he's
    // actually weak. Look at every other graded item in this same class
    // for the lowest score that plausibly overlaps this test's material
    // (shared words in title/topics, filtering out short/common words),
    // and if one exists, name it and the score directly in the first
    // session -- "start with X, you scored Y% there" is something Dylan
    // can actually act on, "do retrieval practice" alone is not.
    function wordsOf(text) {
      return new Set(
        (text || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3)
      )
    }
    function overlaps(a, b) {
      const wa = wordsOf(a)
      const wb = wordsOf(b)
      for (const w of wa) {
        if (wb.has(w)) return true
      }
      return false
    }

    const classAssignments = loadData('assignments').filter(
      (a) => a.classId === test.classId && a.grade !== null && a.grade !== undefined
    )
    const classTests = loadData('tests').filter(
      (t) => t.classId === test.classId && t.id !== test.id && t.grade !== null && t.grade !== undefined
    )
    const gradedItems = [...classAssignments, ...classTests]
    const testMaterial = `${test.title} ${test.topics || ''}`

    let weakItem = gradedItems
      .filter((item) => overlaps(`${item.title} ${item.topics || ''}`, testMaterial))
      .sort((a, b) => Number(a.grade) - Number(b.grade))[0]

    // No topic overlap found (or no topics given at all) -- fall back to
    // the single weakest graded item in the class overall, but only if
    // it's genuinely a soft spot (<75%), not just "not perfect."
    if (!weakItem) {
      weakItem = gradedItems
        .filter((item) => Number(item.grade) < 75)
        .sort((a, b) => Number(a.grade) - Number(b.grade))[0]
    }

    if (weakItem && sessions.length) {
      sessions[0] = {
        ...sessions[0],
        detail: `${sessions[0].detail} Start with ${weakItem.title} -- you scored ${weakItem.grade}% there last time, so that's the highest-value gap to close first.`,
      }
    }

    // Regenerating (e.g. after the test date changes) replaces the old
    // plan rather than piling up duplicate tasks alongside it.
    const tasks = loadData('tasks').filter((t) => t.studyPlanFor !== test.id)

    const created = []
    for (const [index, session] of sessions.entries()) {
      const task = {
        id: `${Date.now()}-${index}`,
        title: `Study ${className} for "${test.title}": ${session.label}`,
        priority: session.label === 'Practice test' ? 'high' : 'medium',
        dueDate: session.dateKey,
        reminder: 'none',
        category: 'school',
        completed: false,
        createdAt: new Date().toISOString(),
        // Marks this task as machine-generated for this specific test, so
        // it can be found again to regenerate or clear, and so it can be
        // told apart from a task Dylan typed in himself.
        studyPlanFor: test.id,
        studyPlanDetail: session.detail,
      }
      // Sequential (not Promise.all) on purpose -- each write is a
      // separate real CalDAV request, and firing several concurrent
      // creates at the same external service for one study plan isn't
      // worth the speed for what's already a background, non-blocking step.
      await syncCalendarEvent(task, { title: task.title, date: task.dueDate, mode: 'school' })
      tasks.push(task)
      created.push(task)
    }

    saveData('tasks', tasks)
    res.json({ tasks: created })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not generate study plan' })
  }
})

router.delete('/:id/study-plan', async (req, res) => {
  const allTasks = loadData('tasks')
  const orphaned = allTasks.filter((t) => t.studyPlanFor === req.params.id)
  for (const orphan of orphaned) await clearCalendarEvent(orphan)
  const tasks = allTasks.filter((t) => t.studyPlanFor !== req.params.id)
  saveData('tasks', tasks)
  res.json({ success: true })
})

// Restores a previously-deleted test exactly as it was (undo support).
// See classes.js's /restore for why this takes the full record rather
// than reusing the create route.
router.post('/restore', async (req, res) => {
  const record = req.body.test
  if (!record?.id || !record?.title || !record?.classId) {
    return res.status(400).json({ error: 'A full test record with id, title and classId is required' })
  }
  const tests = loadData('tests')
  if (tests.some((t) => t.id === record.id)) {
    return res.json({ test: record })
  }
  // See assignments.js's /restore -- the snapshot predates the delete's
  // clearCalendarEvent call, so it still points at a real event that's
  // already gone. Drop the stale link so this re-syncs with a fresh one
  // instead of retrying a doomed update forever.
  delete record.calendarEventUrl
  delete record.calendarEventEtag
  delete record.calendarEventUid
  await syncCalendarEvent(record, { title: record.title, date: record.date, mode: 'school' })
  tests.push(record)
  saveData('tests', tests)
  res.json({ test: record })
})

export default router
