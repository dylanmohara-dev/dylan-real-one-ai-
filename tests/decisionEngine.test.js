import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDecisionBrief, formatDecisionBrief, isDecisionQuestion } from '../lib/decisionEngine.js'

const root = path.dirname(fileURLToPath(import.meta.url))

test('ranks candidates using recorded due dates and priority', () => {
  const brief = buildDecisionBrief({
    currentPriorities: [
      { title: 'Long range task', priority: 'high', dueDate: '2026-10-20', category: 'school' },
      { title: 'Due today task', priority: 'medium', dueDate: '2026-10-05', category: 'gym' },
      { title: 'Overdue task', priority: 'low', dueDate: '2026-10-02', category: 'finance' },
    ],
    currentGoals: [],
  }, { today: '2026-10-05' })

  assert.deepEqual(brief.candidates.map((candidate) => candidate.title), [
    'Overdue task', 'Due today task', 'Long range task',
  ])
  assert.deepEqual(brief.candidates[0].rankReasons, ['overdue by 3 day(s)', 'low recorded priority'])
})

test('overdue work outranks future work when other recorded signals match', () => {
  const brief = buildDecisionBrief({ currentCommitments: [
    { id: 'future', type: 'task', title: 'Future', source: 'tasks', dateKey: '2026-10-06', priority: 'medium', actionable: true },
    { id: 'late', type: 'task', title: 'Overdue', source: 'tasks', dateKey: '2026-10-04', priority: 'medium', actionable: true },
  ] }, { today: '2026-10-05' })
  assert.deepEqual(brief.candidates.map((item) => item.title), ['Overdue', 'Future'])
})

test('closer deadline ranks ahead of a later one when other signals match', () => {
  const brief = buildDecisionBrief({ currentCommitments: [
    { id: 'later', type: 'task', title: 'Later', source: 'tasks', dateKey: '2026-10-09', actionable: true },
    { id: 'soon', type: 'task', title: 'Soon', source: 'tasks', dateKey: '2026-10-06', actionable: true },
  ] }, { today: '2026-10-05' })
  assert.deepEqual(brief.candidates.map((item) => item.title), ['Soon', 'Later'])
})

test('explicit priority affects ranking and is identified as recorded evidence', () => {
  const brief = buildDecisionBrief({ currentCommitments: [
    { id: 'low', type: 'task', title: 'Low', source: 'tasks', dateKey: '2026-10-06', priority: 'low', actionable: true },
    { id: 'high', type: 'task', title: 'High', source: 'tasks', dateKey: '2026-10-06', priority: 'high', actionable: true },
  ] }, { today: '2026-10-05' })
  assert.equal(brief.candidates[0].title, 'High')
  assert.ok(brief.candidates[0].evidence.some((item) => item.claim === 'Recorded priority: high'))
})

test('recorded effort increases near-deadline workload pressure without claiming available time', () => {
  const brief = buildDecisionBrief({ currentCommitments: [
    { id: 'short', type: 'task', title: 'Short estimate', source: 'tasks', dateKey: '2026-10-06', estimatedEffortMinutes: 30, estimatedEffortProvenance: 'user_recorded', actionable: true },
    { id: 'long', type: 'task', title: 'Long estimate', source: 'tasks', dateKey: '2026-10-06', estimatedEffortMinutes: 240, estimatedEffortProvenance: 'user_recorded', actionable: true },
  ] }, { today: '2026-10-05' })
  assert.equal(brief.candidates[0].title, 'Long estimate')
  assert.equal(brief.candidates[0].estimatedEffortMinutes, 240)
  assert.equal(brief.candidates[0].estimatedEffortProvenance, 'user_recorded')
  assert.ok(brief.candidates[0].evidence.some((item) => item.provenance === 'user_recorded' && item.claim === 'User-recorded estimated effort: 240 minutes'))
  assert.match(brief.candidates[0].rankReasons.join(' '), /workload pressure/)
  assert.doesNotMatch(JSON.stringify(brief), /you have time|available time/i)
})

