import { loadData, loadDataIfExists } from './dataStore.js'
import { getMemoriesForMode } from './memoryService.js'
import { computeQuests, enrichSkill } from './skillsEngine.js'
import { DEFAULT_WORK_AVAILABILITY, WEEKDAY_KEYS, localDateKey, localTimeKey, validateWorkAvailability } from './scheduleCapacity.js'

const MODE_KEYS = new Set(['general', 'school', 'sports', 'gym', 'health', 'finance', 'skills', 'reading', 'mind', 'family'])
const MODE_TERMS = {
  school: ['school', 'class', 'classes', 'course', 'homework', 'assignment', 'test', 'exam', 'grade', 'gpa', 'study', 'graduate', 'college'],
  sports: ['sport', 'sports', 'practice', 'game', 'team', 'coach', 'opponent', 'training', 'varsity', 'season', 'tournament', 'competition'],
  gym: ['gym', 'workout', 'exercise', 'lift', 'strength', 'routine', 'set', 'muscle', 'bench', 'squat', 'deadlift'],
  health: ['health', 'sleep', 'food', 'water', 'activity', 'wellness', 'fitness'],
  finance: ['finance', 'money', 'account', 'budget', 'invest', 'investment', 'stock', 'trading', 'net', 'worth', 'save', 'savings', 'debt', 'portfolio'],
  skills: ['skill', 'practice', 'learn', 'learning', 'level', 'xp'],
  reading: ['read', 'reading', 'book', 'books', 'pages'],
  mind: ['mind', 'habit', 'habits', 'reflection', 'focus', 'journal'],
  family: ['family', 'member', 'members', 'relative', 'faith'],
}
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }
const MAX_CONTEXT_CHARS = 9000

function asArray(name) {
  const value = loadData(name, [])
  return Array.isArray(value) ? value : []
}

