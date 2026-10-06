import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getActionPolicy } from '../lib/actionPolicy.js'
import { executeActionWithPolicy } from '../lib/actionExecutor.js'

const root = path.dirname(fileURLToPath(import.meta.url))
let sandbox
let dataDir
let store
let personal

const STORE_NAMES = [
  'memories', 'goals', 'tasks', 'notes', 'classes', 'assignments', 'tests', 'school_progress',
  'sports_sessions', 'gym_exercises', 'gym_routines', 'gym_sessions', 'gym_logs', 'health',
  'sports_recurring_events', 'gym_recurring_events', 'work_availability',
  'canvas_completions',
  'health_goals', 'finance_accounts', 'finance_transactions', 'skills', 'skill_sessions',
  'reading_books', 'reading_goals', 'reading_sessions', 'mind_habits', 'mind_completions',
  'family_members', 'family_goals', 'family_log',
]

before(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dylan-ai-personal-context-'))
  const lib = path.join(sandbox, 'lib')
  dataDir = path.join(sandbox, 'data')
  fs.mkdirSync(lib, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  for (const file of ['dataStore.js', 'dataDriver.js', 'memoryService.js', 'skillsEngine.js', 'scheduleCapacity.js', 'personalContext.js']) {
    fs.copyFileSync(path.join(root, '..', 'lib', file), path.join(lib, file))
  }
  store = await import(pathToFileURL(path.join(lib, 'dataStore.js')).href)
  personal = await import(pathToFileURL(path.join(lib, 'personalContext.js')).href)
})

beforeEach(() => {
  for (const name of STORE_NAMES) store.saveData(name, name.endsWith('_goals') || name === 'health_goals' || name === 'school_progress' || name === 'reading_goals' || name === 'canvas_completions' || name === 'work_availability' ? {} : [])
})

after(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true })
})

test('returns clearly separated context sections and uses supplied identity/settings context', () => {
  const context = personal.getPersonalContext({
    mode: 'school',
    conversationContext: 'What should I study?',
    preferences: { userName: 'Dylan', schoolGradeLevel: 'college', allowActions: false },
  })
  assert.deepEqual(Object.keys(context), [
    'identityContext', 'currentGoals', 'relevantMemories', 'currentPriorities', 'currentPreferences',
    'relevantModeContext', 'recentProgress', 'importantCurrentState', 'relevantNotes', 'prompt',
  ])
  assert.deepEqual(context.identityContext, { userName: 'Dylan', activeMode: 'school' })
  assert.deepEqual(context.currentPreferences, { schoolGradeLevel: 'college' })
  assert.equal(context.prompt.includes('CURRENT APP CONTEXT — CURRENT STRUCTURED RECORD/SETTINGS'), true)
  assert.equal(context.prompt.includes('allowActions'), false)
})

test('prompt labels stored memory, current records, and derived data by provenance', () => {
  store.saveData('memories', [{ id: 'm1', content: 'I prefer quiet biology study spaces', createdAt: '2026-01-01' }])
  store.saveData('goals', [{ id: 'g1', title: 'Finish biology project', mode: 'school', progress: 40 }])
  store.saveData('tasks', [{ id: 't1', title: 'Review biology notes', mode: 'school', completed: false }])
  const context = personal.getPersonalContext({ mode: 'school', conversationContext: 'biology' })

  assert.match(context.prompt, /STORED MEMORY —/i)
  assert.match(context.prompt, /CURRENT GOALS — current structured records/i)
  assert.match(context.prompt, /CURRENT PRIORITIES — current structured records/i)
  assert.match(context.prompt, /PROVENANCE RULES:/)
  assert.match(context.prompt, /Calculated\/derived values are summaries/)
  assert.match(context.prompt, /Do not invent missing user facts/)
})