test('missing effort and importance remain unknown instead of being fabricated', () => {
  const brief = buildDecisionBrief({ currentCommitments: [
    { id: 'unknown', type: 'school_assignment', title: 'Assignment', source: 'assignments', dateKey: '2026-10-06', actionable: true, provenance: 'current_structured_record' },
  ] }, { today: '2026-10-05' })
  const item = brief.candidates[0]
  assert.equal(item.estimatedEffortMinutes, null)
  assert.equal(item.recordedPriority, null)
  assert.ok(item.uncertainty.some((line) => line.includes('No effort estimate is recorded')))
  assert.ok(item.uncertainty.some((line) => line.includes('importance is unknown')))
  assert.equal(item.evidence.some((evidence) => /estimated effort|importance/.test(evidence.claim)), false)
})

test('invalid or unprovenanced effort cannot affect candidate ranking', () => {
  const baseline = buildDecisionBrief({ currentCommitments: [
    { id: 'a', type: 'task', title: 'A task', source: 'tasks', dateKey: '2026-10-06', actionable: true },
    { id: 'b', type: 'task', title: 'B task', source: 'tasks', dateKey: '2026-10-06', actionable: true },
  ] }, { today: '2026-10-05' })
  const invalid = buildDecisionBrief({ currentCommitments: [
    { id: 'a', type: 'task', title: 'A task', source: 'tasks', dateKey: '2026-10-06', estimatedEffortMinutes: 300, estimatedEffortProvenance: 'derived', actionable: true },
    { id: 'b', type: 'task', title: 'B task', source: 'tasks', dateKey: '2026-10-06', estimatedEffortMinutes: 1.5, estimatedEffortProvenance: 'user_recorded', actionable: true },
  ] }, { today: '2026-10-05' })
  assert.deepEqual(invalid.candidates.map((item) => item.rankScore), baseline.candidates.map((item) => item.rankScore))
  assert.ok(invalid.candidates.every((item) => item.estimatedEffortMinutes === null))
})

test('Canvas assignment facts and local effort retain separate evidence provenance', () => {
  const brief = buildDecisionBrief({ currentCommitments: [{
    id: 'canvas:canvas-1',
    type: 'school_assignment',
    title: 'Canvas report',
    source: 'canvas_assignments',
    sourceId: 'canvas-1',
    dateKey: '2026-10-06',
    dueDate: '2026-10-06T23:59:00Z',
    estimatedEffortMinutes: 60,
    estimatedEffortProvenance: 'user_recorded',
    estimatedEffortSource: 'canvas_completions.estimatedEffortMinutes',
    actionable: true,
    provenance: 'external_data',
  }] }, { today: '2026-10-05' })
  const candidate = brief.candidates[0]
  assert.ok(candidate.evidence.some((item) => item.source === 'canvas_assignments' && item.provenance === 'external_data'))
  assert.ok(candidate.evidence.some((item) => item.source === 'canvas_completions.estimatedEffortMinutes' && item.provenance === 'user_recorded'))
  assert.equal(candidate.estimatedEffortProvenance, 'user_recorded')
  assert.doesNotMatch(candidate.evidence.find((item) => item.source === 'canvas_completions.estimatedEffortMinutes').claim, /Canvas says/)
})

test('only actual timed calendar constraints affect same-date ranking', () => {
  const base = { currentCommitments: [
    { id: 'a', type: 'task', title: 'A task', source: 'tasks', dateKey: '2026-10-06', actionable: true },
    { id: 'b', type: 'task', title: 'B task', source: 'tasks', dateKey: '2026-10-07', actionable: true },
  ] }
  const noConstraints = buildDecisionBrief(base, { today: '2026-10-05' })
  const allDay = buildDecisionBrief({ ...base, scheduleConstraints: [
    { title: 'All day event', scheduledDate: '2026-10-06', allDay: true, actionable: false },
  ] }, { today: '2026-10-05' })
  const timed = buildDecisionBrief({ ...base, scheduleConstraints: [
    { title: 'Appointment', source: 'apple_calendar', scheduledDate: '2026-10-06', scheduledAt: '2026-10-06T14:00:00Z', endAt: '2026-10-06T15:00:00Z', allDay: false, actionable: false, provenance: 'external_data' },
  ] }, { today: '2026-10-05' })
  assert.equal(allDay.candidates.find((item) => item.title === 'A task').rankScore, noConstraints.candidates.find((item) => item.title === 'A task').rankScore)
  assert.ok(timed.candidates.find((item) => item.title === 'A task').rankScore > noConstraints.candidates.find((item) => item.title === 'A task').rankScore)
  assert.ok(timed.candidates.find((item) => item.title === 'A task').rankReasons.some((reason) => reason.includes('timed calendar commitments')))
  assert.ok(timed.candidates.find((item) => item.title === 'A task').evidence.some((item) => item.source === 'apple_calendar' && item.provenance === 'external_data'))
})

