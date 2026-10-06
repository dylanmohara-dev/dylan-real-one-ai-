import { DEFAULT_WORK_AVAILABILITY, summarizeSchedule } from './scheduleCapacity.js'

const MAX_CANDIDATES = 5
const MAX_HISTORICAL_MEMORIES = 3
const DAY_MS = 24 * 60 * 60 * 1000
const WORK_TYPES = new Set(['task', 'school_assignment', 'school_test'])

function localTodayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Match requests asking Dylan AI to choose a focus, not to write generic content. */
export function isDecisionQuestion(message) {
  const text = typeof message === 'string' ? message.trim().replace(/[?!.,]+$/g, '') : ''
  if (!text) return false

  return /\bwhat should i (?:focus on|prioriti[sz]e|do next)\b/i.test(text)
    || /\bwhat do i (?:focus on|prioriti[sz]e|do next)\b/i.test(text)
    || /\b(?:help me )?plan(?: out)? (?:my )?(?:day|week|today)\b/i.test(text)
    || /\bwhat(?:'s| is) (?:the )?(?:most important|highest priority)\b/i.test(text)
}

function dayDistance(dateValue, today) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null
  const date = new Date(`${dateValue}T00:00:00Z`)
  const current = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return null
  return Math.round((date.getTime() - current.getTime()) / DAY_MS)
}

function dueDateEvidence(dueDate, today) {
  if (!dueDate) return { rank: 0, reason: null, confidence: 'missing' }
  const days = dayDistance(dueDate, today)
  if (days === null) {
    return {
      rank: 0,
      reason: null,
      confidence: 'unknown',
      uncertainty: `Due date "${dueDate}" is not a YYYY-MM-DD date, so its urgency was not estimated.`,
    }
  }
  if (days < 0) return { rank: 500 + Math.min(Math.abs(days), 30), reason: `overdue by ${Math.abs(days)} day(s)`, confidence: 'high' }
  if (days === 0) return { rank: 400, reason: 'due today', confidence: 'high' }
  if (days <= 3) return { rank: 300 - days, reason: `due in ${days} day(s)`, confidence: 'high' }
  if (days <= 7) return { rank: 200 - days, reason: `due within ${days} days`, confidence: 'medium' }
  return { rank: 100, reason: `due on ${dueDate}`, confidence: 'medium' }
}

function priorityEvidence(priority) {
  const value = typeof priority === 'string' ? priority.trim().toLowerCase() : ''
  const rank = { urgent: 40, high: 30, medium: 20, low: 10 }[value]
  if (!rank) return null
  return { rank, value }
}

function effortEvidence(minutes, dueDays) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return null
  // A recorded estimate only increases time pressure for work due within
  // three days. It never implies that the user has (or lacks) free time.
  const rank = dueDays !== null && dueDays <= 3 ? Math.min(30, Math.ceil(minutes / 60) * 5) : 0
  return { minutes, rank }
}

function dateCompetition(dateValue, commitments) {
  if (!dateValue) return 0
  return commitments.filter((item) => WORK_TYPES.has(item.type)
    && (item.dateKey || item.dueDate || item.scheduledDate) === dateValue).length
}