test('goals come from goals.json and mode-scoped goals are filtered', () => {
  store.saveData('goals', [
    { id: 'school-goal', title: 'Finish chemistry project', mode: 'school', progress: 35 },
    { id: 'sports-goal', title: 'Make varsity team', mode: 'sports', progress: 20 },
  ])
  const context = personal.getPersonalContext({ mode: 'school', conversationContext: 'chemistry' })
  assert.deepEqual(context.currentGoals.map((goal) => goal.title), ['Finish chemistry project'])
  assert.equal(context.currentGoals[0].progress, 35)
})

test('memories are retrieved through memoryService without rewriting legacy data', () => {
  const legacy = [{ id: 'legacy-1', content: 'I play guitar after school', createdAt: '2024-01-01T00:00:00.000Z' }]
  store.saveData('memories', legacy)
  const pathToMemories = path.join(dataDir, 'memories.json')
  const beforeBytes = fs.readFileSync(pathToMemories, 'utf8')
  const context = personal.getPersonalContext({ mode: 'skills', conversationContext: 'guitar practice' })
  assert.equal(context.relevantMemories[0].content, legacy[0].content)
  assert.equal(fs.readFileSync(pathToMemories, 'utf8'), beforeBytes)
})

test('mode-specific context and memories stay within the active mode', () => {
  store.saveData('classes', [{ id: 'c1', name: 'Chemistry' }])
  store.saveData('sports_sessions', [{ id: 's1', date: '2026-10-04', type: 'Practice', notes: 'football-only-detail' }])
  store.saveData('memories', [
    { id: 'school-memory', content: 'Chemistry is my hardest class', modeScope: 'school', sharingPermission: 'mode_only', createdAt: '2026-01-01' },
    { id: 'sports-memory', content: 'I play football', modeScope: 'sports', sharingPermission: 'mode_only', createdAt: '2026-01-01' },
  ])
  const school = personal.getPersonalContext({ mode: 'school', conversationContext: 'chemistry' })
  assert.deepEqual(school.relevantModeContext.classes, ['Chemistry'])
  assert.deepEqual(school.relevantMemories.map((item) => item.content), ['Chemistry is my hardest class'])
  assert.equal(school.prompt.includes('football-only-detail'), false)
})

test('general context does not include every domain’s detailed history', () => {
  store.saveData('sports_sessions', [{ id: 'sports-1', date: '2026-10-04', type: 'Practice', notes: 'very-detailed-sports-history' }])
  store.saveData('reading_sessions', [{ id: 'reading-1', date: '2026-10-04', pagesRead: 12 }])
  const context = personal.getPersonalContext({ mode: 'general', conversationContext: 'How am I doing?' })
  assert.equal(context.relevantModeContext, null)
  assert.deepEqual(context.recentProgress, [])
  assert.deepEqual(context.importantCurrentState.sports, { sessionsLogged: 1 })
  assert.equal(context.importantCurrentState.reading, undefined)
  assert.equal(context.prompt.includes('very-detailed-sports-history'), false)
  assert.equal(context.prompt.includes('reading-1'), false)
})

test('school, sports, gym, health, finance, skills, reading, mind, and family use their own stores', () => {
  const today = (() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })()
  store.saveData('classes', [{ id: 'c1', name: 'Biology' }])
  store.saveData('sports_sessions', [{ id: 'sp1', date: today, type: 'Practice', durationMinutes: 60 }])
  store.saveData('gym_exercises', [{ id: 'ex1', name: 'Squat' }])
  store.saveData('health', [{ id: 'h1', date: today, category: 'sleep', value: '8 hours' }])
  store.saveData('finance_accounts', [{ id: 'fa1', name: 'Checking', type: 'checking', balance: 125 }])
  store.saveData('skills', [{ id: 'sk1', name: 'Guitar', active: true, xp: 20, unit: 'minutes' }])
  store.saveData('reading_books', [{ id: 'b1', title: 'A Book', status: 'reading', currentPage: 20, totalPages: 100 }])
  store.saveData('reading_goals', { dailyPageGoal: 10 })
  store.saveData('mind_habits', [{ id: 'm1', name: 'Meditate', active: true }])
  store.saveData('family_members', [{ id: 'f1', name: 'Alex', relationship: 'Sibling' }])

  assert.deepEqual(personal.getPersonalContext({ mode: 'school' }).relevantModeContext.classes, ['Biology'])
  assert.equal(personal.getPersonalContext({ mode: 'sports' }).relevantModeContext.recentSessions[0].type, 'Practice')
  assert.deepEqual(personal.getPersonalContext({ mode: 'gym' }).relevantModeContext.exercises, ['Squat'])
  assert.equal(personal.getPersonalContext({ mode: 'health' }).relevantModeContext.todayEntries[0].value, '8 hours')
  assert.equal(personal.getPersonalContext({ mode: 'finance' }).relevantModeContext.netWorth, 125)
  assert.equal(personal.getPersonalContext({ mode: 'skills' }).relevantModeContext.activeSkills[0].name, 'Guitar')
  assert.equal(personal.getPersonalContext({ mode: 'reading' }).relevantModeContext.booksInProgress[0].title, 'A Book')
  assert.equal(personal.getPersonalContext({ mode: 'mind' }).relevantModeContext.activeHabits[0].name, 'Meditate')
  assert.equal(personal.getPersonalContext({ mode: 'family' }).relevantModeContext.members[0].name, 'Alex')
})