test('schedule interval conflicts change ranking only when supported by actual timed data', () => {
  const availability = { weeklyWindows: [{ id: 'monday', weekday: 'monday', startTime: '16:00', endTime: '20:00', enabled: true }], dateOverrides: [] }
  const base = {
    currentCommitments: [
      { id: 'task-a', type: 'task', title: 'Prepare assignment', source: 'tasks', dateKey: '2026-10-05', dueDate: '2026-10-05', actionable: true, estimatedEffortMinutes: 120, estimatedEffortProvenance: 'user_recorded', provenance: 'current_structured_record' },
      { id: 'task-b', type: 'task', title: 'Other work', source: 'tasks', dateKey: '2026-10-06', dueDate: '2026-10-06', actionable: true, provenance: 'current_structured_record' },
    ],
    workAvailability: availability,
    calendarStatus: { source: 'apple_calendar', state: 'available', eventCount: 3 },
  }
  const withoutEvents = buildDecisionBrief({ ...base, scheduleConstraints: [] }, { today: '2026-10-04' })
  const withEvents = buildDecisionBrief({
    ...base,
    scheduleConstraints: [
      { id: 'event-a', title: 'Appointment', source: 'apple_calendar', scheduledDate: '2026-10-05', startAt: '2026-10-05T16:00:00-04:00', endAt: '2026-10-05T17:00:00-04:00', actionable: false, provenance: 'external_data' },
      { id: 'event-b', title: 'Practice', source: 'sports_recurring_events', scheduledDate: '2026-10-05', startAt: '2026-10-05T16:30:00-04:00', endAt: '2026-10-05T17:30:00-04:00', actionable: false, provenance: 'current_structured_record' },
      { id: 'event-c', title: 'Team meeting', source: 'apple_calendar', scheduledDate: '2026-10-05', startAt: '2026-10-05T18:00:00-04:00', endAt: '2026-10-05T18:30:00-04:00', actionable: false, provenance: 'external_data' },
    ],
  }, { today: '2026-10-04' })

  const baseline = withoutEvents.candidates.find((item) => item.title === 'Prepare assignment')
  const candidate = withEvents.candidates.find((item) => item.title === 'Prepare assignment')
  assert.ok(candidate.rankScore > baseline.rankScore)
  assert.equal(candidate.scheduleSummary.occupiedMinutes, 120)
  assert.equal(candidate.scheduleSummary.timedCommitmentCount, 3)
  assert.equal(candidate.scheduleSummary.conflictCount, 1)
  assert.ok(candidate.evidence.some((item) => item.provenance === 'calculated_from_current_schedule_constraints'))
  assert.ok(candidate.evidence.some((item) => item.provenance === 'external_data'))
})