function assessCapacity(commitment, dueDate, effortMinutes, commitments, scheduleByDate) {
  if (effortMinutes == null) return null
  const day = scheduleByDate.get(dueDate)
  const otherKnownEffortMinutes = commitments
    .filter((item) => item !== commitment && WORK_TYPES.has(item.type)
      && (item.dateKey || item.dueDate || item.scheduledDate) === dueDate
      && item.estimatedEffortProvenance === 'user_recorded'
      && Number.isSafeInteger(item.estimatedEffortMinutes) && item.estimatedEffortMinutes > 0)
    .reduce((total, item) => total + item.estimatedEffortMinutes, 0)
  if (!day || day.usableCapacityMinutes === null) {
    return {
      status: 'unknown',
      capacityMinutes: null,
      otherKnownEffortMinutes,
      remainingCapacityMinutes: null,
      candidateEffortMinutes: effortMinutes,
      overCapacityMinutes: null,
      provenance: null,
    }
  }
  const remainingCapacityMinutes = Math.max(0, day.usableCapacityMinutes - otherKnownEffortMinutes)
  return {
    status: 'calculated',
    capacityMinutes: day.usableCapacityMinutes,
    otherKnownEffortMinutes,
    remainingCapacityMinutes,
    candidateEffortMinutes: effortMinutes,
    overCapacityMinutes: Math.max(0, effortMinutes - remainingCapacityMinutes),
    provenance: 'calculated_from_user_recorded_effort_declared_availability_and_calendar_constraints',
  }
}

function goalCandidate(goal, today) {
  const due = dueDateEvidence(goal.dueDate, today)
  const evidence = [{
    claim: `Current goal: ${goal.title}`,
    source: 'PersonalContext.currentGoals',
    provenance: 'current_structured_record',
  }]
  if (goal.progress !== undefined) evidence.push({
    claim: `Recorded progress: ${goal.progress}%`,
    source: 'goals.progress',
    provenance: 'current_structured_record',
  })
  if (goal.dueDate) evidence.push({
    claim: `Recorded due date: ${goal.dueDate}`,
    source: 'goals.dueDate',
    provenance: 'current_structured_record',
  })
  if (goal.mode) evidence.push({
    claim: `Recorded life area: ${goal.mode}`,
    source: 'goals.mode',
    provenance: 'current_structured_record',
  })
  const uncertainty = []
  if (!goal.dueDate) uncertainty.push('No due date is recorded; goal urgency is unknown.')
  if (due.uncertainty) uncertainty.push(due.uncertainty)
  return {
    type: 'goal',
    title: goal.title,
    area: goal.mode || null,
    rankScore: due.rank,
    rankScoreProvenance: 'calculated_from_current_structured_record_evidence',
    rankReasons: due.reason ? [due.reason] : [],
    confidence: due.confidence === 'high' ? 'high' : due.reason ? 'medium' : 'low',
    evidence,
    uncertainty,
  }
}