test('empty stores do not create invented identity, goals, memories, or progress', () => {
  const context = personal.getPersonalContext()
  assert.deepEqual(context.identityContext, {})
  assert.deepEqual(context.currentGoals, [])
  assert.deepEqual(context.relevantMemories, [])
  assert.deepEqual(context.currentPriorities, [])
  assert.equal(context.relevantModeContext, null)
  assert.deepEqual(context.recentProgress, [])
  assert.equal(context.prompt, '')
})

test('context lists and formatted prompt remain bounded', () => {
  store.saveData('goals', Array.from({ length: 80 }, (_, index) => ({ id: String(index), title: `Goal ${index}`, progress: index })))
  store.saveData('tasks', Array.from({ length: 80 }, (_, index) => ({ id: String(index), title: `Task ${index}`, completed: false, priority: 'medium' })))
  store.saveData('notes', Array.from({ length: 80 }, (_, index) => ({ id: String(index), content: `Useful note ${index}` })))
  store.saveData('memories', Array.from({ length: 80 }, (_, index) => ({ id: String(index), content: `Useful durable memory ${index}`, createdAt: '2026-01-01' })))
  const context = personal.getPersonalContext({ mode: 'general', conversationContext: 'useful' })
  assert.ok(context.currentGoals.length <= 6)
  assert.ok(context.currentPriorities.length <= 6)
  assert.ok(context.relevantNotes.length <= 3)
  assert.ok(context.relevantMemories.length <= 8)
  assert.ok(context.prompt.length <= 9000)
  assert.ok(personal.formatPersonalContext(context, 120).length <= 120)
})