test('declared capacity is calculated from user availability minus fixed commitments and recorded workload', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [{
      id: 'school-work', type: 'school_assignment', title: 'Complete lab', source: 'assignments', sourceId: 'lab-1',
      dateKey: '2026-10-05', dueDate: '2026-10-05', estimatedEffortMinutes: 120,
      estimatedEffortProvenance: 'user_recorded', actionable: true, provenance: 'current_structured_record',
    }],
    workAvailability: { weeklyWindows: [{ id: 'monday', weekday: 'monday', startTime: '16:00', endTime: '18:00', enabled: true }], dateOverrides: [] },
    scheduleConstraints: [{
      id: 'practice', title: 'Practice', source: 'sports_recurring_events', scheduledDate: '2026-10-05',
      startAt: '2026-10-05T16:00:00-04:00', endAt: '2026-10-05T16:30:00-04:00', actionable: false,
      provenance: 'current_structured_record', constraintType: 'recurring_sports',
    }],
    calendarStatus: { source: 'apple_calendar', state: 'available', eventCount: 0 },
  }, { today: '2026-10-04' })
  const candidate = brief.candidates[0]
  assert.deepEqual(candidate.capacityAssessment, {
    status: 'calculated',
    capacityMinutes: 90,
    otherKnownEffortMinutes: 0,
    remainingCapacityMinutes: 90,
    candidateEffortMinutes: 120,
    overCapacityMinutes: 30,
    provenance: 'calculated_from_user_recorded_effort_declared_availability_and_calendar_constraints',
  })
  assert.ok(candidate.evidence.some((item) => item.claim.includes('90 usable work-capacity minute(s)')))
  assert.ok(candidate.evidence.some((item) => item.provenance === 'user_recorded'))
  assert.ok(candidate.rankReasons.some((reason) => reason.includes('exceeds remaining declared capacity by 30 minutes')))
})

test('unknown effort, availability, and calendar coverage never become fabricated capacity', () => {
  const candidateBase = {
    currentCommitments: [{ id: 'task', type: 'task', title: 'Due item', source: 'tasks', dateKey: '2026-10-05', actionable: true }],
    scheduleConstraints: [],
  }
  const noEffort = buildDecisionBrief({
    ...candidateBase,
    workAvailability: { weeklyWindows: [{ id: 'monday', weekday: 'monday', startTime: '16:00', endTime: '18:00', enabled: true }], dateOverrides: [] },
    calendarStatus: { state: 'available', eventCount: 0 },
  }, { today: '2026-10-04' }).candidates[0]
  assert.equal(noEffort.estimatedEffortMinutes, null)
  assert.equal(noEffort.capacityAssessment, null)
  assert.ok(noEffort.uncertainty.some((item) => item.includes('No effort estimate is recorded')))

  const noAvailability = buildDecisionBrief({
    currentCommitments: [{ ...candidateBase.currentCommitments[0], estimatedEffortMinutes: 60, estimatedEffortProvenance: 'user_recorded' }],
    scheduleConstraints: [],
    calendarStatus: { state: 'available', eventCount: 0 },
  }, { today: '2026-10-04' }).candidates[0]
  assert.equal(noAvailability.capacityAssessment.status, 'unknown')
  assert.equal(noAvailability.scheduleSummary.usableCapacityMinutes, null)
  assert.doesNotMatch(JSON.stringify(noAvailability), /\b0 minutes available\b|\bfree time\b/i)

  const unavailableCalendar = buildDecisionBrief({
    currentCommitments: [{ ...candidateBase.currentCommitments[0], estimatedEffortMinutes: 60, estimatedEffortProvenance: 'user_recorded' }],
    scheduleConstraints: [],
    workAvailability: { weeklyWindows: [{ id: 'monday', weekday: 'monday', startTime: '16:00', endTime: '18:00', enabled: true }], dateOverrides: [] },
    calendarStatus: { state: 'unavailable', eventCount: null },
  }, { today: '2026-10-04' }).candidates[0]
  assert.equal(unavailableCalendar.capacityAssessment.status, 'unknown')
  assert.equal(unavailableCalendar.scheduleSummary.usableCapacityMinutes, null)
  assert.ok(unavailableCalendar.uncertainty.some((item) => item.includes('Calendar unavailable')))
})

