import { loadData, saveData } from './dataStore.js'

const CONTENT_REQUEST_PATTERNS = [
  /\b(business plan|essay|proposal|outline|blog post|article|speech|pitch|cover letter|study guide|meal plan|workout plan|itinerary|summary of|pros and cons|marketing plan|content plan)\b/i,
  /^(write|draft|compose|create|come up with|help me write|help me draft)\b.*\b(a|an|the)\b/i,
  /^(explain|describe|walk me through|help me understand)\b/i,
  /^(brainstorm|give me ideas|help me think through|help me plan out)\b/i,
]

// Deliberately separate from detectCommand: this doesn't identify a specific
// action, it identifies "Dylan wants written content back," so the chat route
// can skip the JSON-action prompt entirely for these and avoid the local
// model hallucinating a chain of fake task-completion turns instead of just
// writing the thing.
export function looksLikeContentRequest(message) {
  const text = message?.trim() || ''
  if (!text) return false
  return CONTENT_REQUEST_PATTERNS.some((pattern) => pattern.test(text))
}

// Shared by the Sports/Gym/Discipline/Finance/Family/Reading/School chat
// actions below -- same local YYYY-MM-DD convention used throughout this
// file (log_health and log_skill_practice each inline their own copy
// above; this one's shared across seven new cases instead of inlined
// seven more times).
function todayKeyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Case-insensitive, either-direction substring match -- same rule
// log_skill_practice already uses to resolve a casual skill name against
// the real list. Returns null (never creates) for entities that carry
// their own setup Dylan should choose deliberately: a Gym exercise, a
// Discipline habit, a Finance account, a Family member.
function fuzzyMatchByName(items, nameField, query) {
  const search = (query || '').toLowerCase().trim()
  if (!search) return null
  return items.find((item) => {
    const name = (item[nameField] || '').toLowerCase()
    return name && (name.includes(search) || search.includes(name))
  })
}

// Duplicated from routes/finance.js on purpose -- same "small pure helper,
// one copy per file" convention already established in this codebase
// (see StatsOverlay.jsx's own epley1RM/longestStreakFromDateKeys).
const EXPENSE_CATEGORIES = [
  'groceries', 'dining', 'transport', 'housing', 'utilities',
  'entertainment', 'shopping', 'health', 'subscriptions', 'other',
]
const DEBT_TYPES = ['credit', 'loan']
function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function detectCommand(message) {
  const text = message?.trim() || ''
  const lower = text.toLowerCase()

  if (!text) return null

  const completeMatch = text.match(/^(?:complete|finish|done with)\s+(.+)$/i)
  if (completeMatch?.[1]?.trim()) {
    return { type: 'complete_task', title: completeMatch[1].trim() }
  }

  const markCompleteMatch = text.match(
    /^mark\s+(.+?)\s+(?:as\s+)?(?:complete|completed|done)$/i
  )
  if (markCompleteMatch?.[1]?.trim()) {
    return { type: 'complete_task', title: markCompleteMatch[1].trim() }
  }

  const goalMatch = text.match(
    /^(?:create|add|make|set)\s+(?:a\s+)?goal\s+(?:to\s+)?(.+)$/i
  )
  if (goalMatch?.[1]?.trim()) {
    return { type: 'create_goal', title: goalMatch[1].trim(), progress: 0 }
  }

  const progressMatch = text.match(
    /^(?:make|set|update)\s+(?:my\s+)?(.+?)\s+goal\s+(?:to\s+)?(\d+)\s*(?:%|percent)?$/i
  )
  if (progressMatch) {
    return {
      type: 'update_goal',
      title: progressMatch[1].trim(),
      progress: Number(progressMatch[2]),
    }
  }

  const noteMatch = text.match(
    /^(?:save|add|write|create)\s+(?:a\s+)?note\s+(?:that\s+)?(.+)$/i
  )
  if (noteMatch?.[1]?.trim()) {
    return { type: 'create_note', content: noteMatch[1].trim() }
  }

  const deleteTaskMatch = text.match(
    /^(?:delete|remove)\s+(?:the\s+)?task\s+(.+)$/i
  )
  if (deleteTaskMatch?.[1]?.trim()) {
    return { type: 'delete_task', title: deleteTaskMatch[1].trim() }
  }

  const forgetMatch = text.match(/^(?:forget|remove)\s+(?:that\s+)?(.+)$/i)
  if (forgetMatch?.[1]?.trim()) {
    return { type: 'forget_memory', content: forgetMatch[1].trim() }
  }

  const memoryMatch = text.match(/^remember\s+(?:that\s+)?(.+)$/i)
  if (memoryMatch?.[1]?.trim()) {
    return { type: 'save_memory', content: memoryMatch[1].trim() }
  }

  const taskPatterns = [
    /^(?:add)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:create)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    /^(?:add)\s+(.+?)\s+to\s+(?:my\s+)?tasks?$/i,
    /^(?:create)\s+(.+?)\s+as\s+(?:a\s+)?task$/i,
  ]

  for (const pattern of taskPatterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) {
      return { type: 'create_task', title: match[1].trim(), priority: 'medium' }
    }
  }

  return null
}