function commitmentCandidate(commitment, today, { commitments = [], scheduleConstraints = [], scheduleByDate = new Map() } = {}) {
  const scheduledDate = commitment.scheduledDate || ''
  const dueDate = commitment.dateKey || commitment.dueDate || scheduledDate
  const date = dueDateEvidence(dueDate, today)
  const priority = priorityEvidence(commitment.priority)
  const dueDays = dueDate ? dayDistance(dueDate, today) : null
  const effort = commitment.estimatedEffortProvenance === 'user_recorded'
    ? effortEvidence(commitment.estimatedEffortMinutes, dueDays)
    : null
  const sameDateCount = dateCompetition(dueDate, commitments)
  const competitionRank = Math.min(20, Math.max(0, sameDateCount - 1) * 4)
  const daySchedule = scheduleByDate.get(dueDate) || null
  const scheduleConflictCount = daySchedule?.conflicts?.length || 0
  const scheduleConflictRank = Math.min(20, scheduleConflictCount * 10)
  const occupiedTimeRank = daySchedule?.occupiedMinutes == null ? 0 : Math.min(20, Math.floor(daySchedule.occupiedMinutes / 60) * 5)
  const capacityAssessment = effort
    ? assessCapacity(commitment, dueDate, effort.minutes, commitments, scheduleByDate)
    : null
  const capacityPressureRank = capacityAssessment?.status === 'calculated' && capacityAssessment.overCapacityMinutes > 0
    ? Math.min(30, Math.ceil(capacityAssessment.overCapacityMinutes / 30) * 5)
    : 0
  const isScheduled = Boolean(scheduledDate)
  const evidence = [{
    claim: `${commitment.completionState || 'open'} ${commitment.type.replaceAll('_', ' ')}: ${commitment.title}`,
    source: commitment.source,
    provenance: commitment.provenance || 'current_structured_record',
  }]
  if (dueDate) evidence.push({
    claim: `Recorded ${isScheduled ? 'scheduled date' : 'due date'}: ${dueDate}`,
    source: `${commitment.source}.${isScheduled ? 'scheduledDate' : 'dueDate'}`,
    provenance: commitment.scheduledDateProvenance || commitment.provenance || 'current_structured_record',
  })
  if (commitment.startTime) evidence.push({
    claim: `Recorded time: ${commitment.startTime}${commitment.endTime ? `–${commitment.endTime}` : ''}`,
    source: `${commitment.source}.startTime`,
    provenance: commitment.provenance || 'current_structured_record',
  })
  if (commitment.priority) evidence.push({
    claim: `Recorded priority: ${priority?.value || commitment.priority}`,
    source: `${commitment.source}.priority`,
    provenance: commitment.provenance || 'current_structured_record',
  })
  if (effort) evidence.push({
    claim: `User-recorded estimated effort: ${effort.minutes} minutes`,
    source: commitment.estimatedEffortSource || `${commitment.source}.estimatedEffortMinutes`,
    provenance: commitment.estimatedEffortProvenance,
  })
  if (competitionRank) evidence.push({
    claim: `${sameDateCount} actionable commitments share this date`,
    source: 'PersonalContext.currentCommitments',
    provenance: 'calculated_from_current_structured_record_evidence',
  })
  if (daySchedule?.occupiedMinutes != null) evidence.push({
    claim: `Calculated ${daySchedule.occupiedMinutes} occupied minute(s) across ${daySchedule.timedCommitmentCount} timed commitment(s) on the deadline date`,
    source: 'PersonalContext.scheduleConstraints',
    provenance: 'calculated_from_current_schedule_constraints',
  })
  if (scheduleConflictCount) evidence.push({
    claim: `Calculated ${scheduleConflictCount} overlapping fixed-commitment conflict(s) on the deadline date`,
    source: 'PersonalContext.scheduleConstraints',
    provenance: 'calculated_from_current_schedule_constraints',
  })
  if (capacityAssessment?.status === 'calculated') evidence.push({
    claim: `Calculated ${capacityAssessment.capacityMinutes} usable work-capacity minute(s) from declared availability minus fixed commitments; ${capacityAssessment.otherKnownEffortMinutes} other user-recorded effort minute(s) share this due date.`,
    source: 'PersonalContext.workAvailability+scheduleConstraints+currentCommitments',
    provenance: capacityAssessment.provenance,
  })
  if (capacityAssessment?.status === 'unknown') evidence.push({
    claim: 'Capacity is unknown because declared availability or complete calendar coverage is missing.',
    source: 'PersonalContext.workAvailability+calendarStatus',
    provenance: 'calculated_with_missing_source_data',
  })
  if (capacityAssessment?.status === 'calculated' && capacityAssessment.overCapacityMinutes > 0) evidence.push({
    claim: `Calculated recorded effort exceeds remaining declared capacity by ${capacityAssessment.overCapacityMinutes} minute(s).`,
    source: 'PersonalContext.workAvailability+scheduleConstraints+currentCommitments',
    provenance: capacityAssessment.provenance,
  })
  if (commitment.mode) evidence.push({
    claim: `Recorded life area: ${commitment.mode}`,
    source: `${commitment.source}.mode`,
    provenance: commitment.provenance || 'current_structured_record',
  })
  const dateConstraints = scheduleConstraints.filter((item) => (item.scheduledDate || item.localDate) === dueDate).slice(0, 4)
  for (const item of dateConstraints) {
    evidence.push({
      claim: `Scheduled commitment: ${item.title}${item.allDay ? ' (all day)' : item.localStartTime ? ` (${item.localStartTime}${item.localEndTime ? `–${item.localEndTime}` : ''})` : ''}`,
      source: item.source || 'PersonalContext.scheduleConstraints',
      provenance: item.provenance || 'current_structured_record',
    })
  }

  const rankReasons = date.reason ? [isScheduled ? date.reason.replace(/^due/, 'scheduled') : date.reason] : []
  if (priority) rankReasons.push(`${priority.value} recorded priority`)
  if (effort?.rank) rankReasons.push(`user-recorded ${effort.minutes}-minute estimate adds near-deadline workload pressure`)
  if (competitionRank) rankReasons.push(`${sameDateCount} actionable commitments share this date (calculated)`)
  if (scheduleConflictRank) rankReasons.push(`${scheduleConflictCount} fixed commitments overlap on the deadline date (calculated)`)
  if (occupiedTimeRank) rankReasons.push(`${daySchedule.timedCommitmentCount} timed calendar commitments/fixed commitments occupy ${daySchedule.occupiedMinutes} minutes on the deadline date (calculated)`)
  if (capacityPressureRank) rankReasons.push(`recorded effort exceeds remaining declared capacity by ${capacityAssessment.overCapacityMinutes} minutes (calculated)`)
  const uncertainty = []
  if (!dueDate && !priority) uncertainty.push('No usable due date or recognized priority is recorded.')
  if (!priority && dueDate) uncertainty.push('No recognized priority/importance is recorded; importance is unknown.')
  if (!effort) uncertainty.push('No effort estimate is recorded; duration-related urgency is unknown.')
  if (date.uncertainty) uncertainty.push(date.uncertainty)
  if (dueDate && daySchedule?.calendarStatus === 'available' && daySchedule.calendarEventCount === 0) evidence.push({
    claim: 'Apple Calendar returned zero events for this date.', source: 'apple_calendar', provenance: 'external_data',
  })
  if (daySchedule?.uncertainty?.length) uncertainty.push(...daySchedule.uncertainty)
  if (capacityAssessment?.status === 'unknown') uncertainty.push('Capacity is unknown; declared availability or complete calendar coverage is missing.')
  return {
    type: commitment.type,
    title: commitment.title,
    area: commitment.mode || null,
    source: commitment.source,
    sourceId: commitment.sourceId || null,
    dueDate: commitment.dueDate || null,
    scheduledDate: commitment.scheduledDate || null,
    completionState: commitment.completionState,
    completed: Boolean(commitment.completed),
    recordedPriority: priority?.value || null,
    estimatedEffortMinutes: effort?.minutes ?? null,
    estimatedEffortProvenance: effort ? 'user_recorded' : null,
    scheduleSummary: daySchedule ? {
      occupiedMinutes: daySchedule.occupiedMinutes,
      timedCommitmentCount: daySchedule.timedCommitmentCount,
      conflictCount: scheduleConflictCount,
      usableCapacityMinutes: daySchedule.usableCapacityMinutes,
      capacityStatus: daySchedule.capacityStatus,
    } : null,
    capacityAssessment,
    rankScore: date.rank + (priority?.rank || 0) + (effort?.rank || 0) + competitionRank + scheduleConflictRank + occupiedTimeRank + capacityPressureRank,
    rankScoreProvenance: 'calculated_from_current_structured_record_evidence',
    rankReasons,
    confidence: date.confidence === 'high' && (priority || isScheduled) ? 'high' : rankReasons.length ? 'medium' : 'low',
    evidence,
    uncertainty,
  }
}