test('bounded schedule truncation prevents a false complete-capacity calculation', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [{ id: 'task', type: 'task', title: 'Estimate workload', source: 'tasks', dateKey: '2026-10-05', actionable: true, estimatedEffortMinutes: 60, estimatedEffortProvenance: 'user_recorded' }],
    workAvailability: { weeklyWindows: [{ id: 'monday', weekday: 'monday', startTime: '16:00', endTime: '18:00', enabled: true }], dateOverrides: [] },
    scheduleConstraints: Array.from({ length: 81 }, (_, index) => ({
      id: `event-${index}`, title: `Event ${index}`, source: 'apple_calendar', scheduledDate: '2026-10-05',
      startAt: `2026-10-05T${String(8 + (Math.floor(index / 4) % 12)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}:00-04:00`,
      endAt: `2026-10-05T${String(8 + (Math.floor(index / 4) % 12)).padStart(2, '0')}:${String((index % 4) * 15 + 10).padStart(2, '0')}:00-04:00`,
      actionable: false, provenance: 'external_data',
    })),
    calendarStatus: { state: 'available', eventCount: 81 },
  }, { today: '2026-10-04' })
  assert.equal(brief.scheduleTruncated, true)
  assert.equal(brief.calendarStatus.state, 'partial')
  assert.equal(brief.candidates[0].capacityAssessment.status, 'unknown')
  assert.equal(brief.candidates[0].scheduleSummary.usableCapacityMinutes, null)
})

test('equal-deadline commitments are ranked deterministically independent of input order', () => {
  const records = [
    { id: 'z', type: 'task', title: 'Zulu', source: 'tasks', dateKey: '2026-10-06', actionable: true },
    { id: 'a', type: 'task', title: 'Alpha', source: 'tasks', dateKey: '2026-10-06', actionable: true },
  ]
  const first = buildDecisionBrief({ currentCommitments: records }, { today: '2026-10-05' })
  const reversed = buildDecisionBrief({ currentCommitments: [...records].reverse() }, { today: '2026-10-05' })
  assert.deepEqual(first.candidates.map((item) => item.title), ['Alpha', 'Zulu'])
  assert.deepEqual(reversed.candidates.map((item) => item.title), ['Alpha', 'Zulu'])
  assert.ok(first.candidates.every((item) => item.rankReasons.some((reason) => reason.includes('2 actionable commitments share this date'))))
  assert.ok(first.candidates.every((item) => item.evidence.some((evidence) => evidence.provenance === 'current_structured_record')))
})

test('returns actual cross-mode candidates from PersonalContext', () => {
  const brief = buildDecisionBrief({
    currentPriorities: [
      { title: 'Submit biology lab', priority: 'high', dueDate: '2026-10-06', category: 'school' },
      { title: 'Log workout', priority: 'medium', category: 'gym' },
      { title: 'Prepare family check-in', priority: 'low', category: 'family' },
    ],
    currentGoals: [{ title: 'Build emergency savings', mode: 'finance', progress: 20 }],
  }, { today: '2026-10-05' })

  assert.deepEqual(new Set(brief.candidates.map((candidate) => candidate.area)), new Set(['school', 'gym', 'family', 'finance']))
  assert.ok(brief.candidates.every((candidate) => candidate.evidence.length > 0))
})

test('evidence identifies source and provenance for current and derived information', () => {
  const brief = buildDecisionBrief({
    currentPriorities: [{ title: 'Finish report', priority: 'high', dueDate: '2026-10-05' }],
    currentGoals: [{ title: 'Graduate', progress: 35, mode: 'school' }],
    recentProgress: [{ label: 'Recent schoolwork', records: ['Lab report'] }],
  }, { today: '2026-10-05' })
  const task = brief.candidates.find((candidate) => candidate.title === 'Finish report')
  const goal = brief.candidates.find((candidate) => candidate.title === 'Graduate')

  assert.ok(task.evidence.some((item) => item.source === 'tasks.priority' && item.provenance === 'current_structured_record'))
  assert.ok(goal.evidence.some((item) => item.source === 'goals.progress' && item.provenance === 'current_structured_record'))
  assert.equal(task.rankScoreProvenance, 'calculated_from_current_structured_record_evidence')
  assert.equal(brief.derivedEvidence[0].provenance, 'calculated_or_derived')
  assert.match(formatDecisionBrief(brief), /DECISION BRIEF — READ-ONLY EVIDENCE/)
})