test('decision commitments include dated School work, open tasks, schedules, and calendar constraints only', () => {
  store.saveData('tasks', [
    { id: 'plan-task', title: 'Study for chemistry test', dueDate: '2026-10-06', completed: false, studyPlanFor: 'test-1' },
    { id: 'undated-task', title: 'Call coach', completed: false, priority: 'high' },
    { id: 'done-task', title: 'Already done', completed: true, dueDate: '2026-10-05' },
  ])
  store.saveData('assignments', [
    { id: 'assignment-1', title: 'History essay', dueDate: '2026-10-07', completed: false },
    { id: 'assignment-undated', title: 'Unscheduled worksheet', completed: false },
  ])
  store.saveData('tests', [
    { id: 'test-1', title: 'Chemistry test', date: '2026-10-08', completed: false },
    { id: 'test-done', title: 'Past exam', date: '2026-10-05', completed: true },
  ])
  store.saveData('sports_recurring_events', [{
    id: 'practice-1', label: 'Team practice', weekdays: ['monday'], startTime: '15:30', endTime: '17:00',
    startDate: '2026-10-05', endDate: '2026-10-05',
  }])
  store.saveData('gym_recurring_events', [{
    id: 'lift-1', label: 'Team lift', weekdays: ['tuesday'], startTime: '06:00', endTime: '07:00',
  }])
  store.saveData('sports_sessions', [{ id: 'past-session', date: '2026-10-04', type: 'practice', notes: 'historical detail' }])
  store.saveData('canvas_completions', { 'canvas-done': { completed: true } })

  const context = personal.getPersonalContext({
    includeCommitments: true,
    today: '2026-10-05',
    canvasAssignments: [
      { id: 'canvas-open', title: 'Canvas biology lab', dueAt: '2026-10-06T23:59:00.000Z', courseId: 42, submitted: false },
      { id: 'canvas-done', title: 'Canvas finished quiz', dueAt: '2026-10-06T23:59:00.000Z', submitted: false },
    ],
    calendarEvents: [{ id: 'calendar-1', title: 'Dentist', start: '2026-10-06T14:00:00.000Z', end: '2026-10-06T15:00:00.000Z', mode: 'calendar' }],
  })
  const commitments = context.currentCommitments

  assert.ok(commitments.some((item) => item.id === 'assignments:assignment-1' && item.dueDate === '2026-10-07'))
  assert.ok(commitments.some((item) => item.id === 'tests:test-1' && item.completionState === 'open'))
  assert.ok(commitments.some((item) => item.id === 'task:plan-task' && item.linkedSchoolItemId === 'test-1'))
  assert.ok(commitments.some((item) => item.type === 'sports_recurring_event' && item.scheduledDate === '2026-10-05'))
  assert.ok(commitments.some((item) => item.type === 'gym_recurring_event' && item.scheduledDate === '2026-10-06'))
  assert.ok(commitments.some((item) => item.id === 'canvas:canvas-open' && item.provenance === 'external_data'))
  assert.ok(commitments.some((item) => item.id === 'canvas:canvas-done' && item.completed && item.completionState === 'completed'))
  assert.ok(commitments.some((item) => item.type === 'calendar_commitment' && item.title === 'Dentist'))
  assert.equal(commitments.some((item) => item.title === 'Unscheduled worksheet' || item.title === 'Already done'), false)
  assert.equal(commitments.some((item) => item.title === 'historical detail'), false)
  assert.equal(commitments.every((item) => item.source && item.provenance && item.completionState !== undefined), true)
  assert.deepEqual(context.scheduleConstraints.map((item) => item.title), ['Team practice', 'Team lift', 'Dentist'])
  assert.equal(context.scheduleConstraints[2].provenance, 'external_data')
  assert.equal(context.scheduleConstraints[2].actionable, false)
  assert.ok(commitments.length <= 92)
})

test('decision commitments preserve explicitly recorded priority and effort estimates', () => {
  store.saveData('tasks', [{ id: 'task-estimate', title: 'Prepare presentation', dueDate: '2026-10-07', priority: 'high', estimatedEffortMinutes: 90, estimatedEffortProvenance: 'user_recorded' }])
  store.saveData('assignments', [{ id: 'assignment-estimate', title: 'Write report', dueDate: '2026-10-08', priority: 'medium', estimatedEffortMinutes: 120, estimatedEffortProvenance: 'user_recorded' }])
  store.saveData('tests', [{ id: 'test-invalid-effort', title: 'Untrusted duration', date: '2026-10-09', estimatedEffortMinutes: 12.5, estimatedEffortProvenance: 'user_recorded' }])
  const context = personal.getPersonalContext({ mode: 'general', includeCommitments: true, today: '2026-10-06' })

  const task = context.currentCommitments.find((item) => item.sourceId === 'task-estimate')
  const assignment = context.currentCommitments.find((item) => item.sourceId === 'assignment-estimate')
  assert.equal(task.priority, 'high')
  assert.equal(task.estimatedEffortMinutes, 90)
  assert.equal(task.estimatedEffortProvenance, 'user_recorded')
  assert.equal(assignment.priority, 'medium')
  assert.equal(assignment.estimatedEffortMinutes, 120)
  assert.equal(assignment.estimatedEffortProvenance, 'user_recorded')
  const invalid = context.currentCommitments.find((item) => item.sourceId === 'test-invalid-effort')
  assert.equal(invalid.estimatedEffortMinutes, undefined)
  assert.equal(invalid.estimatedEffortProvenance, undefined)
})

