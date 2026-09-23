// The two notification categories Dylan actually picked (AskUserQuestion,
// session 27's final round): daily streak/habit reminders, and task/
// assignment/test due-date reminders. Nothing else fires automatically --
// no "just build the infrastructure and guess at triggers" here, since he
// was direct about which two he wants.
import { loadData, saveData } from './dataStore.js'
import { broadcastPushNotification } from './webPush.js'
import { isConnected as isCanvasConnected, getUpcomingAssignments } from './canvas.js'

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  // False until Dylan's phone actually subscribes for the first time --
  // routes/notifications.js flips this on automatically the moment that
  // happens, since granting the browser's own permission prompt already
  // IS his opt-in gesture. Kept as an explicit field (not just "has any
  // subscriptions") so Settings has a real master switch to turn back off
  // without unsubscribing the device entirely.
  enabled: false,
  streakReminders: true,
  dueDateReminders: true,
  // Morning "here's your list" and evening "here's what's still open"
  // nudges -- both about Tasks specifically (session 29's direct ask:
  // "a morning and nightly reminder to do all my tasks"), separate from
  // the streak/habit check above.
  morningSummary: true,
  nightlyTaskReminder: true,
  // 24-hour local hour for the morning task summary.
  morningHour: 8,
  // 24-hour local hour to run the evening streak/habit check AND the
  // nightly task reminder -- picked once, checked on every scheduler
  // tick, not user-editable via a raw cron string (no reason to expose
  // that complexity for one number).
  reminderHour: 20,
  // How many days before something's due to start reminding -- 1 means
  // "the day before," matching Dylan's own framing when picking this
  // option ("a heads-up before something is due, not a same-day
  // surprise").
  dueDateLeadDays: 1,
  // Mind mode's morning check-in / night review nudges -- separate from
  // the generic streak reminder above, since these point at the Review
  // tab specifically, not habit completions.
  morningMindCheckIn: true,
  nightMindReview: true,
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Same local-time convention as every other date field in this app
// (see lib/studyPlan.js's todayKey, and the UTC-vs-local bug fixed
// earlier this session in routes/skills.js/mind.js) -- never
// toISOString().slice(0, 10).
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Bare-date day-difference, UTC-anchored on purpose: only the delta
// between two identically-anchored dates matters here, not either date's
// absolute displayed value, so this is timezone-safe the same way
// skills.js's computeMaxStreak() already established.
function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