test('insufficient data is explicit and unparseable deadlines are not guessed', () => {
  const empty = buildDecisionBrief({ currentPriorities: [], currentGoals: [] }, { today: '2026-10-05' })
  assert.equal(empty.candidates.length, 0)
  assert.ok(empty.uncertainty.some((item) => item.includes('No current open task or goal')))

  const uncertain = buildDecisionBrief({
    currentPriorities: [{ title: 'Call coach', dueDate: 'tomorrow', priority: 'medium' }],
    currentGoals: [],
  }, { today: '2026-10-05' })
  assert.equal(uncertain.candidates[0].rankReasons.includes('due today'), false)
  assert.ok(uncertain.candidates[0].uncertainty.some((item) => item.includes('not a YYYY-MM-DD')))
  assert.ok(uncertain.uncertainty.some((item) => item.includes('could not be compared safely')))
})

test('historical memories are labeled and never affect candidate ranking', () => {
  const base = {
    currentPriorities: [{ title: 'Study chemistry', priority: 'medium', dueDate: '2026-10-06', category: 'school' }],
    currentGoals: [],
  }
  const withoutMemory = buildDecisionBrief(base, { today: '2026-10-05' })
  const withMemory = buildDecisionBrief({
    ...base,
    relevantMemories: [{ content: 'Last year I disliked chemistry', kind: 'preference', updatedAt: '2025-01-01' }],
  }, { today: '2026-10-05' })

  assert.deepEqual(withMemory.candidates, withoutMemory.candidates)
  assert.equal(withMemory.historicalMemories[0].provenance, 'historical_memory')
  assert.equal(withMemory.historicalMemories[0].usedForRanking, false)
  assert.ok(withMemory.uncertainty.some((item) => item.includes('do not affect candidate ranking')))
})

test('decision intent is narrow and writing requests remain on the content path', () => {
  assert.equal(isDecisionQuestion('What should I focus on today?'), true)
  assert.equal(isDecisionQuestion('What should I prioritize?'), true)
  assert.equal(isDecisionQuestion('What should I do next?'), true)
  assert.equal(isDecisionQuestion('Help me plan my day.'), true)
  assert.equal(isDecisionQuestion('Help me plan out my week.'), true)
  assert.equal(isDecisionQuestion('Help me write a plan for a business.'), false)
  assert.equal(isDecisionQuestion('Explain how weekly planning works.'), false)

  const chatSource = fs.readFileSync(path.join(root, '..', 'routes', 'chat.js'), 'utf8')
  assert.match(chatSource, /looksLikeContentRequest\(latestMessage\) && !decisionQuestion/)
  assert.match(chatSource, /decisionQuestion \? buildDecisionBrief\(personalContext\) : null/)
})

test('building a decision brief is read-only and does not mutate PersonalContext', () => {
  const context = Object.freeze({
    currentPriorities: Object.freeze([
      Object.freeze({ title: 'Prepare presentation', priority: 'high', dueDate: '2026-10-06', category: 'school' }),
    ]),
    currentGoals: Object.freeze([Object.freeze({ title: 'Graduate', progress: 40, mode: 'school' })]),
    relevantMemories: Object.freeze([Object.freeze({ content: 'Historical preference', kind: 'preference' })]),
    recentProgress: Object.freeze([]),
    importantCurrentState: Object.freeze({}),
  })
  const before = JSON.stringify(context)

  const brief = buildDecisionBrief(context, { today: '2026-10-05' })

  assert.ok(brief.candidates.length)
  assert.equal(JSON.stringify(context), before)
})

test('ranks School and recurring commitments alongside ordinary tasks and goals', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [
      { id: 'task-1', type: 'task', title: 'Plan ahead', source: 'tasks', dueDate: '2026-10-10', dateKey: '2026-10-10', priority: 'high', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
      { id: 'assignment-1', type: 'school_assignment', title: 'History essay', source: 'assignments', dueDate: '2026-10-06', dateKey: '2026-10-06', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
      { id: 'practice-1', type: 'sports_recurring_event', title: 'Team practice', source: 'sports_recurring_events', scheduledDate: '2026-10-05', startTime: '15:30', actionable: true, completionState: 'scheduled', provenance: 'current_structured_record', scheduledDateProvenance: 'calculated_from_current_structured_schedule' },
    ],
    currentGoals: [{ title: 'Graduate', dueDate: '2026-10-12', mode: 'school' }],
  }, { today: '2026-10-05' })

  assert.deepEqual(brief.candidates.map((item) => item.title), ['Team practice', 'History essay', 'Plan ahead', 'Graduate'])
  assert.ok(brief.candidates[0].rankReasons.includes('scheduled today'))
  assert.equal(brief.candidates[0].completionState, 'scheduled')
})