/**
 * Build a bounded, read-only decision brief from already-assembled PersonalContext.
 * No stores are read or written here; historical memories are explicitly excluded
 * from ranking and only retained as historical reference.
 */
export function buildDecisionBrief(personalContext = {}, { today = localTodayKey() } = {}) {
  const hasCommitments = Array.isArray(personalContext.currentCommitments)
  const commitments = hasCommitments
    ? personalContext.currentCommitments
    : (Array.isArray(personalContext.currentPriorities) ? personalContext.currentPriorities : []).map((task, index) => ({
      ...task,
      id: task.id || `legacy-task-${index}`,
      type: 'task',
      source: 'tasks',
      sourceId: task.id || null,
      mode: task.mode || task.category || null,
      completionState: 'open',
      completed: false,
      actionable: true,
      provenance: 'current_structured_record',
      dateKey: task.dueDate,
    }))
  const linkedSchoolItemIds = new Set(commitments
    .filter((item) => item.type === 'task' && item.linkedSchoolItemId)
    .map((item) => item.linkedSchoolItemId))
  const seenCommitments = new Set()
  const candidateCommitments = commitments.filter((item) => {
    if (!item?.actionable || item.completed || !item.title) return false
    if (['school_assignment', 'school_test', 'sports_recurring_event', 'gym_recurring_event'].includes(item.type)
      && !item.dateKey && !item.scheduledDate) return false
    if (item.type === 'school_test' && linkedSchoolItemIds.has(item.sourceId)) return false
    const identity = item.id || `${item.source}:${item.sourceId}:${item.title}`
    if (seenCommitments.has(identity)) return false
    seenCommitments.add(identity)
    return true
  })
  const allScheduleConstraintRecords = (Array.isArray(personalContext.scheduleConstraints) ? personalContext.scheduleConstraints : [])
    .filter((item) => item && item.title && (item.scheduledDate || item.localDate))
  const scheduleTruncated = Boolean(personalContext.scheduleTruncated || allScheduleConstraintRecords.length > 80)
  const allScheduleConstraints = allScheduleConstraintRecords.slice(0, 80)
  const scheduleConstraints = allScheduleConstraints.filter((item) => item.actionable !== true)
  const commitmentKeys = new Set(candidateCommitments.flatMap((item) => [item.id, item.sourceId].filter(Boolean).map(String)))
  const actionableCalendarItems = allScheduleConstraints.filter((item) => item.actionable === true
    && ![item.id, item.sourceId].filter(Boolean).some((key) => commitmentKeys.has(String(key))))
  const goals = Array.isArray(personalContext.currentGoals) ? personalContext.currentGoals : []
  const sourceCalendarStatus = personalContext.calendarStatus || { source: 'apple_calendar', state: 'unknown', eventCount: null }
  const calendarStatus = scheduleTruncated && sourceCalendarStatus.state === 'available'
    ? { ...sourceCalendarStatus, state: 'partial', reason: 'The bounded DecisionEngine schedule omitted some events.' }
    : sourceCalendarStatus
  const scheduleDays = summarizeSchedule({
    today,
    days: 8,
    constraints: scheduleConstraints,
    availability: personalContext.workAvailability || DEFAULT_WORK_AVAILABILITY,
    calendarStatus,
    now: new Date(`${today}T00:00:00`),
  })
  const scheduleByDate = new Map(scheduleDays.map((item) => [item.date, item]))
  const candidates = [
    ...candidateCommitments.map((item) => commitmentCandidate(item, today, { commitments: candidateCommitments, scheduleConstraints, scheduleByDate })),
    ...actionableCalendarItems.map((item) => commitmentCandidate({
      ...item,
      type: 'calendar_action',
      source: 'apple_calendar',
      dueDate: item.scheduledDate,
      dateKey: item.scheduledDate,
      completionState: item.completionState || 'scheduled',
      completed: Boolean(item.completed),
      actionable: true,
    }, today, { commitments: [...candidateCommitments, ...actionableCalendarItems], scheduleConstraints, scheduleByDate })),
    ...goals.filter((item) => typeof item?.title === 'string' && item.title.trim()).map((goal) => goalCandidate(goal, today)),
  ].sort((a, b) => b.rankScore - a.rankScore
    || String(a.dueDate || a.scheduledDate || '').localeCompare(String(b.dueDate || b.scheduledDate || ''))
    || a.title.localeCompare(b.title)
    || String(a.sourceId || '').localeCompare(String(b.sourceId || '')))
    .slice(0, MAX_CANDIDATES)

  const historicalMemories = (Array.isArray(personalContext.relevantMemories) ? personalContext.relevantMemories : [])
    .filter((memory) => typeof memory?.content === 'string' && memory.content.trim())
    .slice(0, MAX_HISTORICAL_MEMORIES)
    .map((memory) => ({
      content: memory.content.trim().slice(0, 240),
      source: 'PersonalContext.relevantMemories',
      provenance: 'historical_memory',
      usedForRanking: false,
    }))

  const derivedEvidence = []
  for (const [section, value] of [
    ['PersonalContext.recentProgress', personalContext.recentProgress],
  ]) {
    if (value && (Array.isArray(value) ? value.length : Object.keys(value).length)) {
      derivedEvidence.push({
        summary: JSON.stringify(value).slice(0, 700),
        source: section,
        provenance: 'calculated_or_derived',
        usedForRanking: false,
      })
    }
  }

  const uncertainty = []
  if (!candidates.length) uncertainty.push(hasCommitments
    ? 'No current actionable commitment or goal was available in PersonalContext to rank.'
    : 'No current open task or goal was available in PersonalContext to rank.')
  if (candidates.some((candidate) => candidate.uncertainty.some((item) => item.includes('not a YYYY-MM-DD')))) {
    uncertainty.push('At least one recorded due date could not be compared safely; it was not used to estimate urgency.')
  }
  if (candidates.length && candidates.every((candidate) => candidate.confidence === 'low')) {
    uncertainty.push('Available candidates lack usable due dates or recognized priorities, so their relative order is weak.')
  }
  if (!candidateCommitments.length && goals.length) uncertainty.push('Only goals were available; they are objectives, not necessarily next actions.')
  if (historicalMemories.length) uncertainty.push('Historical memories are shown for context only and do not affect candidate ranking.')
  if (scheduleConstraints.length) uncertainty.push('Calendar events are included as schedule constraints and are not ranked as actions.')
  if (calendarStatus.state === 'disconnected') uncertainty.push('Calendar unavailable — Apple Calendar is not connected; no calendar events were assumed.')
  if (calendarStatus.state === 'unavailable') uncertainty.push('Calendar unavailable — its events could not be loaded; no empty-calendar assumption was made.')
  if (calendarStatus.state === 'partial') uncertainty.push('Calendar data is incomplete; capacity was not calculated from partial event coverage.')
  if (!personalContext.workAvailability?.weeklyWindows?.length && !personalContext.workAvailability?.dateOverrides?.length) {
    uncertainty.push('Capacity unknown — no availability windows configured.')
  }

  return {
    basis: 'Candidates are bounded current commitments and goals supplied by PersonalContext, not a complete inventory. Ranking uses recorded due dates, scheduled dates, priorities, and user-recorded effort estimates when present, plus calculated same-date work, actual overlapping schedule intervals, occupied time, and capacity pressure only when declared availability and complete calendar coverage are known. Calendar gaps are not availability. Missing effort and importance remain unknown. Calendar events without explicit actionability are schedule constraints, not recommended actions. This is a heuristic order, not a schedule.',
    candidates,
    scheduleConstraints,
    calendarStatus,
    capacityStatus: scheduleDays.some((day) => day.capacityStatus === 'calculated') ? 'calculated' : 'unknown',
    scheduleTruncated,
    scheduleDays,
    derivedEvidence,
    historicalMemories,
    uncertainty,
  }
}

export function formatDecisionBrief(brief) {
  if (!brief) return ''
  return `DECISION BRIEF — READ-ONLY EVIDENCE\n${JSON.stringify(brief)}`
}