export function executeAction(action) {
  if (!action || !action.type) {
    return { performed: false, message: '' }
  }

  if (action.type === 'create_task') {
    const tasks = loadData('tasks')
    const task = {
      id: Date.now().toString(),
      title: action.title || 'New task',
      priority: action.priority || 'medium',
      dueDate: action.dueDate || '',
      reminder: action.reminder || 'none',
      category: action.category || 'general',
      completed: false,
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    saveData('tasks', tasks)
    return { performed: true, message: `Added task: ${task.title}` }
  }

  if (action.type === 'complete_task') {
    const tasks = loadData('tasks')
    const search = (action.title || '').toLowerCase().trim()
    const task = tasks.find(
      (item) =>
        !item.completed &&
        (item.title.toLowerCase().includes(search) ||
          search.includes(item.title.toLowerCase()))
    )
    if (!task) {
      return { performed: false, message: 'I could not find that open task.' }
    }
    task.completed = true
    saveData('tasks', tasks)
    return { performed: true, message: `Completed task: ${task.title}` }
  }

  if (action.type === 'delete_task') {
    const tasks = loadData('tasks')
    const search = (action.title || '').toLowerCase().trim()
    const index = tasks.findIndex((item) => item.title.toLowerCase().includes(search))
    if (index === -1) {
      return { performed: false, message: 'I could not find that task.' }
    }
    const removed = tasks[index]
    tasks.splice(index, 1)
    saveData('tasks', tasks)
    return { performed: true, message: `Deleted task: ${removed.title}` }
  }

  if (action.type === 'create_goal') {
    const goals = loadData('goals')
    const goal = {
      id: Date.now().toString(),
      title: action.title || 'New goal',
      progress: Number(action.progress) || 0,
      createdAt: new Date().toISOString(),
    }
    goals.push(goal)
    saveData('goals', goals)
    return { performed: true, message: `Created goal: ${goal.title}` }
  }

  if (action.type === 'update_goal') {
    const goals = loadData('goals')
    const search = (action.title || '').toLowerCase().trim()
    const goal = goals.find((item) => item.title.toLowerCase().includes(search))
    if (!goal) {
      return { performed: false, message: 'I could not find that goal.' }
    }
    if (action.progress !== undefined) {
      goal.progress = Math.max(0, Math.min(100, Number(action.progress)))
    }
    saveData('goals', goals)
    return { performed: true, message: `Updated goal: ${goal.title} to ${goal.progress}%` }
  }

  if (action.type === 'create_note') {
    const notes = loadData('notes')
    const content = (action.content || '').trim()
    if (!content) {
      return { performed: false, message: 'The note was empty.' }
    }
    const note = {
      id: Date.now().toString(),
      content,
      createdAt: new Date().toISOString(),
    }
    notes.push(note)
    saveData('notes', notes)
    return { performed: true, message: 'Saved the note.' }
  }

  if (action.type === 'save_memory') {
    const memories = loadData('memories')
    const content = (action.content || '').trim()
    if (!content) {
      return { performed: false, message: 'The memory was empty.' }
    }
    const exists = memories.some(
      (memory) => memory.content.toLowerCase() === content.toLowerCase()
    )
    if (exists) {
      return { performed: true, message: 'I already remembered that.' }
    }
    memories.push({
      id: Date.now().toString(),
      content,
      createdAt: new Date().toISOString(),
    })
    saveData('memories', memories)
    return { performed: true, message: `I'll remember that: ${content}` }
  }

  if (action.type === 'log_health') {
    const CATEGORIES = ['sleep', 'food', 'water', 'activity']
    const NUMERIC_CATEGORIES = ['sleep', 'water', 'activity']
    const category = (action.category || '').toLowerCase().trim()
    const value = (action.value || '').toString().trim()

    if (!CATEGORIES.includes(category)) {
      return { performed: false, message: '' }
    }
    if (!value) {
      return { performed: false, message: '' }
    }

    const entries = loadData('health')
    const entry = {
      id: Date.now().toString(),
      category,
      value,
      note: (action.note || '').trim(),
      // Bare local date, same convention -- and same fallback if it's ever
      // missing -- as routes/health.js's POST handler, so a chat-logged
      // entry lands in HealthPage's Week grid on the correct day.
      date: (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })(),
      createdAt: new Date().toISOString(),
    }

    // Same "only store a real positive number, otherwise leave it off
    // entirely" rule as routes/health.js -- a plain-text food entry never
    // gets one, and every existing consumer already treats a missing
    // amount as "not counted" rather than crashing on it.
    if (NUMERIC_CATEGORIES.includes(category)) {
      const numericAmount = parseFloat(value)
      if (Number.isFinite(numericAmount) && numericAmount > 0) {
        entry.amount = numericAmount
      }
    }

    entries.push(entry)
    saveData('health', entries)

    const label = entry.note ? `${value} (${entry.note})` : value
    return { performed: true, message: `Logged: ${label} under ${category}.` }
  }

  if (action.type === 'log_skill_practice') {
    const skills = loadData('skills')
    const active = skills.filter((skill) => skill.active)
    if (!active.length) {
      return { performed: false, message: '' }
    }

    const quantity = Number(action.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { performed: false, message: '' }
    }

    // Match by name when the model gave one (case-insensitive, either
    // direction so "guitar" matches a skill named "Guitar practice").
    // With only one active skill, default to it even with no name match —
    // there's nothing else it could mean.
    const requestedName = (action.skillName || '').toLowerCase().trim()
    let skill = requestedName
      ? active.find(
          (item) =>
            item.name.toLowerCase().includes(requestedName) ||
            requestedName.includes(item.name.toLowerCase())
        )
      : null

    if (!skill && active.length === 1) {
      skill = active[0]
    }

    if (!skill) {
      return {
        performed: false,
        message: `Which skill? You're tracking: ${active.map((item) => item.name).join(', ')}.`,
      }
    }

    const sessions = loadData('skill_sessions')
    // Local YYYY-MM-DD -- not toISOString().slice(0, 10), which reads off
    // UTC and can tag an evening practice session as tomorrow's date. Same
    // bug, same fix as routes/skills.js's todayKey() (see that file for
    // the full writeup); duplicated here rather than imported since this
    // handler builds its own "today" independently.
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    sessions.push({
      id: Date.now().toString(),
      skillId: skill.id,
      quantity,
      note: (action.note || '').trim(),
      date: today,
      createdAt: new Date().toISOString(),
    })
    saveData('skill_sessions', sessions)

    // +10 base XP per logged session, same BASE_SESSION_XP constant
    // routes/skills.js's POST /sessions awards -- kept in sync by hand per
    // this codebase's "duplicate small pure helpers per file" convention,
    // not imported, but the number itself must match or XP earned via chat
    // vs. the manual form would silently diverge.
    skill.xp = (skill.xp || 0) + quantity + 10
    saveData('skills', skills)

    return { performed: true, message: `Logged ${quantity} ${skill.unit || 'reps'} of ${skill.name}.` }
  }

  // ---- Sports / Gym / Discipline / Finance / Family / Reading / School ----
  // Same "just text it" pattern as log_health/log_skill_practice above,
  // extended to the remaining 7 modes -- Dylan's own example ("for sports
  // i track things but i want to just text it") was Sports specifically;
  // he confirmed he wants the same capability across all seven, not just
  // Sports alone.
  //
  // Design rule applied consistently across all seven: an entity that
  // carries its own setup/config (a Gym exercise, a Discipline habit, a
  // Finance account, a Family member) must already exist and is matched
  // by name -- same as log_skill_practice above never auto-creates a
  // skill. A plain record with nothing to configure (a Reading book:
  // title/author/page-count) is auto-created on first mention, same as
  // create_task/create_goal/create_note never requiring the thing they
  // reference to pre-exist.
  //
  // None of these call syncCalendarEvent the way their route counterparts
  // do (routes/sports.js, routes/assignments.js) -- executeAction bypasses
  // the route layer entirely, the same pre-existing architectural gap
  // already true of every action above it in this file. A chat-logged
  // sports session or completed assignment shows up in its own tab
  // immediately; it just won't also write to Apple Calendar the way
  // logging it through the UI does.

  if (action.type === 'log_sports_session') {
    const sessionType = (action.sessionType || '').toLowerCase().trim()
    if (sessionType !== 'practice' && sessionType !== 'game') {
      return { performed: false, message: '' }
    }

    const cleanTeamScore =
      action.teamScore === undefined || action.teamScore === null || action.teamScore === ''
        ? null
        : Number(action.teamScore)
    const cleanOpponentScore =
      action.opponentScore === undefined || action.opponentScore === null || action.opponentScore === ''
        ? null
        : Number(action.opponentScore)

    // Same derive-result-from-scores rule as routes/sports.js's POST
    // handler -- a fact from the numbers, not a separately-guessed label.
    let resolvedResult = action.result || ''
    if (
      cleanTeamScore !== null &&
      cleanOpponentScore !== null &&
      !Number.isNaN(cleanTeamScore) &&
      !Number.isNaN(cleanOpponentScore)
    ) {
      resolvedResult = cleanTeamScore > cleanOpponentScore ? 'win' : cleanTeamScore < cleanOpponentScore ? 'loss' : 'tie'
    }

    const sessions = loadData('sports_sessions')
    const session = {
      id: Date.now().toString(),
      date: action.date || todayKeyLocal(),
      type: sessionType,
      durationMinutes: Number(action.durationMinutes) || 0,
      intensity: sessionType === 'practice' ? (action.intensity || '') : '',
      opponent: sessionType === 'game' ? (action.opponent || '').trim() : '',
      teamScore: sessionType === 'game' ? cleanTeamScore : null,
      opponentScore: sessionType === 'game' ? cleanOpponentScore : null,
      result: sessionType === 'game' ? resolvedResult : '',
      notes: (action.notes || '').trim(),
      createdAt: new Date().toISOString(),
    }
    sessions.push(session)
    saveData('sports_sessions', sessions)

    const label =
      sessionType === 'game'
        ? `Logged game${session.opponent ? ` vs ${session.opponent}` : ''}${resolvedResult ? ` (${resolvedResult})` : ''}.`
        : `Logged practice${session.durationMinutes ? ` (${session.durationMinutes} min)` : ''}.`
    return { performed: true, message: label }
  }

  if (action.type === 'log_gym_set') {
    const exercises = loadData('gym_exercises')
    if (!exercises.length) {
      return { performed: false, message: 'You have no exercises set up yet -- add one in the Gym tab first.' }
    }
    const exercise = fuzzyMatchByName(exercises, 'name', action.exerciseName)
    if (!exercise) {
      return {
        performed: false,
        message: `Which exercise? You're tracking: ${exercises.map((e) => e.name).join(', ')}.`,
      }
    }

    // Accept either a single {weight, reps} pair or a full sets array --
    // "log bench 225 for 5" is the common case, but multiple work sets in
    // one message should log in one shot too.
    let cleanSets
    if (Array.isArray(action.sets) && action.sets.length) {
      cleanSets = action.sets.map((s) => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 }))
    } else {
      const weight = Number(action.weight) || 0
      const reps = Number(action.reps) || 0
      if (!weight && !reps) {
        return { performed: false, message: '' }
      }
      cleanSets = [{ weight, reps }]
    }

    // Same PR check as useAppData.js's addGymLog -- max raw weight AND
    // estimated 1RM (Epley formula), against every prior log for this
    // exercise. Duplicated rather than shared across the frontend/backend
    // boundary, same as every other small pure helper in this codebase.
    const logs = loadData('gym_logs')
    const priorLogs = logs.filter((log) => log.exerciseId === exercise.id)
    let priorBestWeight = 0
    let priorBest1RM = 0
    priorLogs.forEach((log) => {
      ;(log.sets || []).forEach((set) => {
        const w = Number(set.weight) || 0
        const r = Number(set.reps) || 0
        priorBestWeight = Math.max(priorBestWeight, w)
        priorBest1RM = Math.max(priorBest1RM, w * (1 + r / 30))
      })
    })
    let newBestWeight = 0
    let newBest1RM = 0
    cleanSets.forEach((set) => {
      newBestWeight = Math.max(newBestWeight, set.weight)
      newBest1RM = Math.max(newBest1RM, set.weight * (1 + set.reps / 30))
    })
    const isPR = priorLogs.length > 0 && (newBestWeight > priorBestWeight || newBest1RM > priorBest1RM)

    logs.push({
      id: Date.now().toString(),
      exerciseId: exercise.id,
      date: action.date || todayKeyLocal(),
      sets: cleanSets,
      createdAt: new Date().toISOString(),
    })
    saveData('gym_logs', logs)

    const summary = cleanSets.map((s) => `${s.weight}x${s.reps}`).join(', ')
    return {
      performed: true,
      message: isPR ? `New PR on ${exercise.name}: ${summary}!` : `Logged ${exercise.name}: ${summary}.`,
    }
  }

  if (action.type === 'complete_habit') {
    const habits = loadData('discipline_habits').filter((h) => h.active !== false)
    if (!habits.length) {
      return { performed: false, message: 'You have no habits set up yet -- add one in the Discipline tab first.' }
    }
    const habit = fuzzyMatchByName(habits, 'name', action.habitName)
    if (!habit) {
      return {
        performed: false,
        message: `Which habit? You're tracking: ${habits.map((h) => h.name).join(', ')}.`,
      }
    }

    const date = action.date || todayKeyLocal()
    const completions = loadData('discipline_completions')
    const already = completions.some((c) => c.habitId === habit.id && c.date === date)
    if (already) {
      return {
        performed: true,
        message: `${habit.name} is already marked done${date === todayKeyLocal() ? ' today' : ` on ${date}`}.`,
      }
    }

    completions.push({ id: Date.now().toString(), habitId: habit.id, date, createdAt: new Date().toISOString() })
    saveData('discipline_completions', completions)
    return {
      performed: true,
      message: `Marked ${habit.name} done${date === todayKeyLocal() ? ' for today' : ` on ${date}`}.`,
    }
  }

  if (action.type === 'log_transaction') {
    const accounts = loadData('finance_accounts')
    if (!accounts.length) {
      return { performed: false, message: 'You have no accounts set up yet -- add one in the Finance tab first.' }
    }
    const account = fuzzyMatchByName(accounts, 'name', action.accountName)
    if (!account) {
      return {
        performed: false,
        message: `Which account? You have: ${accounts.map((a) => a.name).join(', ')}.`,
      }
    }

    const txType = (action.transactionType || '').toLowerCase().trim()
    if (txType !== 'income' && txType !== 'expense') {
      return { performed: false, message: '' }
    }
    const numericAmount = Number(action.amount)
    if (!numericAmount || numericAmount <= 0) {
      return { performed: false, message: '' }
    }
    const category = (action.category || '').toLowerCase().trim()
    if (txType === 'expense' && !EXPENSE_CATEGORIES.includes(category)) {
      return {
        performed: false,
        message: `What category? Pick one of: ${EXPENSE_CATEGORIES.join(', ')}.`,
      }
    }

    // Same debt-account-aware balance direction as routes/finance.js's
    // POST /transactions -- a credit card "expense" increases what's owed.
    const isDebtAccount = DEBT_TYPES.includes(account.type)
    const direction = txType === 'expense' ? -1 : 1
    const signedDelta = isDebtAccount ? -direction * numericAmount : direction * numericAmount
    account.balance = round2((Number(account.balance) || 0) + signedDelta)
    account.updatedAt = new Date().toISOString()
    saveData('finance_accounts', accounts)

    const transactions = loadData('finance_transactions')
    transactions.push({
      id: Date.now().toString(),
      accountId: account.id,
      type: txType,
      category: txType === 'expense' ? category : 'income',
      amount: numericAmount,
      date: action.date || todayKeyLocal(),
      note: (action.note || '').trim(),
      createdAt: new Date().toISOString(),
    })
    saveData('finance_transactions', transactions)

    // Keep the net-worth history snapshot in sync too, same as the route
    // does after every transaction -- otherwise a chat-logged transaction
    // would silently miss today's point on the net-worth chart, and
    // useAppData.js's swing-celebration check reads off this same history.
    const history = loadData('finance_history')
    const today = new Date().toISOString().slice(0, 10)
    const netWorth = round2(
      accounts.reduce((total, a) => {
        const balance = Number(a.balance) || 0
        return DEBT_TYPES.includes(a.type) ? total - balance : total + balance
      }, 0)
    )
    const existingIndex = history.findIndex((point) => point.date === today)
    if (existingIndex >= 0) {
      history[existingIndex] = { date: today, netWorth }
    } else {
      history.push({ date: today, netWorth })
    }
    saveData('finance_history', history)

    return {
      performed: true,
      message: `Logged ${txType === 'expense' ? '-' : '+'}$${numericAmount.toFixed(2)} (${category || 'income'}) on ${account.name}.`,
    }
  }

  if (action.type === 'log_family_entry') {
    const entryType = (action.entryType || '').toLowerCase().trim()
    if (entryType !== 'checkin' && entryType !== 'faith') {
      return { performed: false, message: '' }
    }

    let memberId = null
    let memberName = ''
    if (entryType === 'checkin') {
      const members = loadData('family_members')
      if (!members.length) {
        return { performed: false, message: 'You have no family members added yet -- add one in the Family tab first.' }
      }
      const member = fuzzyMatchByName(members, 'name', action.memberName)
      if (!member) {
        return {
          performed: false,
          message: `Which family member? You have: ${members.map((m) => m.name).join(', ')}.`,
        }
      }
      memberId = member.id
      memberName = member.name
    }

    const date = action.date || todayKeyLocal()
    const log = loadData('family_log')
    const entry = {
      id: Date.now().toString(),
      type: entryType,
      date,
      memberId,
      minutesSpent: entryType === 'checkin' ? Number(action.minutesSpent) || 0 : 0,
      note: (action.note || '').trim(),
      createdAt: new Date().toISOString(),
    }
    log.push(entry)
    saveData('family_log', log)

    if (entryType === 'checkin') {
      const members = loadData('family_members')
      const index = members.findIndex((m) => m.id === memberId)
      if (index !== -1) {
        members[index] = { ...members[index], lastCheckIn: date }
        saveData('family_members', members)
      }
    }

    return {
      performed: true,
      message:
        entryType === 'checkin'
          ? `Logged time with ${memberName}${entry.minutesSpent ? ` (${entry.minutesSpent} min)` : ''}.`
          : 'Logged faith practice.',
    }
  }

  if (action.type === 'log_reading_session') {
    const pages = Number(action.pagesRead)
    if (!pages || pages <= 0) {
      return { performed: false, message: '' }
    }
    const title = (action.bookTitle || '').trim()
    if (!title) {
      return { performed: false, message: '' }
    }

    const books = loadData('reading_books')
    let book = fuzzyMatchByName(books, 'title', title)
    // Unlike an exercise/habit/account/family member (all of which carry
    // real setup Dylan should choose deliberately), a book is a plain
    // title/author/page-count record with nothing to configure -- same
    // reasoning create_task/create_goal/create_note already apply, so a
    // book mentioned for the first time is added rather than rejected.
    if (!book) {
      book = {
        id: Date.now().toString(),
        title,
        author: '',
        totalPages: 0,
        currentPage: 0,
        status: 'reading',
        createdAt: new Date().toISOString(),
        finishedAt: null,
      }
      books.push(book)
    }

    const sessions = loadData('reading_sessions')
    sessions.push({
      id: Date.now().toString(),
      bookId: book.id,
      date: action.date || todayKeyLocal(),
      pagesRead: pages,
      createdAt: new Date().toISOString(),
    })
    saveData('reading_sessions', sessions)

    const bookIndex = books.findIndex((b) => b.id === book.id)
    const nextPage = book.totalPages ? Math.min(book.currentPage + pages, book.totalPages) : book.currentPage + pages
    books[bookIndex] = { ...book, currentPage: nextPage }
    saveData('reading_books', books)

    return { performed: true, message: `Logged ${pages} pages of ${book.title}.` }
  }

  if (action.type === 'complete_assignment') {
    const assignments = loadData('assignments')
    const search = (action.title || '').toLowerCase().trim()
    const assignment = assignments.find(
      (item) =>
        !item.completed &&
        (item.title.toLowerCase().includes(search) || search.includes(item.title.toLowerCase()))
    )
    if (!assignment) {
      return { performed: false, message: 'I could not find that open assignment.' }
    }
    assignment.completed = true
    saveData('assignments', assignments)
    return { performed: true, message: `Completed assignment: ${assignment.title}` }
  }

  if (action.type === 'forget_memory') {
    const memories = loadData('memories')
    const search = (action.content || '').toLowerCase().trim()
    const remaining = memories.filter(
      (memory) => !memory.content.toLowerCase().includes(search)
    )
    if (remaining.length === memories.length) {
      return { performed: false, message: 'I could not find that memory.' }
    }
    saveData('memories', remaining)
    return { performed: true, message: 'I forgot that memory.' }
  }

  return { performed: false, message: '' }
}