test('calendar events remain sourced schedule constraints unless explicitly actionable', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [],
    currentGoals: [],
    scheduleConstraints: [
      { id: 'event-1', title: 'Dentist', source: 'apple_calendar', scheduledDate: '2026-10-05', scheduledAt: '2026-10-05T14:00:00Z', actionable: false, provenance: 'external_data', completionState: 'scheduled' },
      { id: 'event-2', title: 'Prepare presentation', source: 'apple_calendar', scheduledDate: '2026-10-06', actionable: true, provenance: 'external_data', completionState: 'scheduled' },
    ],
  }, { today: '2026-10-05' })

  assert.equal(brief.candidates.length, 1)
  assert.equal(brief.candidates[0].title, 'Prepare presentation')
  assert.ok(brief.candidates[0].evidence.some((item) => item.provenance === 'external_data'))
  assert.equal(brief.scheduleConstraints[0].title, 'Dentist')
  assert.ok(brief.uncertainty.some((item) => item.includes('schedule constraints')))
})

test('linked study-plan tasks suppress their duplicate School test candidate', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [
      { id: 'task-study', type: 'task', title: 'Study chemistry', source: 'tasks', sourceId: 'task-study', linkedSchoolItemId: 'test-1', dueDate: '2026-10-06', dateKey: '2026-10-06', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
      { id: 'tests:test-1', type: 'school_test', title: 'Chemistry exam', source: 'tests', sourceId: 'test-1', dueDate: '2026-10-07', dateKey: '2026-10-07', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
      { id: 'tests:test-2', type: 'school_test', title: 'Biology exam', source: 'tests', sourceId: 'test-2', dueDate: '2026-10-08', dateKey: '2026-10-08', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
    ],
  }, { today: '2026-10-05' })

  assert.equal(brief.candidates.some((item) => item.title === 'Chemistry exam'), false)
  assert.ok(brief.candidates.some((item) => item.title === 'Study chemistry'))
  assert.ok(brief.candidates.some((item) => item.title === 'Biology exam'))
})

test('undated School records are not candidates and an empty workload stays explicit', () => {
  const brief = buildDecisionBrief({
    currentCommitments: [
      { id: 'assignment-1', type: 'school_assignment', title: 'Unscheduled worksheet', source: 'assignments', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
      { id: 'task-1', type: 'task', title: 'Unscheduled task', source: 'tasks', actionable: true, completionState: 'open', provenance: 'current_structured_record' },
    ],
    currentGoals: [],
  }, { today: '2026-10-05' })

  assert.deepEqual(brief.candidates.map((item) => item.title), ['Unscheduled task'])
  assert.ok(brief.candidates[0].uncertainty.some((item) => item.includes('No usable due date')))

  const empty = buildDecisionBrief({ currentCommitments: [], currentGoals: [] }, { today: '2026-10-05' })
  assert.equal(empty.candidates.length, 0)
  assert.ok(empty.uncertainty.some((item) => item.includes('No current actionable commitment')))
})

test('commitment ranking and candidate generation are read-only', () => {
  const context = Object.freeze({
    currentCommitments: Object.freeze([
      Object.freeze({ id: 'assignment-1', type: 'school_assignment', title: 'Write essay', source: 'assignments', dueDate: '2026-10-06', dateKey: '2026-10-06', actionable: true, completionState: 'open' }),
    ]),
    currentGoals: Object.freeze([]),
    scheduleConstraints: Object.freeze([]),
  })
  const before = JSON.stringify(context)
  const brief = buildDecisionBrief(context, { today: '2026-10-05' })
  assert.equal(brief.candidates[0].title, 'Write essay')
  assert.equal(JSON.stringify(context), before)
})