test('schedule constraints normalize Apple and recurring Sports/Gym occurrences with stable identities', () => {
  store.saveData('sports_recurring_events', [{
    id: 'practice-series', label: 'Team practice', weekdays: ['monday'], startTime: '16:00', endTime: '17:30',
    startDate: '2026-10-05', endDate: '2026-10-05',
  }])
  store.saveData('gym_recurring_events', [{
    id: 'lift-series', label: 'Team lift', weekdays: ['monday'], startTime: '07:00', endTime: '08:00',
    startDate: '2026-10-05', endDate: '2026-10-05',
  }])
  const context = personal.getPersonalContext({
    includeCommitments: true,
    today: '2026-10-05',
    calendarEvents: [
      { id: 'apple-occurrence-1', uid: 'apple-series-1', calendarUrl: 'calendar-url', calendar: 'Personal', title: 'Dentist', start: '2026-10-05T14:00:00-04:00', end: '2026-10-05T15:00:00-04:00', isRecurring: true },
      { id: 'apple-all-day-1', uid: 'apple-all-day', calendarUrl: 'calendar-url', calendar: 'Personal', title: 'Holiday', start: '2026-10-05', end: '2026-10-06', allDay: true },
    ],
    calendarStatus: { source: 'apple_calendar', state: 'available', eventCount: 2 },
  })

  const appleTimed = context.scheduleConstraints.find((item) => item.id === 'apple-occurrence-1')
  const appleAllDay = context.scheduleConstraints.find((item) => item.id === 'apple-all-day-1')
  const sports = context.scheduleConstraints.find((item) => item.constraintType === 'recurring_sports')
  const gym = context.scheduleConstraints.find((item) => item.constraintType === 'recurring_gym')
  assert.equal(appleTimed.source, 'apple_calendar')
  assert.equal(appleTimed.sourceId, 'apple-series-1')
  assert.equal(appleTimed.localDate, '2026-10-05')
  assert.equal(appleTimed.localStartTime, '14:00')
  assert.equal(appleTimed.localEndTime, '15:00')
  assert.equal(appleTimed.constraintType, 'calendar_event')
  assert.equal(appleTimed.recurringOccurrence.occurrenceId, 'apple-occurrence-1')
  assert.equal(appleTimed.provenance, 'external_data')
  assert.equal(appleAllDay.allDay, true)
  assert.equal(appleAllDay.localDate, '2026-10-05')
  assert.equal(appleAllDay.localEndDate, '2026-10-06')
  assert.equal(appleAllDay.localStartTime, null)
  assert.equal(sports.sourceId, 'practice-series')
  assert.equal(sports.localDate, '2026-10-05')
  assert.equal(sports.localStartTime, '16:00')
  assert.equal(sports.constraintType, 'recurring_sports')
  assert.equal(sports.provenance, 'current_structured_record')
  assert.equal(gym.sourceId, 'lift-series')
  assert.equal(gym.constraintType, 'recurring_gym')
})

test('reading absent availability does not create or rewrite a real data record', () => {
  const availabilityPath = path.join(dataDir, 'work_availability.json')
  fs.rmSync(availabilityPath, { force: true })
  const context = personal.getPersonalContext({ includeCommitments: true, today: '2026-10-05' })
  assert.equal(context.workAvailabilityStatus, 'not_configured')
  assert.deepEqual(context.workAvailability, { weeklyWindows: [], dateOverrides: [] })
  assert.equal(fs.existsSync(availabilityPath), false)
})