function asObject(name, fallback = {}) {
  const value = loadData(name, fallback)
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function cleanText(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function recordedEffort(record) {
  // A legacy value is already explicitly stored in an app-owned local record.
  // Before provenance was added, no system path generated effort estimates;
  // retain those values as user-recorded without rewriting the stored record.
  if (record?.estimatedEffortProvenance && record.estimatedEffortProvenance !== 'user_recorded') return undefined
  const value = record?.estimatedEffortMinutes
  const minutes = Number(value)
  return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : undefined
}

function tokens(value) {
  return new Set((String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []))
}

function queryScore(text, query) {
  const words = tokens(text)
  let score = 0
  for (const word of tokens(query)) if (words.has(word)) score += 1
  return score
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function recordDate(record) {
  const raw = record?.date || record?.createdAt || record?.finishedAt || record?.completedAt || record?.loggedAt
  if (!raw) return ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : dateKey(date)
}

function withinDays(record, days) {
  const key = recordDate(record)
  if (!key) return false
  const date = new Date(`${key}T12:00:00`)
  const today = new Date(`${dateKey()}T12:00:00`)
  const age = (today - date) / 86400000
  return age >= 0 && age < days
}

function dateOnly(value) {
  if (typeof value !== 'string') return ''
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)
  if (!match) return ''
  const date = new Date(`${match[1]}T12:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ? '' : match[1]
}

function localDateOnly(value) {
  if (typeof value !== 'string') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateOnly(value)
  return localDateKey(value)
}

function dayKeysFrom(today, count) {
  const [year, month, day] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset))
    return date.toISOString().slice(0, 10)
  })
}

function buildRecurringCommitments(source, records, today, horizonDays) {
  const dates = dayKeysFrom(today, horizonDays + 1)
  const commitments = []
  for (const event of records) {
    const eventDays = new Set((Array.isArray(event.weekdays) ? event.weekdays : []).map((day) => String(day).toLowerCase()))
    if (!event.id || !cleanText(event.label) || !event.startTime || !event.endTime || !eventDays.size) continue
    for (const date of dates) {
      if ((event.startDate && date < event.startDate) || (event.endDate && date > event.endDate)) continue
      const day = WEEKDAY_KEYS[new Date(`${date}T12:00:00`).getDay()]
      if (!eventDays.has(day)) continue
      commitments.push({
        id: `${source}:${event.id}:${date}`,
        title: cleanText(event.label),
        type: source === 'sports_recurring_events' ? 'sports_recurring_event' : 'gym_recurring_event',
        source,
        sourceId: event.id,
        mode: source === 'sports_recurring_events' ? 'sports' : 'gym',
        scheduledDate: date,
        scheduledDateProvenance: 'calculated_from_current_structured_schedule',
        startTime: event.startTime,
        endTime: event.endTime,
        completed: false,
        completionState: 'scheduled',
        actionable: true,
        provenance: 'current_structured_record',
      })
    }
  }
  return commitments
}

function calendarConstraint(event) {
  const dateValue = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : localDateKey(value)
  const startDate = event.localStartDate || dateValue(event.start)
  const endDate = event.localEndDate || (event.end ? dateValue(event.end) : startDate)
  const recurring = Boolean(event.isRecurring)
  return {
    id: event.id || null,
    occurrenceId: event.occurrenceId || event.id || null,
    sourceId: event.uid || event.id || null,
    source: 'apple_calendar',
    calendarId: event.calendarUrl || null,
    calendarName: cleanText(event.calendar, 80) || null,
    title: cleanText(event.title),
    type: 'calendar_commitment',
    localDate: startDate,
    localEndDate: endDate,
    localStartTime: event.allDay ? null : localTimeKey(event.start),
    localEndTime: event.allDay ? null : localTimeKey(event.end),
    startAt: event.start || null,
    scheduledDate: startDate,
    scheduledAt: event.start || null,
    endAt: event.end || null,
    allDay: Boolean(event.allDay),
    isRecurring: recurring,
    recurringOccurrence: recurring ? { seriesId: event.uid || null, occurrenceId: event.id || null } : null,
    constraintType: 'calendar_event',
    completed: false,
    completionState: 'scheduled',
    actionable: false,
    provenance: 'external_data',
  }
}

function buildCurrentCommitments({ today = dateKey(), calendarEvents = [], canvasAssignments = [], horizonDays = 7 } = {}) {
  const commitments = []
  const allTasks = asArray('tasks')
    .filter((task) => !task.completed && cleanText(task.title))
    .sort((a, b) => (dateOnly(a.dueDate) || '9999-12-31').localeCompare(dateOnly(b.dueDate) || '9999-12-31'))
  const tasks = allTasks
    .slice(0, 16)
    .map((task, index) => ({
      id: task.id ? `task:${task.id}` : `task:unidentified:${index}`,
      title: cleanText(task.title),
      type: 'task',
      source: 'tasks',
      sourceId: task.id || null,
      linkedSchoolItemId: task.studyPlanFor || null,
      mode: task.mode || task.modeScope || task.category || null,
      dueDate: cleanText(task.dueDate, 32) || null,
      dateKey: dateOnly(task.dueDate),
      priority: cleanText(task.priority, 24) || null,
      estimatedEffortMinutes: recordedEffort(task),
      estimatedEffortProvenance: recordedEffort(task) === undefined ? undefined : 'user_recorded',
      completed: false,
      completionState: 'open',
      actionable: true,
      provenance: 'current_structured_record',
    }))
  commitments.push(...tasks)
  let workloadTruncated = allTasks.length > tasks.length

  for (const [storeName, dueField, type] of [
    ['assignments', 'dueDate', 'school_assignment'],
    ['tests', 'date', 'school_test'],
  ]) {
    const allRecords = asArray(storeName)
      .filter((record) => !record.completed && cleanText(record.title) && dateOnly(record[dueField]))
      .sort((a, b) => dateOnly(a[dueField]).localeCompare(dateOnly(b[dueField])))
    const records = allRecords
      .slice(0, 12)
    if (allRecords.length > records.length) workloadTruncated = true
    commitments.push(...records.map((record, index) => ({
      id: `${storeName}:${record.id || `unidentified:${index}`}`,
      title: cleanText(record.title),
      type,
      source: storeName,
      sourceId: record.id || null,
      mode: 'school',
      dueDate: record[dueField],
      dateKey: dateOnly(record[dueField]),
      classId: record.classId || null,
      priority: cleanText(record.priority, 24) || null,
      estimatedEffortMinutes: recordedEffort(record),
      estimatedEffortProvenance: recordedEffort(record) === undefined ? undefined : 'user_recorded',
      completed: false,
      completionState: 'open',
      actionable: true,
      provenance: 'current_structured_record',
    })))
  }

  const canvasCompletions = asObject('canvas_completions')
  const allCanvasAssignments = canvasAssignments
    .filter((item) => item && cleanText(item.title) && localDateOnly(item.dueAt))
  const boundedCanvasAssignments = allCanvasAssignments.slice(0, 12)
  if (allCanvasAssignments.length > boundedCanvasAssignments.length) workloadTruncated = true
  commitments.push(...boundedCanvasAssignments
    .map((item) => {
      const localCompletion = canvasCompletions[item.id] || {}
      const completed = Boolean(item.submitted || localCompletion.completed)
      return {
        id: `canvas:${item.id}`,
        title: cleanText(item.title),
        type: 'school_assignment',
        source: 'canvas_assignments',
        sourceId: item.id || null,
        mode: 'school',
        dueDate: item.dueAt,
        dateKey: localDateOnly(item.dueAt),
        classId: item.courseId || null,
        priority: cleanText(item.priority, 24) || null,
        estimatedEffortMinutes: recordedEffort(localCompletion),
        estimatedEffortProvenance: recordedEffort(localCompletion) === undefined ? undefined : 'user_recorded',
        estimatedEffortSource: 'canvas_completions.estimatedEffortMinutes',
        completed,
        completionState: completed ? 'completed' : 'open',
        actionable: true,
        provenance: 'external_data',
      }
    }))

  const recurringCommitments = [
    ...buildRecurringCommitments('sports_recurring_events', asArray('sports_recurring_events').slice(0, 12), today, horizonDays),
    ...buildRecurringCommitments('gym_recurring_events', asArray('gym_recurring_events').slice(0, 12), today, horizonDays),
  ]
  commitments.push(...recurringCommitments)

  const allCalendarCommitments = calendarEvents
    .filter((event) => event && event.start && localDateKey(event.start) && cleanText(event.title))
    .map(calendarConstraint)
  const calendarCommitments = allCalendarCommitments.slice(0, 256)

  const recurringConstraints = recurringCommitments.map((item) => ({
    ...item,
    occurrenceId: item.id,
    localDate: item.scheduledDate,
    localStartTime: item.startTime,
    localEndTime: item.endTime,
    isRecurring: true,
    recurringOccurrence: { seriesId: item.sourceId, occurrenceId: item.id },
    constraintType: item.type === 'sports_recurring_event' ? 'recurring_sports' : 'recurring_gym',
    actionable: false,
  }))

  return {
    currentCommitments: [...commitments, ...calendarCommitments].slice(0, 104),
    scheduleConstraints: [...calendarCommitments, ...recurringConstraints]
      .sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))
        || String(a.localStartTime || '').localeCompare(String(b.localStartTime || ''))
        || String(a.title).localeCompare(String(b.title)))
      .slice(0, 256),
    workloadTruncated: Boolean(workloadTruncated || commitments.length + calendarCommitments.length > 104),
    scheduleTruncated: allCalendarCommitments.length > calendarCommitments.length
      || calendarCommitments.length + recurringConstraints.length > 256,
  }
}

function relevantGoals(goals, mode, query) {
  const valid = goals.filter((goal) => cleanText(goal?.title))
  const ranked = valid.map((goal, index) => {
    const explicitScope = goal.mode || goal.modeScope || goal.area || goal.category
    const exact = explicitScope === mode
    const global = !explicitScope || explicitScope === 'general'
    const termScore = queryScore(goal.title, `${query} ${(MODE_TERMS[mode] || []).join(' ')}`)
    let score = termScore + (exact ? 8 : 0) + (global ? 1 : 0)
    if (mode !== 'general' && explicitScope && explicitScope !== mode) score = -1
    return { goal, index, score }
  }).filter((item) => item.score >= 0 && (mode === 'general' || item.score > 1))
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.slice(0, 6).map(({ goal }) => ({
    title: cleanText(goal.title),
    progress: Number.isFinite(Number(goal.progress)) ? Number(goal.progress) : undefined,
    dueDate: cleanText(goal.dueDate, 32) || undefined,
    mode: goal.mode || goal.modeScope || goal.area || goal.category || undefined,
  }))
}

function relevantTasks(tasks, mode, query) {
  const open = tasks.filter((task) => !task.completed && cleanText(task.title))
  const ranked = open.map((task, index) => {
    const explicitScope = task.mode || task.modeScope || task.category
    const global = !explicitScope || explicitScope === 'general'
    const exact = explicitScope === mode
    const modeScore = queryScore(task.title, (MODE_TERMS[mode] || []).join(' '))
    const textScore = queryScore(task.title, query)
    let score = (exact ? 8 : 0) + (global ? 2 : 0) + modeScore + textScore
    if (mode !== 'general' && explicitScope && explicitScope !== 'general' && explicitScope !== mode) score = -1
    return { task, index, score }
  }).filter((item) => item.score >= 0 && (mode === 'general' || item.score > 0))
  ranked.sort((a, b) => b.score - a.score
    || (PRIORITY_ORDER[a.task.priority] ?? 4) - (PRIORITY_ORDER[b.task.priority] ?? 4)
    || a.index - b.index)
  return ranked.slice(0, 6).map(({ task }) => ({
    title: cleanText(task.title),
    priority: cleanText(task.priority, 24) || undefined,
    dueDate: cleanText(task.dueDate, 32) || undefined,
    category: cleanText(task.category, 32) || undefined,
    mode: task.mode || task.modeScope || undefined,
  }))
}

function selectRelevantNotes(notes, query) {
  return notes.map((note, index) => ({ note, index, score: queryScore(note.content, query) }))
    .filter(({ note, score }) => cleanText(note?.content) && (!tokens(query).size || score > 0))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 3)
    .map(({ note }) => cleanText(note.content))
}

function buildOverviewState() {
  const overview = {}
  const classes = asArray('classes')
  const openAssignments = asArray('assignments').filter((item) => !item.completed).length
  const openTests = asArray('tests').filter((item) => !item.completed).length
  if (classes.length || openAssignments || openTests) {
    overview.school = { classes: classes.length, openAssignments, openTests }
  }
  const sportsSessions = asArray('sports_sessions')
  if (sportsSessions.length) overview.sports = { sessionsLogged: sportsSessions.length }
  const gymSessions = asArray('gym_sessions')
  const gymRoutines = asArray('gym_routines')
  if (gymSessions.length || gymRoutines.length) overview.gym = { sessionsLogged: gymSessions.length, routinesSaved: gymRoutines.length }
  const healthEntriesToday = asArray('health').filter((item) => recordDate(item) === dateKey()).length
  if (healthEntriesToday) overview.health = { entriesToday: healthEntriesToday }
  const financeAccounts = asArray('finance_accounts')
  if (financeAccounts.length) overview.finance = { accountsTracked: financeAccounts.length }
  const activeSkills = asArray('skills').filter((item) => item.active !== false).length
  if (activeSkills) overview.skills = { activeSkills }
  const booksInProgress = asArray('reading_books').filter((item) => !['finished', 'dropped'].includes(item.status)).length
  if (booksInProgress) overview.reading = { booksInProgress }
  const activeHabits = asArray('mind_habits').filter((item) => item.active !== false).length
  if (activeHabits) overview.mind = { activeHabits }
  const familyMembers = asArray('family_members').length
  if (familyMembers) overview.family = { members: familyMembers }
  return overview
}

function buildModeSections(mode) {
  const recentProgress = []
  const currentState = {}
  let modeContext = null
  const addRecent = (label, records) => {
    if (records.length) recentProgress.push({ label, records })
  }

  if (mode === 'school') {
    const classes = asArray('classes').slice(0, 12).map((item) => cleanText(item.name)).filter(Boolean)
    const byDueDate = (a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    const assignments = asArray('assignments').filter((item) => !item.completed).sort(byDueDate)
    const tests = asArray('tests').filter((item) => !item.completed).sort(byDueDate)
    const schoolProgress = asObject('school_progress')
    modeContext = {}
    if (classes.length) modeContext.classes = classes
    if (assignments.length) modeContext.openAssignments = assignments.slice(0, 5).map((item) => ({ title: cleanText(item.title), dueDate: cleanText(item.dueDate, 32) || undefined }))
    if (tests.length) modeContext.openTests = tests.slice(0, 5).map((item) => ({ title: cleanText(item.title), dueDate: cleanText(item.dueDate, 32) || undefined }))
    if (Array.isArray(schoolProgress.unlockedTierKeys) && schoolProgress.unlockedTierKeys.length) currentState.unlockedSchoolTiers = schoolProgress.unlockedTierKeys.slice(0, 8)
    const completed = [...asArray('assignments'), ...asArray('tests')].filter((item) => item.completed && withinDays(item, 14))
    addRecent('Completed schoolwork in the last 14 days', completed.slice(-3).map((item) => cleanText(item.title)).filter(Boolean))
  } else if (mode === 'sports') {
    const sessions = asArray('sports_sessions')
    const recent = sessions.filter((item) => withinDays(item, 30))
    if (recent.length) modeContext = { recentSessions: recent.slice(-3).map((item) => ({
      date: recordDate(item) || undefined,
      type: cleanText(item.type, 40) || undefined,
      durationMinutes: Number.isFinite(Number(item.durationMinutes)) ? Number(item.durationMinutes) : undefined,
      result: cleanText(item.result, 24) || undefined,
    })) }
    if (recent.length) currentState.sessionsLast30Days = recent.length
    addRecent('Recent sports progress', sessions.filter((item) => withinDays(item, 14)).slice(-3).map((item) => ({ date: recordDate(item), type: cleanText(item.type, 40) })).filter((item) => item.date || item.type))
  } else if (mode === 'gym') {
    const exercises = asArray('gym_exercises').slice(0, 8).map((item) => cleanText(item.name)).filter(Boolean)
    const routines = asArray('gym_routines').slice(0, 5).map((item) => cleanText(item.name || item.title)).filter(Boolean)
    const sessions = asArray('gym_sessions')
    const logs = asArray('gym_logs')
    modeContext = {}
    if (exercises.length) modeContext.exercises = exercises
    if (routines.length) modeContext.routines = routines
    const recentSessions = sessions.filter((item) => withinDays(item, 30))
    if (recentSessions.length) modeContext.recentSessions = recentSessions.slice(-3).map((item) => ({ date: recordDate(item) || undefined, title: cleanText(item.title || item.name, 60) || undefined }))
    const recentLogs = logs.filter((item) => withinDays(item, 14))
    if (recentLogs.length) currentState.loggedSetsLast14Days = recentLogs.length
    addRecent('Recent gym sessions', sessions.filter((item) => withinDays(item, 14)).slice(-3).map((item) => ({ date: recordDate(item), title: cleanText(item.title || item.name, 60) })).filter((item) => item.date || item.title))
  } else if (mode === 'health') {
    const entries = asArray('health')
    const today = entries.filter((item) => recordDate(item) === dateKey())
    const goals = asObject('health_goals')
    modeContext = {}
    if (today.length) modeContext.todayEntries = today.slice(-6).map((item) => ({ category: cleanText(item.category, 32), value: cleanText(item.value, 90) })).filter((item) => item.category || item.value)
    const healthTargets = Object.fromEntries(['sleep', 'water', 'activity']
      .filter((key) => Number.isFinite(Number(goals[key])) && Number(goals[key]) > 0)
      .map((key) => [key, Number(goals[key])]))
    if (Object.keys(healthTargets).length) modeContext.healthTargets = healthTargets
    const recent = entries.filter((item) => withinDays(item, 7))
    if (recent.length) currentState.entriesLast7Days = recent.length
    addRecent('Health activity over the last 7 days', Object.entries(recent.reduce((counts, item) => {
      const category = cleanText(item.category, 32) || 'other'
      counts[category] = (counts[category] || 0) + 1
      return counts
    }, {})).map(([category, count]) => ({ category, count })))
  } else if (mode === 'finance') {
    const accounts = asArray('finance_accounts')
    const netWorth = accounts.reduce((total, account) => {
      const balance = Number(account.balance) || 0
      return total + (['credit', 'loan'].includes(account.type) ? -balance : balance)
    }, 0)
    if (accounts.length) {
      modeContext = { accountCount: accounts.length, netWorth }
      const transactions = asArray('finance_transactions').filter((item) => withinDays(item, 30))
      if (transactions.length) currentState.transactionsLast30Days = transactions.length
      addRecent('Recent financial activity', transactions.slice(-3).map((item) => ({ date: recordDate(item), type: cleanText(item.type, 24), category: cleanText(item.category, 32) })).filter((item) => item.date || item.type || item.category))
    }
  } else if (mode === 'skills') {
    const skills = asArray('skills').filter((skill) => skill.active !== false)
    const sessions = asArray('skill_sessions')
    if (skills.length) {
      const enriched = skills.slice(0, 5).map((skill) => enrichSkill(skill, sessions))
      const { quests } = computeQuests(enriched, sessions)
      modeContext = {
        activeSkills: enriched.map((skill) => ({
          name: cleanText(skill.name, 60),
          level: skill.level,
          tier: skill.tier,
          xpIntoLevel: skill.xpIntoLevel,
          xpForNextLevel: skill.xpForNextLevel,
          streak: skill.streak,
          todayQuantity: skill.todayQuantity,
          unit: cleanText(skill.unit, 24),
        })),
      }
      if (quests.length) modeContext.weeklyQuests = quests.slice(0, 4).map((quest) => ({ title: cleanText(quest.title, 60), progress: quest.progress, target: quest.target, completed: quest.completed }))
      const recent = sessions.filter((item) => withinDays(item, 14))
      if (recent.length) currentState.practiceSessionsLast14Days = recent.length
      addRecent('Recent skill practice', recent.slice(-3).map((item) => ({ date: recordDate(item), quantity: item.quantity })).filter((item) => item.date))
    }
  } else if (mode === 'reading') {
    const books = asArray('reading_books').filter((book) => !['finished', 'dropped'].includes(book.status)).slice(0, 5)
    const goal = asObject('reading_goals')
    const sessions = asArray('reading_sessions')
    modeContext = {}
    if (books.length) modeContext.booksInProgress = books.map((book) => ({ title: cleanText(book.title, 90), currentPage: book.currentPage, totalPages: book.totalPages || undefined }))
    if (Number.isFinite(Number(goal.dailyPageGoal)) && Number(goal.dailyPageGoal) > 0) modeContext.dailyPageGoal = Number(goal.dailyPageGoal)
    const recent = sessions.filter((item) => withinDays(item, 14))
    if (recent.length) currentState.pagesReadLast14Days = recent.reduce((total, item) => total + (Number(item.pagesRead) || 0), 0)
    addRecent('Recent reading sessions', recent.slice(-3).map((item) => ({ date: recordDate(item), pagesRead: Number(item.pagesRead) || 0 })).filter((item) => item.date))
  } else if (mode === 'mind') {
    const habits = asArray('mind_habits').filter((habit) => habit.active !== false).slice(0, 8)
    const completions = asArray('mind_completions')
    modeContext = {}
    if (habits.length) {
      const today = dateKey()
      const completedIds = new Set(completions.filter((item) => recordDate(item) === today).map((item) => item.habitId))
      modeContext.activeHabits = habits.map((habit) => ({ name: cleanText(habit.name, 60), completedToday: completedIds.has(habit.id) }))
    }
    const recent = completions.filter((item) => withinDays(item, 7))
    if (recent.length) currentState.habitCompletionsLast7Days = recent.length
    addRecent('Recent habit progress', recent.slice(-3).map((item) => ({ date: recordDate(item), habitId: item.habitId })).filter((item) => item.date))
  } else if (mode === 'family') {
    const members = asArray('family_members').slice(0, 8)
    const goals = asObject('family_goals')
    const logs = asArray('family_log')
    modeContext = {}
    if (members.length) modeContext.members = members.map((item) => ({ name: cleanText(item.name, 60), relationship: cleanText(item.relationship || item.role, 40) || undefined }))
    const weeklyMinutesGoal = Number(goals.weeklyMinutesGoal)
    if (Number.isFinite(weeklyMinutesGoal) && weeklyMinutesGoal > 0) modeContext.weeklyMinutesGoal = weeklyMinutesGoal
    const recent = logs.filter((item) => withinDays(item, 30))
    if (recent.length) currentState.familyEntriesLast30Days = recent.length
    addRecent('Recent family activity', recent.slice(-3).map((item) => ({ date: recordDate(item), type: cleanText(item.type || item.category, 32) })).filter((item) => item.date || item.type))
  }

  if (modeContext && Object.values(modeContext).every((value) => Array.isArray(value) ? value.length === 0 : !value || (typeof value === 'object' && Object.keys(value).length === 0))) modeContext = null
  return { modeContext, recentProgress: recentProgress.slice(0, 4), importantCurrentState: currentState }
}

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.values(value).every(isEmpty)
  return false
}

export function formatPersonalContext(context, maxChars = MAX_CONTEXT_CHARS) {
  const mode = context.identityContext?.activeMode
  const modeDerivedFields = mode === 'finance'
    ? 'accountCount and netWorth'
    : mode === 'skills'
      ? 'activeSkills level/tier/XP/streak/quantity fields and weeklyQuests'
      : ''
  const sections = [
    ['CURRENT APP CONTEXT — current structured record/settings', context.identityContext],
    ['CURRENT GOALS — current structured records', context.currentGoals],
    ['STORED MEMORY — durable user-provided context; may be historical', context.relevantMemories?.map((memory) => ({ content: cleanText(memory.content, 400), kind: memory.kind }))],
    ['CURRENT PRIORITIES — current structured records', context.currentPriorities],
    ['CURRENT PREFERENCES — current settings records', context.currentPreferences],
    [`RELEVANT MODE CONTEXT — current structured records${modeDerivedFields ? `; calculated/derived fields: ${modeDerivedFields}` : ''}`, context.relevantModeContext],
    ['CALCULATED / DERIVED DATA — summaries calculated from structured records', context.recentProgress],
    ['IMPORTANT CURRENT STATE — structured records and derived summaries; counts/totals are calculated', context.importantCurrentState],
    ['CURRENT STRUCTURED RECORDS — user notes', context.relevantNotes],
    ['FIXED SCHEDULE CONSTRAINTS — timed or all-day commitments; not availability', context.scheduleConstraints],
    ['DECLARED WORK AVAILABILITY — user-entered windows; not guaranteed free time', context.workAvailability && {
      status: context.workAvailabilityStatus,
      ...context.workAvailability,
    }],
    ['CALENDAR SOURCE STATUS — distinguishes an empty calendar from unavailable data', context.calendarStatus],
  ].filter(([, value]) => !isEmpty(value))
  const guidance = sections.length
    ? 'PROVENANCE RULES: Treat current structured records and settings as facts about the recorded state. Stored memories and notes are user-provided content and may be historical; do not treat them as current when newer structured data differs. Calculated/derived values are summaries computed from their listed source records, not separately recorded facts. Do not invent missing user facts. Any inference or recommendation you generate is AI-generated, not known user information; label inferences as tentative and phrase recommendations as suggestions.\n\n'
    : ''
  const text = guidance + sections.map(([label, value]) => `${label.toUpperCase()}\n${JSON.stringify(value)}`).join('\n\n')
  return text.slice(0, Math.max(0, maxChars))
}

export function getPersonalContext({ mode = 'general', conversationContext = '', preferences = {}, includeCommitments = false, calendarEvents = [], canvasAssignments = [], calendarStatus = { state: 'unknown' }, today, commitmentHorizonDays = 7 } = {}) {
  const activeMode = MODE_KEYS.has(mode) ? mode : 'general'
  const query = cleanText(conversationContext, 1200)
  const userName = cleanText(preferences.userName, 80)
  const schoolGradeLevel = activeMode === 'school' ? cleanText(preferences.schoolGradeLevel, 40) : ''
  const identityContext = { ...(userName ? { userName } : {}), ...(activeMode !== 'general' ? { activeMode } : {}) }
  const currentGoals = relevantGoals(asArray('goals'), activeMode, query)
  const relevantMemories = getMemoriesForMode(activeMode, query, { limit: 8, persistNormalization: false })
  const currentPriorities = relevantTasks(asArray('tasks'), activeMode, query)
  const currentPreferences = schoolGradeLevel ? { schoolGradeLevel } : {}
  const notes = selectRelevantNotes(asArray('notes'), query)
  const modeSections = activeMode === 'general'
    ? { modeContext: null, recentProgress: [], importantCurrentState: buildOverviewState() }
    : buildModeSections(activeMode)
  const result = {
    identityContext,
    currentGoals,
    relevantMemories,
    currentPriorities,
    currentPreferences,
    relevantModeContext: modeSections.modeContext,
    recentProgress: modeSections.recentProgress,
    importantCurrentState: modeSections.importantCurrentState,
    relevantNotes: notes,
  }
  if (includeCommitments) {
    const commitments = buildCurrentCommitments({
      ...(today ? { today } : {}),
      calendarEvents,
      canvasAssignments,
      horizonDays: commitmentHorizonDays,
    })
    Object.assign(result, commitments)
    result.workloadTruncated = commitments.workloadTruncated
    result.scheduleTruncated = commitments.scheduleTruncated
    let workAvailability
    let workAvailabilityStatus
    try {
      workAvailability = validateWorkAvailability(loadDataIfExists('work_availability', DEFAULT_WORK_AVAILABILITY))
      workAvailabilityStatus = workAvailability.weeklyWindows.length || workAvailability.dateOverrides.length ? 'configured' : 'not_configured'
    } catch {
      workAvailability = DEFAULT_WORK_AVAILABILITY
      workAvailabilityStatus = 'invalid'
    }
    result.workAvailability = workAvailability
    result.workAvailabilityStatus = workAvailabilityStatus
    result.calendarStatus = commitments.scheduleTruncated && calendarStatus.state === 'available'
      ? { ...calendarStatus, state: 'partial', reason: 'The bounded schedule context omitted some events.' }
      : calendarStatus
  }
  result.prompt = formatPersonalContext(result)
  return result
}