// Mirrors HealthPage.jsx's entryDateKey() exactly -- an entry logged
// before this feature's `date` field existed falls back to its
// createdAt's LOCAL day, never a UTC slice.
function entryDateKey(entry) {
  if (entry.date) return entry.date
  const d = new Date(entry.createdAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadPreferences() {
  return loadData('notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES)
}

function loadState() {
  return loadData('notification_state', {
    dueDateRemindersSent: {},
    lastStreakReminderDate: null,
    lastMorningSummaryDate: null,
    lastNightlyTaskReminderDate: null,
    lastMorningMindCheckInDate: null,
    lastNightMindReviewDate: null,
  })
}

// Shared by both task-list notifications below: first 3 open task titles,
// "+N more" if there are more than that -- a push notification body has
// to stay short, it's not the place to dump an entire list.
function summarizeTasks(tasks) {
  const shown = tasks.slice(0, 3).map((t) => t.title)
  const extra = tasks.length - shown.length
  return extra > 0 ? `${shown.join(', ')}, +${extra} more` : shown.join(', ')
}

// Scans tasks, assignments, and tests for anything not yet done whose
// due date is within `dueDateLeadDays`. Each item gets reminded ONCE ever
// (tracked by a stable id in notification_state.json), not once per day
// it stays in the window -- otherwise a task due in 3 days with a
// lead time of 3 would page Dylan every 15 minutes for 3 straight days.
// Already-past-due items are deliberately skipped, not reminded forever --
// a missed deadline notification every 15 minutes forever would be noise,
// not help; Dylan already sees overdue items in School/Tasks/Calendar.
export async function checkDueDateReminders() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.dueDateReminders) return { sent: 0, skipped: 'disabled' }

  const state = loadState()
  const today = todayKey()
  const leadDays = Number.isInteger(prefs.dueDateLeadDays) ? prefs.dueDateLeadDays : 1

  const candidates = []

  for (const task of loadData('tasks')) {
    if (task.completed) continue
    if (!DATE_PATTERN.test(task.dueDate || '')) continue // e.g. Dylan's real "tomorrow night" task -- not a real date, can't be scheduled against
    candidates.push({ id: `task-${task.id}`, kind: 'Task', title: task.title, date: task.dueDate })
  }
  for (const assignment of loadData('assignments')) {
    if (assignment.completed) continue
    if (!DATE_PATTERN.test(assignment.dueDate || '')) continue
    candidates.push({ id: `assignment-${assignment.id}`, kind: 'Assignment', title: assignment.title, date: assignment.dueDate })
  }
  for (const test of loadData('tests')) {
    if (test.completed) continue
    if (!DATE_PATTERN.test(test.date || '')) continue
    candidates.push({ id: `test-${test.id}`, kind: 'Test', title: test.title, date: test.date })
  }

  // Canvas assignments live in Canvas itself, not in the local
  // `assignments` store above, so they were invisible to this reminder
  // check even after they started showing up in School and on the
  // calendar. Best-effort: a Canvas API hiccup here should never break
  // the local due-date reminders that follow, so failures are swallowed
  // the same way autoSyncToCalendar's do in useCanvas.js.
  if (isCanvasConnected()) {
    try {
      const canvasAssignments = await getUpcomingAssignments()
      for (const item of canvasAssignments) {
        if (item.submitted || !item.dueAt) continue
        const date = item.dueAt.slice(0, 10)
        if (!DATE_PATTERN.test(date)) continue
        candidates.push({ id: item.id, kind: 'Canvas', title: `${item.title} (${item.courseName})`, date })
      }
    } catch (error) {
      console.error('Canvas due-date check failed:', error)
    }
  }

  let sent = 0
  let stateChanged = false
  for (const item of candidates) {
    if (state.dueDateRemindersSent[item.id]) continue
    const diff = daysBetween(today, item.date)
    if (diff < 0 || diff > leadDays) continue

    const dueText = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff} days`
    const result = await broadcastPushNotification({
      title: `${item.kind} due ${dueText}`,
      body: item.title,
      tag: item.id, // lets the OS replace/group rather than stack duplicates if this ever double-fires
    })
    state.dueDateRemindersSent[item.id] = today
    stateChanged = true
    if (result.sent > 0) sent += 1
  }

  if (stateChanged) saveData('notification_state', state)
  return { sent, checked: candidates.length }
}

// Once per day, after `reminderHour` local time, checks whether Mind
// habits and/or today's Health log are still outstanding and sends ONE
// combined reminder if so -- never one notification per missed habit,
// which would be spam, not help. Nothing fires a second time the same day
// even if this scheduler tick runs again, and nothing fires at all if
// everything's already done by the time this checks.
export async function checkStreakReminders() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.streakReminders) return { sent: 0, skipped: 'disabled' }

  const state = loadState()
  const today = todayKey()
  if (state.lastStreakReminderDate === today) return { sent: 0, skipped: 'already checked today' }

  const reminderHour = Number.isInteger(prefs.reminderHour) ? prefs.reminderHour : 20
  if (new Date().getHours() < reminderHour) return { sent: 0, skipped: 'too early' }

  const outstanding = []

  const habits = loadData('mind_habits').filter((h) => h.active !== false)
  if (habits.length > 0) {
    const completions = loadData('mind_completions')
    const doneToday = new Set(completions.filter((c) => c.date === today).map((c) => c.habitId))
    const undone = habits.filter((h) => !doneToday.has(h.id)).length
    if (undone > 0) {
      outstanding.push(undone === habits.length ? 'no habits logged yet' : `${undone} habit${undone === 1 ? '' : 's'} left`)
    }
  }

  const healthEntries = loadData('health')
  const loggedHealthToday = healthEntries.some((entry) => entryDateKey(entry) === today)
  if (!loggedHealthToday) outstanding.push('nothing logged in Health')

  let sent = 0
  if (outstanding.length > 0) {
    const result = await broadcastPushNotification({
      title: 'Still open today',
      body: outstanding.join(' · '),
      tag: 'streak-reminder',
    })
    if (result.sent > 0) sent = 1
  }

  // Mark today as checked either way -- including the "nothing was
  // outstanding" case -- so a fully-done day correctly stays silent for
  // the rest of the evening instead of being re-evaluated (harmlessly,
  // but pointlessly) on every later tick.
  state.lastStreakReminderDate = today
  saveData('notification_state', state)

  return { sent, outstanding }
}

// Once per day, after `morningHour` local time, a "here's your list"
// nudge naming what's still open in Tasks -- ALL open tasks, not just
// ones due today, matching Dylan's own framing ("a reminder to do all my
// tasks"). Stays silent if the list is already empty; still marks the
// day checked either way so a fully-clear morning doesn't get
// re-evaluated on every later tick.
export async function checkMorningTaskSummary() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.morningSummary) return { sent: 0, skipped: 'disabled' }

  const state = loadState()
  const today = todayKey()
  if (state.lastMorningSummaryDate === today) return { sent: 0, skipped: 'already checked today' }

  const morningHour = Number.isInteger(prefs.morningHour) ? prefs.morningHour : 8
  if (new Date().getHours() < morningHour) return { sent: 0, skipped: 'too early' }

  const openTasks = loadData('tasks').filter((task) => !task.completed)

  let sent = 0
  if (openTasks.length > 0) {
    const result = await broadcastPushNotification({
      title: `${openTasks.length} task${openTasks.length === 1 ? '' : 's'} on your list today`,
      body: summarizeTasks(openTasks),
      tag: 'morning-task-summary',
    })
    if (result.sent > 0) sent = 1
  }

  state.lastMorningSummaryDate = today
  saveData('notification_state', state)
  return { sent, openCount: openTasks.length }
}

// Same idea, evening side: after `reminderHour`, a "here's what's still
// open" nudge -- but ONLY if something's actually still open, unlike the
// morning one. A nightly notification announcing "0 tasks open, great
// job" every single day would train Dylan to ignore this notification
// category entirely; silence on a fully-done day is the right behavior
// here specifically because this one's whole point is "you still have
// work to do."
export async function checkNightlyTaskReminder() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.nightlyTaskReminder) return { sent: 0, skipped: 'disabled' }

  const state = loadState()
  const today = todayKey()
  if (state.lastNightlyTaskReminderDate === today) return { sent: 0, skipped: 'already checked today' }

  const reminderHour = Number.isInteger(prefs.reminderHour) ? prefs.reminderHour : 20
  if (new Date().getHours() < reminderHour) return { sent: 0, skipped: 'too early' }

  const openTasks = loadData('tasks').filter((task) => !task.completed)

  let sent = 0
  if (openTasks.length > 0) {
    const result = await broadcastPushNotification({
      title: `${openTasks.length} task${openTasks.length === 1 ? '' : 's'} still open`,
      body: summarizeTasks(openTasks),
      tag: 'nightly-task-reminder',
    })
    if (result.sent > 0) sent = 1
  }

  state.lastNightlyTaskReminderDate = today
  saveData('notification_state', state)
  return { sent, openCount: openTasks.length }
}


// Nudges Dylan toward Mind's morning check-in if he hasn't done one yet
// today -- mirrors checkMorningTaskSummary's shape exactly (same
// morningHour gate, same "already checked today" short-circuit) but reads
// mind_reviews instead of tasks.
export async function checkMorningMindCheckIn() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.morningMindCheckIn) return { sent: 0, skipped: 'disabled' }
  const state = loadState()
  const today = todayKey()
  if (state.lastMorningMindCheckInDate === today) return { sent: 0, skipped: 'already checked today' }
  const morningHour = Number.isInteger(prefs.morningHour) ? prefs.morningHour : 8
  if (new Date().getHours() < morningHour) return { sent: 0, skipped: 'too early' }

  const reviews = loadData('mind_reviews')
  const doneToday = reviews.some((r) => r.type === 'morning' && r.date === today)
  let sent = 0
  if (!doneToday) {
    const result = await broadcastPushNotification({
      title: 'Morning Check-In',
      body: "Set today's intention in Mind before the day gets away from you.",
      tag: 'morning-mind-checkin',
    })
    if (result.sent > 0) sent = 1
  }
  state.lastMorningMindCheckInDate = today
  saveData('notification_state', state)
  return { sent, doneToday }
}

// Same pattern as checkNightlyTaskReminder, reusing reminderHour (the one
// evening-check hour Dylan already picked) rather than adding a second
// user-editable hour just for this -- reads mind_reviews' 'night' entries.
export async function checkNightMindReview() {
  const prefs = loadPreferences()
  if (!prefs.enabled || !prefs.nightMindReview) return { sent: 0, skipped: 'disabled' }
  const state = loadState()
  const today = todayKey()
  if (state.lastNightMindReviewDate === today) return { sent: 0, skipped: 'already checked today' }
  const reminderHour = Number.isInteger(prefs.reminderHour) ? prefs.reminderHour : 20
  if (new Date().getHours() < reminderHour) return { sent: 0, skipped: 'too early' }

  const reviews = loadData('mind_reviews')
  const doneToday = reviews.some((r) => r.type === 'night' && r.date === today)
  let sent = 0
  if (!doneToday) {
    const result = await broadcastPushNotification({
      title: 'Night Review',
      body: 'Take two minutes in Mind to reflect on today before you close out.',
      tag: 'night-mind-review',
    })
    if (result.sent > 0) sent = 1
  }
  state.lastNightMindReviewDate = today
  saveData('notification_state', state)
  return { sent, doneToday }
}