test('Canvas commitment keeps external assignment provenance separate from local user-recorded effort', () => {
  store.saveData('canvas_completions', {
    'canvas-41': { classId: 'c1', category: 'project', completed: false, estimatedEffortMinutes: 60, estimatedEffortProvenance: 'user_recorded' },
  })
  const context = personal.getPersonalContext({
    includeCommitments: true,
    canvasAssignments: [{ id: 'canvas-41', title: 'Canvas project', dueAt: '2026-10-07T23:59:00Z', submitted: false }],
  })
  const item = context.currentCommitments.find((commitment) => commitment.sourceId === 'canvas-41')
  assert.equal(item.provenance, 'external_data')
  assert.equal(item.estimatedEffortMinutes, 60)
  assert.equal(item.estimatedEffortProvenance, 'user_recorded')
  assert.equal(item.estimatedEffortSource, 'canvas_completions.estimatedEffortMinutes')

  const disappeared = personal.getPersonalContext({ includeCommitments: true, canvasAssignments: [] })
  assert.equal(disappeared.currentCommitments.some((commitment) => commitment.sourceId === 'canvas-41'), false)
  const reappeared = personal.getPersonalContext({
    includeCommitments: true,
    canvasAssignments: [{ id: 'canvas-41', title: 'Canvas project', dueAt: '2026-10-07T23:59:00Z', submitted: false }],
  })
  assert.equal(reappeared.currentCommitments.find((commitment) => commitment.sourceId === 'canvas-41').estimatedEffortMinutes, 60)
  assert.equal(store.loadData('canvas_completions')['canvas-41'].estimatedEffortMinutes, 60)
})

test('legacy records without effort remain unknown', () => {
  store.saveData('tasks', [
    { id: 'legacy-task', title: 'Old task', dueDate: '2026-10-07' },
    { id: 'legacy-estimate', title: 'Stored old estimate', dueDate: '2026-10-08', estimatedEffortMinutes: 75 },
  ])
  const context = personal.getPersonalContext({ includeCommitments: true })
  const task = context.currentCommitments.find((item) => item.sourceId === 'legacy-task')
  assert.equal(task.estimatedEffortMinutes, undefined)
  assert.equal(task.estimatedEffortProvenance, undefined)
  const estimated = context.currentCommitments.find((item) => item.sourceId === 'legacy-estimate')
  assert.equal(estimated.estimatedEffortMinutes, 75)
  assert.equal(estimated.estimatedEffortProvenance, 'user_recorded')
})

test('PersonalContext leaves commitment collection opt-in for normal chat', () => {
  const context = personal.getPersonalContext({ mode: 'general' })
  assert.equal(Object.hasOwn(context, 'currentCommitments'), false)
  assert.equal(Object.hasOwn(context, 'scheduleConstraints'), false)
})

test('chat context and Phase 1B policy remain connected', async () => {
  const chatSource = fs.readFileSync(path.join(root, '..', 'routes', 'chat.js'), 'utf8')
  assert.match(chatSource, /getPersonalContext\(/)
  assert.match(chatSource, /\$\{personalContext\.prompt\}/)
  assert.doesNotMatch(chatSource, /loadData\('memories'\)/)
  assert.match(chatSource, /pumpOllamaStream\(response/)
  assert.match(chatSource, /looksLikeLiveDataRequest\(/)
  assert.match(chatSource, /executeActionWithPolicy\(/)
  assert.match(chatSource, /PROVENANCE AND CLAIMS:/)
  assert.match(chatSource, /AI-GENERATED INFERENCE \/ RECOMMENDATION:/)
  assert.match(chatSource, /Never invent missing facts about Dylan/)
  assert.match(chatSource, /phrase recommendations as suggestions/)
  assert.match(chatSource, /EXTERNAL DATA — connected integrations/)
  assert.match(chatSource, /\| LIVE:/)
  assert.equal(getActionPolicy('create_task'), 'AUTO')
  assert.equal(getActionPolicy('log_health'), 'CONFIRM')
  assert.equal(getActionPolicy('log_transaction'), 'EXPLICIT')
  let executed = false
  const result = await executeActionWithPolicy({ type: 'log_health' }, {
    execute: () => { executed = true; return { performed: true, message: 'logged' } },
  })
  assert.equal(result.status, 'pending')
  assert.equal(executed, false)
})
