import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, LIFE_MODES } from '../data/lifeModes.js'
import { playSound } from '../lib/soundEffects.js'

// In dev (npm run dev), Vite and Express run as two separate servers on
// this Mac, so the dev server always talks to localhost:3001 directly.
// In production (npm run build, then node server.js), Express serves the
// built frontend AND the API from the SAME origin/port -- which is what
// makes phone access through a tunnel work at all, since a free tunnel
// forwards exactly one port. A relative /api path automatically resolves
// to whatever host the tunnel maps that day, with zero reconfiguration.
const API = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api'

// Same bare local-date convention used throughout this file (and the
// backend's todayKey() in lib/studyPlan.js) -- NOT toISOString().slice(0,10),
// which reads off UTC and can mislabel a late-evening entry as tomorrow.
function todayKeyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKeyLocal(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Consecutive days, counting back from today, that have at least one
// matching row -- stops at the first gap. Exactly the same algorithm
// MindPage.jsx's own currentStreak() uses for a single habit; this
// version is generic over a Set of date keys so the Overview summary
// below can reuse it for Mind (per-habit) and Health (any category)
// without re-deriving it from scratch or importing a component file.
function streakFromDateKeys(dateKeys) {
  let streak = 0
  for (let i = 0; ; i += 1) {
    const key = i === 0 ? todayKeyLocal() : daysAgoKeyLocal(i)
    if (!dateKeys.has(key)) break
    streak += 1
  }
  return streak
}

function habitCurrentStreak(completions, habitId) {
  const doneDates = new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date))
  return streakFromDateKeys(doneDates)
}

// Health entries logged before this feature existed have no `date` field
// -- same fallback HealthPage.jsx's own currentStreak() uses, reading the
// local calendar day off `createdAt` instead of treating them as unlogged.
function healthLoggingStreak(healthEntries) {
  const loggedDays = new Set(
    healthEntries.map((entry) => entry.date || todayKeyForTimestamp(entry.createdAt))
  )
  return streakFromDateKeys(loggedDays)
}

function todayKeyForTimestamp(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Matches Skills mode's own STREAK_BADGES thresholds (routes/skills.js) --
// one canonical milestone ladder app-wide rather than a second, different
// set of numbers for Mind/Health streaks to hit.
const STREAK_MILESTONES = [3, 7, 30, 100]

function hitMilestone(streak) {
  return STREAK_MILESTONES.includes(streak) ? streak : null
}

// A single day's net-worth move big enough to be worth calling out --
// below this it's normal noise (a grocery run, a paycheck), not a
// "notable day." finance_history (routes/finance.js) keeps at most one
// snapshot per calendar day, so "yesterday" here really means the most
// recent snapshot dated before today, however many days back that is.
const NET_WORTH_SWING_THRESHOLD_PCT = 5

function checkNetWorthSwing(history) {
  if (!Array.isArray(history) || history.length < 2) return null

  const today = todayKeyLocal()
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1))
  const todayEntry = [...sorted].reverse().find((point) => point.date === today)
  const priorEntry = [...sorted].reverse().find((point) => point.date !== today)
  if (!todayEntry || !priorEntry || !priorEntry.netWorth) return null

  const pct = ((todayEntry.netWorth - priorEntry.netWorth) / Math.abs(priorEntry.netWorth)) * 100
  if (Math.abs(pct) < NET_WORTH_SWING_THRESHOLD_PCT) return null
  return { pct, netWorth: todayEntry.netWorth }
}

export function useAppData() {
  const [message, setMessage] = useState('')
  const [activePage, setActivePage] = useState('Overview')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [tasks, setTasks] = useState([])
  const [chatThreads, setChatThreads] = useState({ general: [] })
  const [goals, setGoals] = useState([])
  const [notes, setNotes] = useState([])
  const [memories, setMemories] = useState([])
  const [healthEntries, setHealthEntries] = useState([])
  const [healthGoals, setHealthGoals] = useState({})
  const [financeAccounts, setFinanceAccounts] = useState([])
  const [financeNetWorth, setFinanceNetWorth] = useState(0)
  const [financeHistory, setFinanceHistory] = useState([])
  const [financeTransactions, setFinanceTransactions] = useState([])
  const [financeBudgets, setFinanceBudgets] = useState({})
  const [tradingPositions, setTradingPositions] = useState([])
  const [tradingWatchlist, setTradingWatchlist] = useState([])
  const [tradingStats, setTradingStats] = useState(null)
  const [tradingSettings, setTradingSettings] = useState({ concentrationLimitPct: 10 })
  const [skills, setSkills] = useState([])
  const [gymExercises, setGymExercises] = useState([])
  const [gymLogs, setGymLogs] = useState([])
  const [gymRoutines, setGymRoutines] = useState([])
  const [gymWeekPlan, setGymWeekPlan] = useState({})
  const [gymWeekPlanOverrides, setGymWeekPlanOverrides] = useState({})
  const [gymDayNotes, setGymDayNotes] = useState([])
  const [gymSessions, setGymSessions] = useState([])
  const [gymRecurringEvents, setGymRecurringEvents] = useState([])
  const [sportsSessions, setSportsSessions] = useState([])
  const [sportsSchedule, setSportsSchedule] = useState({})
  const [sportsScheduleOverrides, setSportsScheduleOverrides] = useState({})
  const [sportsSettings, setSportsSettings] = useState({ sport: '' })
  const [sportsRecurringEvents, setSportsRecurringEvents] = useState([])
  const [readingBooks, setReadingBooks] = useState([])
  const [readingSessions, setReadingSessions] = useState([])
  const [readingGoals, setReadingGoals] = useState({ dailyPageGoal: 10 })
  const [mindHabits, setMindHabits] = useState([])
  const [mindCompletions, setMindCompletions] = useState([])
  const [mindReviews, setMindReviews] = useState([])
  const [mindDecisions, setMindDecisions] = useState([])
  const [mindSkillXp, setMindSkillXp] = useState({})
  const [mindInsights, setMindInsights] = useState([])
  const [familyMembers, setFamilyMembers] = useState([])
  const [familyLog, setFamilyLog] = useState([])
  const [familyGoals, setFamilyGoals] = useState({ weeklyMinutesGoal: 360 })
  // Growing text shown in the loading slot while a chat reply streams in
  // token by token -- cleared at the start/end of every sendMessage call.
  // Separate from chatThreads on purpose: chatThreads only ever gets the
  // final, authoritative message once the stream's `done` event arrives,
  // so a stream that errors partway through never leaves a half-written
  // message sitting in the real transcript.
  const [streamingText, setStreamingText] = useState('')
  const [toasts, setToasts] = useState([])
  // Full-screen achievement unlocks -- a queue (not a single slot) so two
  // milestones firing back-to-back (a PR right as a streak also ticks
  // over) show one after another instead of one clobbering the other.
  // The head of the queue IS the active achievement -- no separate
  // 'current' state to keep in sync with it.
  const [achievementQueue, setAchievementQueue] = useState([])
  const [playerStats, setPlayerStats] = useState({ xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 50 })

  const [taskInput, setTaskInput] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskReminder, setTaskReminder] = useState('none')

  // NOTE: schoolInput/schoolDueDate/addSchoolTask are dead code carried over
  // from the original App.jsx — nothing renders them or calls addSchoolTask.
  // Preserved here unchanged rather than silently dropped during the split;
  // flag for removal separately.
  const [schoolInput, setSchoolInput] = useState('')
  const [schoolDueDate, setSchoolDueDate] = useState('')

  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [tests, setTests] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [classNameInput, setClassNameInput] = useState('')
  const [assignmentInput, setAssignmentInput] = useState('')
  const [assignmentDueDate, setAssignmentDueDate] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testDate, setTestDate] = useState('')
  const [testTopics, setTestTopics] = useState('')

  const [goalInput, setGoalInput] = useState('')
  const [goalDueDate, setGoalDueDate] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [memoryInput, setMemoryInput] = useState('')
  const [memorySuggestion, setMemorySuggestion] = useState('')

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('dylan-ai-settings')

      return saved
        ? {
            ...DEFAULT_SETTINGS,
            ...JSON.parse(saved),
          }
        : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const [modeFlashKey, setModeFlashKey] = useState(0)
  const hasMountedRef = useRef(false)

  const activeMode = useMemo(
    () => LIFE_MODES.find((mode) => mode.key === activePage) || null,
    [activePage]
  )

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    if (settings.signatureTransitions) {
      setModeFlashKey((value) => value + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage])

  useEffect(() => {
    loadData()

    const savedThreads = localStorage.getItem('dylan-ai-chat-threads')

    if (savedThreads) {
      try {
        setChatThreads(JSON.parse(savedThreads))
      } catch {}
    } else {
      // One-time migration: earlier versions kept a single flat chat
      // history under 'dylan-ai-chat'. Fold it into the 'general' thread
      // so nothing written before per-mode chat existed is lost.
      const legacyChat = localStorage.getItem('dylan-ai-chat')

      if (legacyChat) {
        try {
          const parsed = JSON.parse(legacyChat)
          if (Array.isArray(parsed) && parsed.length) {
            setChatThreads({ general: parsed })
          }
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('dylan-ai-settings', JSON.stringify(settings))

    document.documentElement.dataset.theme = settings.appearance
    // Read by App.css to scale celebration-animation duration/intensity
    // without prop-drilling settings into every component that animates.
    document.documentElement.dataset.animationIntensity = settings.animationIntensity || 'normal'
  }, [settings])

  useEffect(() => {
    localStorage.setItem('dylan-ai-chat-threads', JSON.stringify(chatThreads))
  }, [chatThreads])

  /*
    Every request is time-bounded. Without this, a backend that never
    responds (a stalled Ollama call, a hung integration) meant the await
    below never settled, so the `finally { setLoading(false) }` in
    sendMessage never ran and the thinking animation span forever with no
    way to recover except reloading the page. 150s is deliberately longer
    than the server's own 120s AI timeout, so when the AI is the slow part
    the server's specific error wins the race and Dylan sees the real
    reason instead of a generic client-side timeout.
  */
  async function request(endpoint, options = {}, timeoutMs = 150000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response
    try {
      response = await fetch(`${API}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: controller.signal,
        ...options,
      })
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `The request took longer than ${Math.round(timeoutMs / 1000)}s and was cancelled. The backend may be stuck — check the terminal running \`npm run dev\`.`
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.')
    }

    return data
  }

  // Global search across tasks/notes/goals/memories/classes/assignments/
  // tests/health/finance/gym/skills/reading/mind/family -- see
  // routes/search.js for the full source list and why journal is
  // deliberately excluded (it's passcode-protected; a plaintext global
  // search would defeat that). A short, local, disk-only lookup -- 5s is
  // generous, not a sign this is expected to be slow.
  async function searchAll(query) {
    const trimmed = query.trim()
    if (trimmed.length < 2) return []
    const data = await request(`/search?q=${encodeURIComponent(trimmed)}`, {}, 5000)
    return data.results || []
  }

  /*
    Same job as request(), but for the one endpoint (`/chat`) that now
    streams its answer back as Server-Sent Events instead of a single JSON
    body -- so it can't reuse request()'s `response.json()` call. Ollama
    itself hasn't gotten any faster; this is what actually fixes "it feels
    slow": text now appears the moment the model writes it instead of only
    after the ENTIRE reply (plus the JSON action block that follows it) has
    finished generating.

    Every `token` frame's text is appended to streamingText immediately, so
    the loading slot in ChatPage can show it live. The `done` frame is the
    one authoritative result -- same shape request('/chat', ...) used to
    return -- and is what sendMessage below actually uses to build the real
    chat message; the streamed text is a preview, not the source of truth
    (they can legitimately differ, e.g. once an action's own message
    replaces the model's short "reply" text).
  */
  async function streamChat(body, timeoutMs = 150000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response
    try {
      response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      if (error.name === 'AbortError') {
        throw new Error(
          `The request took longer than ${Math.round(timeoutMs / 1000)}s and was cancelled. The backend may be stuck — check the terminal running \`npm run dev\`.`,
          { cause: error }
        )
      }
      throw error
    }

    if (!response.ok) {
      clearTimeout(timer)
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Something went wrong.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let doneResult = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let frameBreak
        while ((frameBreak = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, frameBreak)
          buffer = buffer.slice(frameBreak + 2)

          const lines = frame.split('\n')
          const eventLine = lines.find((l) => l.startsWith('event:'))
          const dataLine = lines.find((l) => l.startsWith('data:'))
          if (!eventLine || !dataLine) continue

          const eventName = eventLine.slice(6).trim()
          let payload
          try {
            payload = JSON.parse(dataLine.slice(5).trim())
          } catch {
            continue
          }

          if (eventName === 'token') {
            setStreamingText((prev) => prev + (payload.text || ''))
          } else if (eventName === 'done') {
            doneResult = payload
          } else if (eventName === 'error') {
            throw new Error(payload.error || 'Could not connect to the local AI.')
          }
        }
      }
    } finally {
      clearTimeout(timer)
      reader.releaseLock?.()
    }

    if (!doneResult) {
      throw new Error('The connection ended before a full response arrived.')
    }

    return doneResult
  }

  // Used to fire ~22 separate GET requests in parallel every single time
  // ANY mutation anywhere in the app happened -- add a task, log a gym set,
  // toggle a habit. Each request was individually fast (local Express,
  // small JSON files), but 22 of them, 22 route handlers, 22 JSON parses,
  // every single save, was real and measurable -- the most concrete
  // candidate for "the app feels slow." Now a single GET /api/bootstrap
  // (routes/bootstrap.js) does the same 22 reads server-side, in-process,
  // reusing the exact same computation each real endpoint already runs
  // (skills' XP/streak/level, finance's net worth, gym/sports week-plan
  // defaults) -- and returns them in one response. Every individual
  // endpoint (/gym/logs, /finance, etc.) is untouched and still used by
  // every add/update/delete function below; only the "reload everything"
  // step changed from 22 round trips to 1.
  async function loadData() {
    try {
      const data = await request('/bootstrap')

      setTasks(data.tasks || [])
      setGoals(data.goals || [])
      setNotes(data.notes || [])
      setMemories(data.memories || [])
      setClasses(data.classes || [])
      setAssignments(data.assignments || [])
      setTests(data.tests || [])
      setHealthEntries(data.health?.entries || [])
      setHealthGoals(data.health?.goals || {})
      setFinanceAccounts(data.finance?.accounts || [])
      setFinanceNetWorth(data.finance?.netWorth || 0)
      setFinanceHistory(data.finance?.history || [])
      setFinanceTransactions(data.finance?.transactions || [])
      setFinanceBudgets(data.finance?.budgets || {})
      setTradingPositions(data.trading?.positions || [])
      setTradingWatchlist(data.trading?.watchlist || [])
      setTradingStats(data.trading?.stats || null)
      setTradingSettings(data.trading?.settings || { concentrationLimitPct: 10 })
      setSkills(data.skills || [])
      setGymExercises(data.gym?.exercises || [])
      setGymLogs(data.gym?.logs || [])
      setGymRoutines(data.gym?.routines || [])
      setGymWeekPlan(data.gym?.weekPlan || {})
      setGymWeekPlanOverrides(data.gym?.weekPlanOverrides || {})
      setGymDayNotes(data.gym?.dayNotes || [])
      setGymSessions(data.gym?.sessions || [])
      setGymRecurringEvents(data.gym?.recurringEvents || [])
      setSportsSessions(data.sports?.sessions || [])
      setSportsSchedule(data.sports?.schedule || {})
      setSportsScheduleOverrides(data.sports?.scheduleOverrides || {})
      setSportsSettings(data.sports?.settings || { sport: '' })
      setSportsRecurringEvents(data.sports?.recurringEvents || [])
      setReadingBooks(data.reading?.books || [])
      setReadingSessions(data.reading?.sessions || [])
      setReadingGoals(data.reading?.goals || { dailyPageGoal: 10 })
      setMindHabits(data.mind?.habits || [])
      setMindCompletions(data.mind?.completions || [])
      setMindReviews(data.mind?.reviews || [])
      setMindDecisions(data.mind?.decisions || [])
      setMindSkillXp(data.mind?.skillXp || {})
      setMindInsights(data.mind?.insights || [])
      setFamilyMembers(data.family?.members || [])
      setFamilyLog(data.family?.log || [])
      setFamilyGoals(data.family?.goals || { weeklyMinutesGoal: 360 })
      setPlayerStats(data.player || { xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 50 })

      // Returned (not just set into state) so a caller that just mutated
      // something can compare against the FRESH value in the same tick --
      // React state updates from the setX calls above haven't landed yet
      // by the time this returns, so reading e.g. `skills` here would give
      // the stale pre-mutation value. Kept intentionally narrow: only the
      // slices callers actually diff against for celebration/milestone
      // detection, not the whole payload.
      return {
        skills: data.skills || [],
        goals: data.goals || [],
        mind: {
          habits: data.mind?.habits || [],
          completions: data.mind?.completions || [],
        },
        health: { entries: data.health?.entries || [] },
        finance: { history: data.finance?.history || [] },
        gym: {
          logs: data.gym?.logs || [],
          exercises: data.gym?.exercises || [],
        },
      }
    } catch (error) {
      setErrorMessage(error.message)
      return null
    }
  }

  function showSuccess(text) {
    setSuccessMessage(text)
    setErrorMessage('')

    setTimeout(() => {
      setSuccessMessage('')
    }, 3000)
  }

  function showError(text) {
    setErrorMessage(text)
    setSuccessMessage('')

    setTimeout(() => {
      setErrorMessage('')
    }, 4000)
  }

  // "Game feel" layer: short-lived celebration toasts for level-ups, badge
  // unlocks, and completions — stacked independently of the single-line
  // success/error banner above, since those are status messages and these
  // are meant to feel like a reward, not a system notice.
  function pushToast(toast) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, kind: 'info', ...toast }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, toast.duration || 3400)
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }

  // Respects the Settings -> Display sound toggle -- one gate here rather
  // than checking settings.soundEffects at every single call site.
  function maybePlaySound(cue) {
    if (settings.soundEffects) playSound(cue)
  }

  // "New Achievement" unlock screen: a bigger, rarer, full-screen moment
  // for the handful of things that deserve more than a corner toast --
  // level-ups, PRs, goal completions, and streak milestones. Deliberately
  // separate from pushToast's stack: those are frequent and ambient, this
  // is meant to feel like an event worth stopping for a second.
  const activeAchievement = achievementQueue[0] || null

  function pushAchievement(achievement) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setAchievementQueue((prev) => [...prev, { id, duration: 3200, ...achievement }])
  }

  function dismissAchievement() {
    setAchievementQueue((prev) => prev.slice(1))
  }

  // Auto-advances the queue after each achievement's own duration. The
  // setState call lives inside the timeout callback, not the effect body
  // itself, so this doesn't trip react-hooks/set-state-in-effect -- the
  // same class of bug this file has hit (and fixed correctly) three times
  // already in SearchOverlay, useCountUp, and the Gym progression effect.
  useEffect(() => {
    if (!activeAchievement) return undefined
    const timer = setTimeout(() => {
      setAchievementQueue((prev) => prev.slice(1))
    }, activeAchievement.duration)
    return () => clearTimeout(timer)
  }, [activeAchievement])

  // A big net-worth move is a "day" event, not a "per-edit" one -- logging
  // three small transactions against the same underlying swing shouldn't
  // fire the celebration three times, so it's gated to once per calendar
  // day via localStorage rather than component state (which would reset
  // on reload and re-fire). A gain gets the full Achievement treatment; a
  // drop gets a calm, non-celebratory toast -- a reward-shaped animation
  // for losing money would be a genuinely bad design choice, not just a
  // stylistic one.
  function maybeCelebrateNetWorthSwing(fresh) {
    if (!fresh?.finance?.history) return
    const swing = checkNetWorthSwing(fresh.finance.history)
    if (!swing) return

    const flagKey = `dylan-ai-networth-swing-${todayKeyLocal()}`
    if (localStorage.getItem(flagKey)) return
    localStorage.setItem(flagKey, '1')

    if (swing.pct > 0) {
      pushAchievement({
        kind: 'finance',
        title: 'NET WORTH UP',
        subtitle: `+${swing.pct.toFixed(1)}% today`,
      })
      maybePlaySound('achievement')
    } else {
      pushToast({
        kind: 'alert',
        title: 'NET WORTH DOWN',
        message: `${swing.pct.toFixed(1)}% today`,
      })
    }
  }

  // App-wide level/XP -- separate from Skills mode's own per-skill leveling,
  // this one number goes up no matter which life area you're working in.
  // `reason` must be one of the fixed keys in lib/playerXP.js's reward
  // table; the server, not this call site, decides how much it's worth.
  async function awardXP(reason) {
    try {
      const result = await request('/player/award', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setPlayerStats(result)
      if (result.leveledUp) {
        // Upgraded from a corner toast to the full Achievement unlock --
        // a level-up is the single biggest "you're making progress" event
        // in the whole app, it deserves more than the same treatment as
        // an ordinary task completion.
        pushAchievement({
          kind: 'levelup',
          title: 'LEVEL UP',
          subtitle: `You reached Level ${result.level}`,
          duration: 3600,
        })
        maybePlaySound('levelup')
      }
    } catch (error) {
      console.error('XP award failed:', error)
    }
  }

  function detectSkillMilestones(previousSkills, nextSkills) {
    if (!Array.isArray(nextSkills)) return

    for (const nextSkill of nextSkills) {
      const prevSkill = (previousSkills || []).find((item) => item.id === nextSkill.id)
      const prevLevel = prevSkill?.level || 1
      const prevBadgeCount = prevSkill?.badges?.length || 0

      if (nextSkill.level > prevLevel) {
        pushToast({
          kind: 'levelup',
          title: 'LEVEL UP',
          message: `${nextSkill.name} reached Level ${nextSkill.level}`,
        })
        awardXP('skill-levelup')
      }

      const newBadges = (nextSkill.badges || []).slice(prevBadgeCount)
      newBadges.forEach((badge) => {
        // A streak badge (routes/skills.js's STREAK_BADGES) is exactly the
        // "milestone celebration" ask -- 3/7/30/100 consecutive days on
        // one skill is worth the full-screen unlock, not a corner toast.
        // Level badges stay as toasts; they fire more often and a modal
        // for every one would get old fast.
        if (badge.type === 'streak') {
          pushAchievement({
            kind: 'milestone',
            title: `${badge.threshold}-DAY STREAK`,
            subtitle: nextSkill.name,
          })
          maybePlaySound('milestone')
        } else {
          pushToast({
            kind: 'badge',
            title: 'BADGE UNLOCKED',
            message: badge.label,
          })
        }
        awardXP('skill-badge')
      })
    }
  }

  function detectGoalMilestones(previousGoals, nextGoals) {
    if (!Array.isArray(nextGoals)) return

    for (const nextGoal of nextGoals) {
      const prevGoal = (previousGoals || []).find((item) => item.id === nextGoal.id)
      const prevProgress = prevGoal?.progress ?? 0

      if (nextGoal.progress >= 100 && prevProgress < 100) {
        pushToast({
          kind: 'goal',
          title: 'GOAL COMPLETE',
          message: nextGoal.title,
        })
        awardXP('goal-complete')
      }
    }
  }

  // Chat-triggered parity for the four celebration hooks above: a
  // log_gym_set/complete_habit/log_health action mutates data exactly the
  // same way its manual-UI counterpart (addGymLog/toggleMindCompletion/
  // addHealthEntry) does, but bypasses those functions entirely -- routes/
  // chat.js calls lib/assistant.js's executeAction() directly on the
  // server. Same before/after diff technique as detectSkillMilestones/
  // detectGoalMilestones just above (compare the pre-action snapshot this
  // hook already had in state against the fresh post-action load), rather
  // than threading extra fields back through the chat response -- keeps
  // one consistent way this file detects "did something notable just
  // happen," whether the trigger was a click or a text message.

  function detectGymPRs(previousLogs, nextLogs, exercises) {
    if (!Array.isArray(nextLogs)) return
    const previousIds = new Set((previousLogs || []).map((log) => log.id))
    const newLogs = nextLogs.filter((log) => !previousIds.has(log.id))
    if (!newLogs.length) return

    // Baseline history starts at whatever existed before this chat action
    // and grows as each new log is walked, so a batch of more than one new
    // log (unlikely, but possible) doesn't compare every entry against the
    // same stale starting point. The very first log ever for an exercise
    // stays a baseline, not a PR -- same rule addGymLog uses.
    const historyByExercise = new Map()
    for (const log of previousLogs || []) {
      if (!historyByExercise.has(log.exerciseId)) historyByExercise.set(log.exerciseId, [])
      historyByExercise.get(log.exerciseId).push(log)
    }

    for (const log of newLogs) {
      const priorLogs = historyByExercise.get(log.exerciseId) || []
      let priorBestWeight = 0
      let priorBest1RM = 0
      priorLogs.forEach((priorLog) => {
        ;(priorLog.sets || []).forEach((set) => {
          const w = Number(set.weight) || 0
          const r = Number(set.reps) || 0
          priorBestWeight = Math.max(priorBestWeight, w)
          priorBest1RM = Math.max(priorBest1RM, epley1RM(w, r))
        })
      })

      let newBestWeight = 0
      let newBest1RM = 0
      ;(log.sets || []).forEach((set) => {
        const w = Number(set.weight) || 0
        const r = Number(set.reps) || 0
        newBestWeight = Math.max(newBestWeight, w)
        newBest1RM = Math.max(newBest1RM, epley1RM(w, r))
      })

      const exercise = exercises?.find((e) => e.id === log.exerciseId)
      const exerciseName = exercise ? exercise.name : 'Exercise'

      if (priorLogs.length > 0 && newBestWeight > priorBestWeight) {
        pushAchievement({ kind: 'pr', title: 'NEW PR', subtitle: `${exerciseName}: ${newBestWeight} lbs` })
        maybePlaySound('pr')
        awardXP('gym-pr')
      } else if (priorLogs.length > 0 && newBest1RM > priorBest1RM) {
        pushAchievement({
          kind: 'pr',
          title: 'NEW EST. 1RM',
          subtitle: `${exerciseName}: ~${Math.round(newBest1RM)} lbs`,
        })
        maybePlaySound('pr')
        awardXP('gym-pr')
      }

      if (!historyByExercise.has(log.exerciseId)) historyByExercise.set(log.exerciseId, [])
      historyByExercise.get(log.exerciseId).push(log)
    }
  }

  function detectHabitCompletions(previousCompletions, nextCompletions, habits) {
    if (!Array.isArray(nextCompletions)) return
    const previousIds = new Set((previousCompletions || []).map((c) => c.id))
    const newCompletions = nextCompletions.filter((c) => !previousIds.has(c.id))
    if (!newCompletions.length) return

    for (const completion of newCompletions) {
      const habit = habits?.find((h) => h.id === completion.habitId)
      pushToast({ kind: 'task', title: 'HABIT DONE', message: habit ? habit.name : 'Habit' })
      awardXP('habit-done')

      // Same "only today counts toward an active streak" rule as
      // toggleMindCompletion -- a chat message marking a past day
      // done doesn't represent a streak crossing a milestone right now.
      if (completion.date === todayKeyLocal()) {
        const newStreak = habitCurrentStreak(nextCompletions, completion.habitId)
        const milestone = hitMilestone(newStreak)
        if (milestone) {
          pushAchievement({
            kind: 'milestone',
            title: `${milestone}-DAY STREAK`,
            subtitle: habit ? habit.name : 'Habit',
          })
          maybePlaySound('milestone')
        }
      }
    }
  }

  // Bonus parity fix while this hook is already being extended: chat-
  // triggered log_health never got the streak-milestone check addHealthEntry
  // already does for the manual path -- same gap this file's own history
  // already fixed once for Skills (see addSkillSession below). Closing it
  // here rather than leaving a second, quieter version of the same bug.
  function detectHealthStreak(previousEntries, nextEntries) {
    if (!Array.isArray(nextEntries)) return
    const previousIds = new Set((previousEntries || []).map((e) => e.id))
    const hasNew = nextEntries.some((e) => !previousIds.has(e.id))
    if (!hasNew) return

    const newStreak = healthLoggingStreak(nextEntries)
    const milestone = hitMilestone(newStreak)
    if (milestone) {
      pushAchievement({ kind: 'milestone', title: `${milestone}-DAY STREAK`, subtitle: 'Health logging' })
      maybePlaySound('milestone')
    }
  }

  // Gym: estimated 1-rep-max via the Epley formula -- a standard, simple
  // approximation (weight * (1 + reps/30)) used to compare strength across
  // different rep ranges, not just raw weight. Good enough for "am I
  // getting stronger," not meant to be lab-accurate.
  function epley1RM(weight, reps) {
    if (!weight || !reps) return 0
    return weight * (1 + reps / 30)
  }

  async function addGymExercise(name, category) {
    if (!name?.trim()) return
    setSaving(true)
    try {
      await request('/gym/exercises', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), category: category?.trim() || '' }),
      })
      await loadData()
      showSuccess('Exercise added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteGymExercise(id) {
    try {
      await request(`/gym/exercises/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Exercise deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Sets or clears a simple progression program on an exercise --
  // { targetSets, targetReps, progressionIncrement } -- or any other
  // exercise field. Silent (no toast) since it's called live as someone
  // types into the program form, same treatment as updateGymRoutine.
  async function updateGymExercise(id, updates) {
    try {
      await request(`/gym/exercises/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Logs a set of work for one exercise, then checks it against every prior
  // log for that same exercise -- both raw max weight and estimated 1RM --
  // and fires a celebratory toast on a genuine new record. The very first
  // log for a brand-new exercise never counts as a PR: there's no history
  // yet to beat, so it's a baseline, not a record.
  async function addGymLog(exerciseId, date, sets) {
    if (!exerciseId || !Array.isArray(sets) || !sets.length) return
    setSaving(true)
    try {
      const priorLogs = gymLogs.filter((log) => log.exerciseId === exerciseId)
      let priorBestWeight = 0
      let priorBest1RM = 0
      priorLogs.forEach((log) => {
        ;(log.sets || []).forEach((set) => {
          const w = Number(set.weight) || 0
          const r = Number(set.reps) || 0
          priorBestWeight = Math.max(priorBestWeight, w)
          priorBest1RM = Math.max(priorBest1RM, epley1RM(w, r))
        })
      })

      let newBestWeight = 0
      let newBest1RM = 0
      sets.forEach((set) => {
        const w = Number(set.weight) || 0
        const r = Number(set.reps) || 0
        newBestWeight = Math.max(newBestWeight, w)
        newBest1RM = Math.max(newBest1RM, epley1RM(w, r))
      })

      await request('/gym/logs', {
        method: 'POST',
        body: JSON.stringify({ exerciseId, date, sets }),
      })

      await loadData()

      const exercise = gymExercises.find((e) => e.id === exerciseId)
      const exerciseName = exercise ? exercise.name : 'Exercise'

      if (priorLogs.length > 0 && newBestWeight > priorBestWeight) {
        // A real PR gets the full Achievement unlock, not just a toast --
        // one of the explicit "make it feel like a videogame" triggers.
        pushAchievement({
          kind: 'pr',
          title: 'NEW PR',
          subtitle: `${exerciseName}: ${newBestWeight} lbs`,
        })
        maybePlaySound('pr')
        awardXP('gym-pr')
      } else if (priorLogs.length > 0 && newBest1RM > priorBest1RM) {
        pushAchievement({
          kind: 'pr',
          title: 'NEW EST. 1RM',
          subtitle: `${exerciseName}: ~${Math.round(newBest1RM)} lbs`,
        })
        maybePlaySound('pr')
        awardXP('gym-pr')
      }

      showSuccess('Workout logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteGymLog(id) {
    try {
      await request(`/gym/logs/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Log deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addGymRoutine(name, exerciseIds) {
    if (!name?.trim()) return
    setSaving(true)
    try {
      await request('/gym/routines', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), exerciseIds: exerciseIds || [] }),
      })
      await loadData()
      showSuccess('Routine saved.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateGymRoutine(id, updates) {
    try {
      await request(`/gym/routines/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteGymRoutine(id) {
    try {
      await request(`/gym/routines/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Routine deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // day is 'monday'..'sunday'; routineId is a routine id or null ("rest").
  async function setGymWeekPlanDay(day, routineId) {
    try {
      await request('/gym/week-plan', {
        method: 'POST',
        body: JSON.stringify({ [day]: routineId }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // date is 'YYYY-MM-DD'; routineId null clears the override, reverting
  // that date back to its normal weekday routine. See routes/gym.js for
  // why this exists -- a rotating split or a one-off swap doesn't fit the
  // fixed weekday template.
  async function setGymWeekPlanOverride(date, routineId) {
    try {
      await request('/gym/week-plan/override', {
        method: 'POST',
        body: JSON.stringify({ date, routineId }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // date is a bare 'YYYY-MM-DD' key; note '' clears that day's note. No
  // success toast -- this saves as you type/blur, same as the week plan.
  async function setGymDayNote(date, note) {
    try {
      await request('/gym/day-notes', {
        method: 'POST',
        body: JSON.stringify({ date, note }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Gym sessions: one entry per gym VISIT (start/end time + a note), not
  // per exercise -- see routes/gym.js for why this is separate from
  // addGymLog. Feeds the Gym mode's own Calendar tab and syncs one event
  // per visit to the real calendar, same as Sports sessions already do.
  async function addGymSession(session) {
    if (!session?.date) return
    setSaving(true)
    try {
      await request('/gym/sessions', {
        method: 'POST',
        body: JSON.stringify(session),
      })
      await loadData()
      showSuccess('Gym session logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteGymSession(id) {
    try {
      await request(`/gym/sessions/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Session deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Gym recurring events: a repeating time-boxed appointment (e.g. "Team
  // Lift, Mon/Wed, 6:00-7:00am") shown on the Gym Calendar tab -- fully
  // independent of the Week Plan's routine-per-weekday mapping.
  async function addGymRecurringEvent(event) {
    setSaving(true)
    try {
      await request('/gym/recurring-events', {
        method: 'POST',
        body: JSON.stringify(event),
      })
      await loadData()
      showSuccess('Recurring session added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteGymRecurringEvent(id) {
    try {
      await request(`/gym/recurring-events/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Recurring session removed.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Sports: one shared session shape for both a practice and a game (see
  // routes/sports.js for why) -- the server derives win/loss/tie from the
  // scores when both are given, so the client just passes through whatever
  // the form collected.
  async function addSportsSession(session) {
    if (!session?.date || !session?.type) return
    setSaving(true)
    try {
      await request('/sports/sessions', {
        method: 'POST',
        body: JSON.stringify(session),
      })
      await loadData()
      showSuccess(session.type === 'game' ? 'Game logged.' : 'Practice logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSportsSession(id) {
    try {
      await request(`/sports/sessions/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Session deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // day is 'monday'..'sunday'; type is 'practice' | 'game' | 'off' | null.
  async function setSportsScheduleDay(day, type) {
    try {
      await request('/sports/schedule', {
        method: 'POST',
        body: JSON.stringify({ [day]: type }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // date is 'YYYY-MM-DD'; type null clears the override, reverting that
  // date back to its normal weekday schedule. See routes/sports.js for
  // why this exists -- a real season deviates from any fixed weekly
  // template (rescheduled games, bye weeks, extra practices).
  async function setSportsScheduleOverride(date, type) {
    try {
      await request('/sports/schedule/override', {
        method: 'POST',
        body: JSON.stringify({ date, type }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function setSportsSport(sport) {
    try {
      await request('/sports/settings', {
        method: 'POST',
        body: JSON.stringify({ sport }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Sports recurring events: a repeating time-boxed appointment (e.g.
  // "Team Practice, Tue/Thu, 3:30-5:30pm") shown on the Sports Calendar
  // tab -- fully independent of the weekday Schedule's plan-vs-reality
  // check above.
  async function addSportsRecurringEvent(event) {
    setSaving(true)
    try {
      await request('/sports/recurring-events', {
        method: 'POST',
        body: JSON.stringify(event),
      })
      await loadData()
      showSuccess('Recurring session added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSportsRecurringEvent(id) {
    try {
      await request(`/sports/recurring-events/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Recurring session removed.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Reading
  async function addReadingBook(book) {
    setSaving(true)
    try {
      await request('/reading/books', { method: 'POST', body: JSON.stringify(book) })
      await loadData()
      showSuccess('Book added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateReadingBook(id, updates) {
    setSaving(true)
    try {
      await request(`/reading/books/${id}`, { method: 'PUT', body: JSON.stringify(updates) })
      await loadData()
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteReadingBook(id) {
    try {
      await request(`/reading/books/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Book removed.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addReadingSession(session) {
    setSaving(true)
    try {
      await request('/reading/sessions', { method: 'POST', body: JSON.stringify(session) })
      await loadData()
      showSuccess('Pages logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function setReadingGoal(dailyPageGoal) {
    try {
      await request('/reading/goals', {
        method: 'POST',
        body: JSON.stringify({ dailyPageGoal }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Mind
  async function addMindHabit(name, options = {}) {
    setSaving(true)
    try {
      await request('/mind/habits', { method: 'POST', body: JSON.stringify({ name, ...options }) })
      await loadData()
      showSuccess('Habit added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateMindHabit(id, updates) {
    setSaving(true)
    try {
      await request(`/mind/habits/${id}`, { method: 'PUT', body: JSON.stringify(updates) })
      await loadData()
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteMindHabit(id) {
    try {
      await request(`/mind/habits/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Habit deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function toggleMindCompletion(habitId, date) {
    try {
      const result = await request('/mind/completions/toggle', {
        method: 'POST',
        body: JSON.stringify({ habitId, date }),
      })
      const fresh = await loadData()

      if (result.done) {
        const habit = mindHabits.find((h) => h.id === habitId)
        pushToast({ kind: 'task', title: 'HABIT DONE', message: habit ? habit.name : 'Habit' })
        awardXP('habit-done')

        // habitCurrentStreak counts back from TODAY, so this only means
        // something when the date just toggled on is today -- checking
        // off a past day doesn't represent an active streak crossing a
        // milestone right now, so it's silently skipped rather than fired
        // on a technicality.
        if (fresh && date === todayKeyLocal()) {
          const newStreak = habitCurrentStreak(fresh.mind.completions, habitId)
          const milestone = hitMilestone(newStreak)
          if (milestone) {
            pushAchievement({
              kind: 'milestone',
              title: `${milestone}-DAY STREAK`,
              subtitle: habit ? habit.name : 'Habit',
            })
            maybePlaySound('milestone')
          }
        }
      }
    } catch (error) {
      showError(error.message)
    }
  }

  async function addMindReview(type, fields = {}) {
    setSaving(true)
    try {
      const result = await request('/mind/reviews', { method: 'POST', body: JSON.stringify({ type, ...fields }) })
      await loadData()
      showSuccess(type === 'morning' ? 'Morning check-in saved.' : 'Night review saved.')
      return result.review
    } catch (error) {
      showError(error.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function addMindDecision(fields = {}) {
    setSaving(true)
    try {
      const result = await request('/mind/decisions', { method: 'POST', body: JSON.stringify(fields) })
      await loadData()
      showSuccess('Logged -- nice pause.')
      return result.decision
    } catch (error) {
      showError(error.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function updateMindDecision(id, updates) {
    try {
      await request(`/mind/decisions/${id}`, { method: 'PUT', body: JSON.stringify(updates) })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Family/Faith
  async function addFamilyMember(name, relationship) {
    setSaving(true)
    try {
      await request('/family/members', { method: 'POST', body: JSON.stringify({ name, relationship }) })
      await loadData()
      showSuccess('Family member added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteFamilyMember(id) {
    try {
      await request(`/family/members/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Family member removed.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addFamilyLog(entry) {
    setSaving(true)
    try {
      await request('/family/log', { method: 'POST', body: JSON.stringify(entry) })
      await loadData()
      showSuccess(entry.type === 'checkin' ? 'Check-in logged.' : 'Logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function setFamilyGoal(weeklyMinutesGoal) {
    try {
      await request('/family/goals', {
        method: 'POST',
        body: JSON.stringify({ weeklyMinutesGoal }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteFamilyLogEntry(id) {
    try {
      await request(`/family/log/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function sendMessage(text = message, imageDataUrl = null) {
    const trimmed = text.trim()

    if ((!trimmed && !imageDataUrl) || loading) return

    const threadKey = activeMode ? activeMode.key : 'general'
    const userMessage = {
      role: 'user',
      content: trimmed || (imageDataUrl ? '[Sent an image]' : ''),
    }
    const priorMessages = chatThreads[threadKey] || []

    setChatThreads((prev) => ({
      ...prev,
      [threadKey]: [...(prev[threadKey] || []), userMessage],
    }))

    setMessage('')
    setLoading(true)
    setMemorySuggestion('')

    setStreamingText('')

    try {
      const chatResult = await streamChat({
        messages: [...priorMessages, userMessage],
        settings: {
          allowActions: settings.aiActions,
        },
        mode: threadKey,
        image: imageDataUrl || undefined,
      })

      setChatThreads((prev) => ({
        ...prev,
        [threadKey]: [
          ...(prev[threadKey] || []),
          {
            role: 'assistant',
            content: chatResult.reply || 'No response from Dylan AI.',
            // Measured server-side, so it reflects real model work.
            thinkingMs: chatResult.thinkingMs,
            // A proposed real calendar event awaiting Dylan's explicit
            // confirm/cancel -- see confirmPendingEvent/cancelPendingEvent
            // below. null on every message that isn't a create_event
            // proposal.
            pendingEvent: chatResult.pendingEvent
              ? { ...chatResult.pendingEvent, status: 'pending', error: null }
              : null,
          },
        ],
      }))

      if (chatResult.actionPerformed) {
        const previousSkills = skills
        const previousGoals = goals
        const previousGymLogs = gymLogs
        const previousCompletions = mindCompletions
        const previousHealthEntries = healthEntries
        const fresh = await loadData()
        if (fresh) {
          detectSkillMilestones(previousSkills, fresh.skills)
          detectGoalMilestones(previousGoals, fresh.goals)
          detectGymPRs(previousGymLogs, fresh.gym.logs, fresh.gym.exercises)
          detectHabitCompletions(previousCompletions, fresh.mind.completions, fresh.mind.habits)
          detectHealthStreak(previousHealthEntries, fresh.health.entries)
          maybeCelebrateNetWorthSwing(fresh)
        }
      }

      /*
        Only check memory after normal conversation.
        Direct commands from server.js return skipMemoryCheck: true.
      */

      /*
        Deliberately NOT awaited. This is a second, separate round-trip to
        the model, and awaiting it here meant the reply was already on
        screen while `finally { setLoading(false) }` still hadn't run — so
        the thinking animation kept going and the input stayed locked for
        the length of an entire extra model call. On a local 3B model that
        is most of the "it's very slow" feeling. Let it resolve whenever it
        resolves and update the suggestion then; the chat is done the
        moment the reply lands.
      */
      if (settings.memorySuggestions && !chatResult.skipMemoryCheck) {
        request('/memory-check', {
          method: 'POST',
          body: JSON.stringify({ message: trimmed }),
        })
          .then((memoryResult) => {
            if (memoryResult?.shouldSuggest) {
              setMemorySuggestion(memoryResult.memory || '')
            }
          })
          .catch(() => {
            // Memory suggestion errors do not interrupt chat.
          })
      }
    } catch (error) {
      showError(error.message)

      // Surface the actual backend error in the transcript itself, not just
      // a generic line — a vanishing toast was hiding useful diagnostics
      // (e.g. "vision model not installed") that Dylan had no way to see
      // after the fact.
      const isNetworkError = error.message?.toLowerCase().includes('fetch')
      setChatThreads((prev) => ({
        ...prev,
        [threadKey]: [
          ...(prev[threadKey] || []),
          {
            role: 'assistant',
            content: isNetworkError
              ? 'I could not connect to the Dylan AI backend. Is `npm run dev` running?'
              : `Something went wrong: ${error.message}`,
          },
        ],
      }))
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }

  /*
    create_event is the one action type the chat route never performs on
    its own (see routes/chat.js) -- it's a real, one-way write to Dylan's
    actual Apple/iCloud calendar, so Dylan (session 23) chose to require an
    explicit confirm click before anything actually gets written. These two
    functions are that confirm/cancel step. `index` addresses a message by
    its position in chatThreads[threadKey] -- safe here because messages are
    only ever appended, never reordered or removed, matching the `key={index}`
    already used to render them in ChatPage.
  */
  async function confirmPendingEvent(index) {
    const threadKey = currentThreadKey
    const pending = chatThreads[threadKey]?.[index]?.pendingEvent
    if (!pending || pending.status === 'confirming' || pending.status === 'confirmed') return

    function patchPendingEvent(patch) {
      setChatThreads((prev) => {
        const thread = prev[threadKey] || []
        const target = thread[index]
        if (!target?.pendingEvent) return prev
        const updated = [...thread]
        updated[index] = { ...target, pendingEvent: { ...target.pendingEvent, ...patch } }
        return { ...prev, [threadKey]: updated }
      })
    }

    patchPendingEvent({ status: 'confirming', error: null })

    try {
      // Reuses the exact same real-calendar-write endpoint the Calendar
      // page's own manual "add event" form already uses (useCalendar.js's
      // createEvent -> POST /calendar/events) -- this is not a second,
      // parallel way of writing events, just a second caller of the one
      // that already exists and is already trusted with Dylan's real
      // iCloud calendar.
      await request('/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: pending.title,
          start: pending.start,
          end: pending.end,
          allDay: pending.allDay,
          location: pending.location,
          mode: pending.mode,
        }),
      })
      patchPendingEvent({ status: 'confirmed', error: null })
    } catch (error) {
      showError(error.message)
      patchPendingEvent({ status: 'pending', error: error.message })
    }
  }

  function cancelPendingEvent(index) {
    const threadKey = currentThreadKey
    setChatThreads((prev) => {
      const thread = prev[threadKey] || []
      const target = thread[index]
      if (!target?.pendingEvent) return prev
      const updated = [...thread]
      updated[index] = { ...target, pendingEvent: { ...target.pendingEvent, status: 'cancelled' } }
      return { ...prev, [threadKey]: updated }
    })
  }

  async function addHealthEntry(category, value, note = '', amount = null, date = null) {
    if (!value?.toString().trim()) return

    setSaving(true)

    try {
      await request('/health', {
        method: 'POST',
        body: JSON.stringify({ category, value: value.toString().trim(), note, amount, date }),
      })

      const fresh = await loadData()

      if (fresh) {
        const newStreak = healthLoggingStreak(fresh.health.entries)
        const milestone = hitMilestone(newStreak)
        if (milestone) {
          pushAchievement({
            kind: 'milestone',
            title: `${milestone}-DAY STREAK`,
            subtitle: 'Health logging',
          })
          maybePlaySound('milestone')
        }
      }

      showSuccess('Logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function setHealthGoal(category, goal) {
    try {
      await request('/health/goals', {
        method: 'POST',
        body: JSON.stringify({ category, goal }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteHealthEntry(id) {
    try {
      await request(`/health/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function addFinanceAccount(name, type, balance) {
    if (!name.trim() || balance === '' || balance === null || balance === undefined) return

    setSaving(true)

    try {
      await request('/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), type, balance: Number(balance) }),
      })

      await loadData()
      showSuccess('Account added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateFinanceBalance(id, balance) {
    if (balance === '' || balance === null || balance === undefined) return

    setSaving(true)

    try {
      await request(`/finance/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ balance: Number(balance) }),
      })

      const fresh = await loadData()
      maybeCelebrateNetWorthSwing(fresh)
      showSuccess('Balance updated.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteFinanceAccount(id) {
    try {
      await request(`/finance/accounts/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // type is 'income' | 'expense'; category is required for an expense
  // (ignored/normalized to 'income' on the backend for income) -- every
  // transaction actually moves accountId's real balance, so this is not a
  // separate ledger from the accounts Finance already tracks.
  async function addFinanceTransaction(accountId, type, category, amount, date, note = '') {
    if (!accountId || !amount) return

    setSaving(true)
    try {
      await request('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({ accountId, type, category, amount: Number(amount), date, note }),
      })

      const fresh = await loadData()
      maybeCelebrateNetWorthSwing(fresh)
      showSuccess(type === 'expense' ? 'Expense logged.' : 'Income logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteFinanceTransaction(id) {
    try {
      await request(`/finance/transactions/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Transaction deleted, balance reversed.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Bulk CSV import -- see routes/finance.js's own comment on why this,
  // not a live Fidelity connection, is what's actually buildable here.
  // Returns {imported, skipped} so the form can tell Dylan exactly how
  // many rows landed and show him which ones didn't parse, rather than a
  // single opaque success/failure for the whole batch.
  async function importFinanceTransactions(accountId, rows) {
    setSaving(true)
    try {
      const result = await request('/finance/transactions/import', {
        method: 'POST',
        body: JSON.stringify({ accountId, transactions: rows }),
      })
      const fresh = await loadData()
      maybeCelebrateNetWorthSwing(fresh)
      showSuccess(
        result.skipped?.length
          ? `Imported ${result.imported}, skipped ${result.skipped.length}.`
          : `Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}.`
      )
      return result
    } catch (error) {
      showError(error.message)
      return { imported: 0, skipped: [] }
    } finally {
      setSaving(false)
    }
  }

  // monthlyLimit of 0/empty clears that category's budget entirely rather
  // than saving a zero limit -- see routes/finance.js.
  async function setFinanceBudget(category, monthlyLimit) {
    try {
      await request('/finance/budgets', {
        method: 'POST',
        body: JSON.stringify({ category, monthlyLimit: Number(monthlyLimit) || 0 }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Trading: positions and a pre-trade watchlist, separate from the plain
  // account/transaction ledger above -- see routes/trading.js. Every
  // mutation reloads via bootstrap the same way the finance functions
  // above do, so tradingStats (sizing %, concentration flags, realized
  // P/L) is always recomputed server-side rather than duplicated here.
  async function addTradingPosition(ticker, shares, avgCost, thesis, invalidation, notes = '') {
    if (!ticker?.trim() || !shares || !avgCost || !thesis?.trim() || !invalidation?.trim()) return

    setSaving(true)
    try {
      await request('/trading/positions', {
        method: 'POST',
        body: JSON.stringify({
          ticker: ticker.trim(),
          shares: Number(shares),
          avgCost: Number(avgCost),
          thesis: thesis.trim(),
          invalidation: invalidation.trim(),
          notes,
        }),
      })

      await loadData()
      showSuccess(`${ticker.trim().toUpperCase()} added to your positions.`)
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateTradingPosition(id, updates) {
    setSaving(true)
    try {
      await request(`/trading/positions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      await loadData()
      showSuccess('Position updated.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function closeTradingPosition(id, exitPrice, lesson) {
    if (!exitPrice || !lesson?.trim()) return
    setSaving(true)
    try {
      await request(`/trading/positions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'closed', exitPrice: Number(exitPrice), lesson: lesson.trim() }),
      })
      await loadData()
      showSuccess('Position closed.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateTradingSettings(concentrationLimitPct) {
    const numericLimit = Number(concentrationLimitPct)
    if (!numericLimit || numericLimit <= 0 || numericLimit > 100) return

    setSaving(true)
    try {
      await request('/trading/settings', {
        method: 'PUT',
        body: JSON.stringify({ concentrationLimitPct: numericLimit }),
      })
      await loadData()
      showSuccess(`Concentration limit set to ${numericLimit}%.`)
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteTradingPosition(id) {
    try {
      await request(`/trading/positions/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function addWatchlistItem(ticker, thesis, catalyst = '', valuation = '') {
    if (!ticker?.trim() || !thesis?.trim()) return

    setSaving(true)
    try {
      await request('/trading/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ticker: ticker.trim(), thesis: thesis.trim(), catalyst, valuation }),
      })
      await loadData()
      showSuccess(`${ticker.trim().toUpperCase()} added to your watchlist.`)
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateWatchlistItem(id, updates) {
    setSaving(true)
    try {
      await request(`/trading/watchlist/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWatchlistItem(id) {
    try {
      await request(`/trading/watchlist/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function addSkill(name, unit) {
    if (!name?.toString().trim()) return

    setSaving(true)
    try {
      await request('/skills', {
        method: 'POST',
        body: JSON.stringify({ name: name.toString().trim(), unit: (unit || 'reps').toString().trim() }),
      })
      await loadData()
      showSuccess('Skill added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  // Logging practice was previously only possible by asking the AI to do
  // it (routes/chat.js's log_skill_practice action) -- there was no direct
  // button anywhere in SkillsPage itself, despite the backend
  // (POST /skills/sessions) fully supporting it. Real gap, not a design
  // choice; this is the direct manual path.
  async function addSkillSession(skillId, quantity, note = '') {
    if (!skillId || !quantity) return
    setSaving(true)
    try {
      await request('/skills/sessions', {
        method: 'POST',
        body: JSON.stringify({ skillId, quantity, note }),
      })
      // Real gap fixed here, not just new feature: detectSkillMilestones
      // previously only ran after an AI-chat action touched a skill, so
      // level-ups and badge unlocks earned through the normal "log
      // practice" button -- the actual everyday path -- never celebrated
      // at all. Same fix as the AI-chat call site: diff the pre-call
      // skills against loadData()'s freshly-returned ones.
      const previousSkills = skills
      const fresh = await loadData()
      if (fresh) {
        detectSkillMilestones(previousSkills, fresh.skills)
      }
      showSuccess('Practice logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeSkill(id) {
    try {
      await request(`/skills/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Skill removed.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function uploadSkillVideo(skillId, file, label) {
    if (!file) return

    setSaving(true)
    try {
      const params = new URLSearchParams({ label: label || file.name })
      const response = await fetch(`${API}/skills/${skillId}/videos?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file,
      })
      const responseData = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(responseData.error || 'Could not upload video')

      setSkills(responseData.skills || [])
      showSuccess('Video saved.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSkillVideo(videoId) {
    try {
      const responseData = await request(`/skills/videos/${videoId}`, { method: 'DELETE' })
      setSkills(responseData.skills || [])
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteSkillSession(id) {
    try {
      await request(`/skills/sessions/${id}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function saveMemory(content = memoryInput) {
    if (!content.trim()) return

    setSaving(true)

    try {
      await request('/memories', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim() }),
      })

      setMemoryInput('')
      setMemorySuggestion('')

      await loadData()

      showSuccess('Memory saved.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteMemory(id) {
    try {
      await request(`/memories/${id}`, { method: 'DELETE' })

      await loadData()

      showSuccess('Memory deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addTask() {
    if (!taskInput.trim()) return

    setSaving(true)

    try {
      await request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskInput.trim(),
          priority: taskPriority,
          dueDate: taskDueDate,
          reminder: taskReminder,
          completed: false,
        }),
      })

      setTaskInput('')
      setTaskDueDate('')
      setTaskReminder('none')

      await loadData()

      showSuccess('Task added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addSchoolTask() {
    if (!schoolInput.trim()) return

    setSaving(true)

    try {
      await request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: schoolInput.trim(),
          priority: 'medium',
          dueDate: schoolDueDate,
          reminder: 'none',
          completed: false,
          category: 'school',
        }),
      })

      setSchoolInput('')
      setSchoolDueDate('')

      await loadData()

      showSuccess('Assignment added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addClass() {
    if (!classNameInput.trim()) return
    setSaving(true)
    try {
      await request('/classes', {
        method: 'POST',
        body: JSON.stringify({ name: classNameInput.trim() }),
      })
      setClassNameInput('')
      await loadData()
      showSuccess('Class added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteClass(id) {
    try {
      await request(`/classes/${id}`, { method: 'DELETE' })
      if (selectedClassId === id) {
        setSelectedClassId(null)
      }
      await loadData()
      showSuccess('Class deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // updates is a partial: { name?, level?, excludeFromGpa? } -- level
  // drives the GPA weighting bonus (Honors +0.5, AP/IB +1.0), excludeFromGpa
  // is for non-academic periods (Study Hall, Lunch) that shouldn't factor
  // into GPA math at all.
  async function updateClass(id, updates) {
    try {
      await request(`/classes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function addAssignment() {
    if (!assignmentInput.trim() || !selectedClassId) return
    setSaving(true)
    try {
      await request('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          title: assignmentInput.trim(),
          dueDate: assignmentDueDate,
        }),
      })
      setAssignmentInput('')
      setAssignmentDueDate('')
      await loadData()
      showSuccess('Assignment added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAssignment(assignment) {
    try {
      const completing = !assignment.completed
      await request(`/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: completing }),
      })
      await loadData()

      if (completing) {
        pushToast({ kind: 'task', title: 'ASSIGNMENT DONE', message: assignment.title })
        awardXP('assignment-done')
      }
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteAssignment(id) {
    try {
      await request(`/assignments/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Assignment deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Grades come in after the fact, once it's graded — a separate edit
  // from toggling completion, same PUT endpoint (already merges
  // arbitrary fields, no backend change needed). Empty string clears it
  // back to ungraded rather than saving a bogus 0%.
  async function setAssignmentGrade(assignment, grade) {
    try {
      await request(`/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ grade: grade === '' ? null : Number(grade) }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // Category drives grade weighting (SchoolPage.jsx's classAverage) --
  // editable after creation since Dylan often won't know an assignment
  // matters more/less than its default until it's actually assigned.
  async function setAssignmentCategory(assignment, category) {
    try {
      await request(`/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ category }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function addTest() {
    if (!testInput.trim() || !selectedClassId) return
    setSaving(true)
    try {
      await request('/tests', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          title: testInput.trim(),
          date: testDate,
          topics: testTopics.trim(),
        }),
      })
      setTestInput('')
      setTestDate('')
      setTestTopics('')
      await loadData()
      showSuccess('Test added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  // Editing topics after the fact -- e.g. Dylan adds a test before he
  // knows exactly what's covered, then fills it in once the teacher
  // announces it. Regenerating the study plan afterward is what actually
  // pulls the new topics into the session details.
  async function setTestTopicsValue(test, topics) {
    try {
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ topics: (topics || '').trim() }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function toggleTest(test) {
    try {
      const completing = !test.completed
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: completing }),
      })
      await loadData()

      if (completing) {
        pushToast({ kind: 'task', title: 'TEST LOGGED', message: test.title })
        awardXP('test-logged')
      }
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteTest(id) {
    try {
      await request(`/tests/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Test deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  // Generates (or regenerates, replacing any existing plan for this test)
  // a research-backed study schedule as real Task entries -- see
  // lib/studyPlan.js server-side for the actual scheduling logic.
  async function generateStudyPlan(testId) {
    setSaving(true)
    try {
      const result = await request(`/tests/${testId}/study-plan`, { method: 'POST' })
      await loadData()
      showSuccess(`Study plan created -- ${result.tasks.length} session${result.tasks.length === 1 ? '' : 's'} added to your Tasks.`)
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function clearStudyPlan(testId) {
    try {
      await request(`/tests/${testId}/study-plan`, { method: 'DELETE' })
      await loadData()
      showSuccess('Study plan cleared.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function setTestGrade(test, grade) {
    try {
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ grade: grade === '' ? null : Number(grade) }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  // See setAssignmentCategory above -- same reasoning, Tests side.
  async function setTestCategory(test, category) {
    try {
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ category }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function toggleTask(task) {
    try {
      const completing = !task.completed
      await request(`/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: completing }),
      })

      await loadData()

      if (completing) {
        pushToast({ kind: 'task', title: 'DONE', message: task.title })
        awardXP('task-done')
        // A high-priority task is the "task/goal completion" trigger for
        // the Achievement layer -- every ordinary task still gets the
        // small toast above, so finishing routine tasks doesn't turn into
        // a wall of full-screen popups.
        if (task.priority === 'high') {
          pushAchievement({ kind: 'task', title: 'PRIORITY DONE', subtitle: task.title })
          maybePlaySound('achievement')
        }
      }
    } catch (error) {
      showError(error.message)
    }
  }

  async function updateTaskPriority(task, priority) {
    try {
      await request(`/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ priority }),
      })

      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteTask(id) {
    try {
      await request(`/tasks/${id}`, { method: 'DELETE' })

      await loadData()

      showSuccess('Task deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addGoal() {
    if (!goalInput.trim()) return

    setSaving(true)

    try {
      await request('/goals', {
        method: 'POST',
        body: JSON.stringify({
          title: goalInput.trim(),
          progress: 0,
          // Optional target date — this is what lets a goal show up on
          // the Calendar page at all; a goal with no date just never did.
          dueDate: goalDueDate || null,
        }),
      })

      setGoalInput('')
      setGoalDueDate('')

      await loadData()

      showSuccess('Goal created.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateGoal(goal, amount) {
    const progress = Math.max(0, Math.min(100, Number(goal.progress || 0) + amount))
    const justCompleted = progress >= 100 && Number(goal.progress || 0) < 100

    try {
      await request(`/goals/${goal.id}`, {
        method: 'PUT',
        body: JSON.stringify({ progress }),
      })

      await loadData()

      if (justCompleted) {
        pushAchievement({ kind: 'goal', title: 'GOAL COMPLETE', subtitle: goal.title })
        maybePlaySound('achievement')
        awardXP('goal-complete')
      }
    } catch (error) {
      showError(error.message)
    }
  }

  // Set or clear a goal's target date after the fact — separate from
  // updateGoal (which only ever adjusts progress) since this is a
  // different kind of edit with its own UI control on the goal card.
  async function updateGoalDueDate(goal, dueDate) {
    try {
      await request(`/goals/${goal.id}`, {
        method: 'PUT',
        body: JSON.stringify({ dueDate: dueDate || null }),
      })

      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteGoal(id) {
    try {
      await request(`/goals/${id}`, { method: 'DELETE' })

      await loadData()

      showSuccess('Goal deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addNote() {
    if (!noteInput.trim()) return

    setSaving(true)

    try {
      await request('/notes', {
        method: 'POST',
        body: JSON.stringify({ content: noteInput.trim() }),
      })

      setNoteInput('')

      await loadData()

      showSuccess('Note saved.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id) {
    try {
      await request(`/notes/${id}`, { method: 'DELETE' })

      await loadData()

      showSuccess('Note deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  const overviewCards = useMemo(() => {
    const schoolTotal = assignments.length + tests.length
    const schoolDone =
      assignments.filter((a) => a.completed).length +
      tests.filter((t) => t.completed).length

    const today = new Date().toDateString()
    const HEALTH_CATEGORIES = ['sleep', 'food', 'water', 'activity']
    const todaysHealthCategories = new Set(
      healthEntries
        .filter((entry) => new Date(entry.createdAt).toDateString() === today)
        .map((entry) => entry.category)
    )
    const healthLoggedToday = HEALTH_CATEGORIES.filter((category) =>
      todaysHealthCategories.has(category)
    ).length

    return LIFE_MODES.map((mode) => {
      if (mode.key === 'school') {
        return {
          ...mode,
          headline: classes.length
            ? `${classes.length} class${classes.length === 1 ? '' : 'es'} tracked`
            : mode.headline,
          metricValue: `${schoolDone} / ${schoolTotal}`,
          progress: schoolTotal ? Math.round((schoolDone / schoolTotal) * 100) : 0,
          isSetUp: classes.length > 0,
        }
      }

      if (mode.key === 'health') {
        return {
          ...mode,
          headline: healthEntries.length
            ? healthLoggedToday
              ? `${healthLoggedToday} of 4 logged today`
              : 'Nothing logged today'
            : mode.headline,
          metricValue: `${healthLoggedToday} / 4`,
          progress: Math.round((healthLoggedToday / 4) * 100),
          isSetUp: healthEntries.length > 0,
          streak: healthLoggingStreak(healthEntries),
        }
      }

      if (mode.key === 'finance') {
        const goal = 10000
        return {
          ...mode,
          headline: financeAccounts.length
            ? `Net worth: $${financeNetWorth.toLocaleString()}`
            : mode.headline,
          metricValue: `$${financeNetWorth.toLocaleString()}`,
          progress: goal ? Math.max(0, Math.min(100, Math.round((financeNetWorth / goal) * 100))) : 0,
          isSetUp: financeAccounts.length > 0,
        }
      }

      if (mode.key === 'sports') {
        const from = new Date()
        from.setDate(from.getDate() - 6)
        const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
        const now = new Date()
        const toKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const weekMinutes = sportsSessions
          .filter((s) => s.date >= fromKey && s.date <= toKey)
          .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0)
        const weekHours = Math.round((weekMinutes / 60) * 10) / 10
        const goalHours = 8
        const hasScheduleSet = Object.values(sportsSchedule || {}).some(Boolean)
        const sportLabel = sportsSettings?.sport?.trim()
        return {
          ...mode,
          // Deliberately NOT overriding `title` here -- the Sidebar nav
          // label and the Sports page's own <h1> both read straight from
          // LIFE_MODES/hardcoded text, not this computed card, so
          // renaming just the Overview card to "Football" would make the
          // app say three different things in three different places.
          // The sport name shows on the Sports page itself instead, where
          // Dylan actually sets it.
          subtitle: sportLabel ? `${sportLabel} -- practices, games, film` : mode.subtitle,
          headline: sportsSessions.length
            ? `${sportsSessions.length} session${sportsSessions.length === 1 ? '' : 's'} logged`
            : mode.headline,
          metricValue: `${weekHours}H / ${goalHours}H`,
          progress: Math.max(0, Math.min(100, Math.round((weekHours / goalHours) * 100))),
          isSetUp: sportsSessions.length > 0 || hasScheduleSet,
        }
      }

      if (mode.key === 'skills') {
        if (!skills.length) {
          return { ...mode, progress: 0, isSetUp: false }
        }
        const topSkill = skills.reduce((best, item) => (item.level > (best?.level || 0) ? item : best), null)
        const avgProgress = Math.round(
          (skills.reduce((sum, item) => sum + item.xpIntoLevel / item.xpForNextLevel, 0) / skills.length) * 100
        )
        return {
          ...mode,
          headline: `${skills.length} skill${skills.length === 1 ? '' : 's'} in training`,
          subtitle: `Top: ${topSkill.name}, Lv. ${topSkill.level}`,
          metricValue: `Lv. ${topSkill.level}`,
          progress: avgProgress,
          isSetUp: true,
          streak: Math.max(0, ...skills.map((item) => item.streak || 0)),
        }
      }

      if (mode.key === 'reading') {
        const now = new Date()
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const pagesToday = readingSessions
          .filter((sess) => sess.date === todayKey)
          .reduce((sum, sess) => sum + (Number(sess.pagesRead) || 0), 0)
        const goalPages = 10
        const currentlyReading = readingBooks.filter((b) => b.status === 'reading')
        return {
          ...mode,
          headline: currentlyReading.length
            ? `Reading: ${currentlyReading[0].title}${currentlyReading.length > 1 ? ` +${currentlyReading.length - 1} more` : ''}`
            : mode.headline,
          metricValue: `${pagesToday} / ${goalPages}`,
          progress: Math.max(0, Math.min(100, Math.round((pagesToday / goalPages) * 100))),
          isSetUp: readingBooks.length > 0,
        }
      }

      if (mode.key === 'mind') {
        const now = new Date()
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const activeHabits = mindHabits.filter((h) => h.active !== false)
        const doneToday = mindCompletions.filter((c) => c.date === todayKey).length
        const mindStreak = Math.max(
          0,
          ...activeHabits.map((habit) => habitCurrentStreak(mindCompletions, habit.id))
        )
        return {
          ...mode,
          headline: activeHabits.length ? `${activeHabits.length} habit${activeHabits.length === 1 ? '' : 's'} tracked` : mode.headline,
          metricValue: `${doneToday} / ${activeHabits.length}`,
          progress: activeHabits.length ? Math.max(0, Math.min(100, Math.round((doneToday / activeHabits.length) * 100))) : 0,
          isSetUp: mindHabits.length > 0,
          streak: mindStreak,
        }
      }

      if (mode.key === 'gym') {
        const from = new Date()
        from.setDate(from.getDate() - 6)
        const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
        const now = new Date()
        const toKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const sessionsThisWeek = new Set(
          gymLogs.filter((l) => l.date >= fromKey && l.date <= toKey).map((l) => l.date)
        ).size
        const plannedDays = Object.values(gymWeekPlan || {}).filter(Boolean).length
        const weeklyTarget = plannedDays || 4
        return {
          ...mode,
          headline: gymLogs.length
            ? `${sessionsThisWeek} session${sessionsThisWeek === 1 ? '' : 's'} this week`
            : mode.headline,
          metricValue: `${sessionsThisWeek} / ${weeklyTarget}`,
          progress: weeklyTarget
            ? Math.max(0, Math.min(100, Math.round((sessionsThisWeek / weeklyTarget) * 100)))
            : 0,
          isSetUp: gymLogs.length > 0 || gymExercises.length > 0 || plannedDays > 0,
        }
      }

      if (mode.key === 'family') {
        const from = new Date()
        from.setDate(from.getDate() - 6)
        const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
        const now = new Date()
        const toKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const weekMinutes = familyLog
          .filter((entry) => entry.type === 'checkin' && entry.date >= fromKey && entry.date <= toKey)
          .reduce((sum, entry) => sum + (Number(entry.minutesSpent) || 0), 0)
        const weekHours = Math.round((weekMinutes / 60) * 10) / 10
        const goalHours = Math.round(((familyGoals.weeklyMinutesGoal || 360) / 60) * 10) / 10
        return {
          ...mode,
          headline: familyMembers.length ? `${familyMembers.length} family member${familyMembers.length === 1 ? '' : 's'} tracked` : mode.headline,
          metricValue: `${weekHours}H / ${goalHours}H`,
          progress: Math.max(0, Math.min(100, Math.round((weekHours / goalHours) * 100))),
          isSetUp: familyMembers.length > 0 || familyLog.length > 0,
        }
      }

      return { ...mode, progress: 0, isSetUp: false }
    })
  }, [
    classes,
    assignments,
    tests,
    healthEntries,
    financeAccounts,
    financeNetWorth,
    skills,
    sportsSessions,
    sportsSchedule,
    sportsSettings,
    readingBooks,
    readingSessions,
    mindHabits,
    mindCompletions,
    familyMembers,
    familyLog,
    familyGoals,
    gymLogs,
    gymExercises,
    gymWeekPlan,
  ])

  const setUpCount = useMemo(
    () => overviewCards.filter((card) => card.isSetUp).length,
    [overviewCards]
  )

  const overviewEyebrow =
    setUpCount > 0
      ? `${setUpCount} OF ${LIFE_MODES.length} MODES ACTIVE`
      : 'NOTHING TRACKED YET'

  // "Home-base agent" panel on Overview -- a short, real, prioritized list
  // of what actually needs attention right now, computed from Dylan's own
  // data rather than a generic canned message. Deliberately conservative:
  // only fields with a reliable date format (tests' `date`, not
  // assignments'/tasks' free-text `dueDate`, which can be things like
  // "tomorrow night") are used for "overdue" claims, and a mode only ever
  // surfaces a nudge here once Dylan has actually started using it
  // (isSetUp-equivalent checks below) -- a brand-new, empty mode never
  // gets nagged from the home page.
  const dailyFocus = useMemo(() => {
    function isPastDate(dateString) {
      if (!dateString) return false
      const parsed = new Date(dateString)
      if (Number.isNaN(parsed.getTime())) return false
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      return parsed < startOfToday
    }

    const items = []

    const overdueTests = tests.filter((t) => !t.completed && isPastDate(t.date))
    if (overdueTests.length) {
      items.push({
        mode: 'school',
        urgent: true,
        text: `${overdueTests.length} test${overdueTests.length === 1 ? '' : 's'} overdue in School`,
      })
    }

    if (tradingStats?.anyOverConcentrated) {
      items.push({
        mode: 'finance',
        urgent: true,
        text: `A trading position is sized over your ${tradingStats.concentrationLimitPct}% risk limit`,
      })
    }

    const overdueHighPriorityTasks = tasks.filter(
      (t) => !t.completed && t.priority === 'high' && isPastDate(t.dueDate)
    )
    if (overdueHighPriorityTasks.length) {
      items.push({
        mode: null,
        urgent: true,
        text: `${overdueHighPriorityTasks.length} high-priority task${overdueHighPriorityTasks.length === 1 ? '' : 's'} overdue`,
      })
    }

    const activeHabits = mindHabits.filter((h) => h.active !== false)
    if (activeHabits.length) {
      const todayForHabits = todayKeyLocal()
      const doneToday = mindCompletions.filter((c) => c.date === todayForHabits).length
      if (doneToday < activeHabits.length) {
        items.push({
          mode: 'mind',
          urgent: false,
          text: `${activeHabits.length - doneToday} of ${activeHabits.length} daily habits not done yet`,
        })
      }
    }

    if (healthEntries.length) {
      const today = new Date().toDateString()
      const loggedToday = new Set(
        healthEntries.filter((entry) => new Date(entry.createdAt).toDateString() === today).map((entry) => entry.category)
      ).size
      if (loggedToday === 0) {
        items.push({ mode: 'health', urgent: false, text: 'Nothing logged in Health yet today' })
      }
    }

    if (readingBooks.some((b) => b.status === 'reading')) {
      const todayForReading = todayKeyLocal()
      const pagesToday = readingSessions
        .filter((s) => s.date === todayForReading)
        .reduce((sum, s) => sum + (Number(s.pagesRead) || 0), 0)
      if (pagesToday === 0) {
        items.push({ mode: 'reading', urgent: false, text: "Haven't logged today's reading pages yet" })
      }
    }

    // Urgent items first, then cap it -- this is meant to be a glance, not
    // another full list to read through.
    return items.sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 4)
  }, [tests, tradingStats, tasks, mindHabits, mindCompletions, healthEntries, readingBooks, readingSessions])

  const currentThreadKey = activeMode ? activeMode.key : 'general'
  const chatMessages = chatThreads[currentThreadKey] || []

  return {
    // navigation / ui state
    activePage,
    setActivePage,
    activeMode,
    modeFlashKey,
    loading,
    saving,
    errorMessage,
    successMessage,

    // chat (per-mode threads — chatMessages is whichever thread matches
    // the current page: a LIFE_MODES key, or 'general' everywhere else)
    message,
    setMessage,
    chatMessages,
    currentThreadKey,
    sendMessage,
    memorySuggestion,
    setMemorySuggestion,

    // search
    searchAll,

    // toasts (game-feel celebration layer)
    toasts,
    dismissToast,
    activeAchievement,
    dismissAchievement,
    maybePlaySound,
    playerStats,

    // settings
    settings,
    setSettings,

    // tasks
    tasks,
    taskInput,
    setTaskInput,
    taskPriority,
    setTaskPriority,
    taskDueDate,
    setTaskDueDate,
    taskReminder,
    setTaskReminder,
    addTask,
    toggleTask,
    updateTaskPriority,
    deleteTask,

    // school (dead code kept for fidelity)
    schoolInput,
    setSchoolInput,
    schoolDueDate,
    setSchoolDueDate,
    addSchoolTask,

    // school: classes / assignments / tests
    classes,
    assignments,
    tests,
    selectedClassId,
    setSelectedClassId,
    classNameInput,
    setClassNameInput,
    assignmentInput,
    setAssignmentInput,
    assignmentDueDate,
    setAssignmentDueDate,
    testInput,
    setTestInput,
    testDate,
    setTestDate,
    testTopics,
    setTestTopics,
    setTestTopicsValue,
    addClass,
    deleteClass,
    updateClass,
    addAssignment,
    toggleAssignment,
    setAssignmentGrade,
    setAssignmentCategory,
    deleteAssignment,
    addTest,
    toggleTest,
    setTestGrade,
    setTestCategory,
    deleteTest,
    generateStudyPlan,
    clearStudyPlan,

    // goals
    goals,
    goalInput,
    setGoalInput,
    goalDueDate,
    setGoalDueDate,
    addGoal,
    updateGoal,
    updateGoalDueDate,
    deleteGoal,

    // notes
    notes,
    noteInput,
    setNoteInput,
    addNote,
    deleteNote,

    // memories
    memories,
    memoryInput,
    setMemoryInput,
    saveMemory,
    deleteMemory,

    // health
    healthEntries,
    healthGoals,
    addHealthEntry,
    deleteHealthEntry,
    setHealthGoal,

    // finance
    financeAccounts,
    financeNetWorth,
    financeHistory,
    financeTransactions,
    financeBudgets,
    addFinanceAccount,
    updateFinanceBalance,
    deleteFinanceAccount,
    addFinanceTransaction,
    deleteFinanceTransaction,
    importFinanceTransactions,
    setFinanceBudget,

    // trading
    tradingPositions,
    tradingWatchlist,
    tradingStats,
    tradingSettings,
    addTradingPosition,
    updateTradingPosition,
    closeTradingPosition,
    deleteTradingPosition,
    addWatchlistItem,
    updateWatchlistItem,
    deleteWatchlistItem,
    updateTradingSettings,

    // skills
    skills,
    addSkill,
    addSkillSession,
    removeSkill,
    deleteSkillSession,
    uploadSkillVideo,
    deleteSkillVideo,

    // gym
    gymExercises,
    gymLogs,
    gymRoutines,
    gymWeekPlan,
    gymWeekPlanOverrides,
    gymDayNotes,
    gymSessions,
    gymRecurringEvents,
    addGymExercise,
    deleteGymExercise,
    updateGymExercise,
    addGymLog,
    deleteGymLog,
    addGymRoutine,
    updateGymRoutine,
    deleteGymRoutine,
    setGymWeekPlanDay,
    setGymWeekPlanOverride,
    setGymDayNote,
    addGymSession,
    deleteGymSession,
    addGymRecurringEvent,
    deleteGymRecurringEvent,
    // sports
    sportsSessions,
    sportsSchedule,
    sportsScheduleOverrides,
    sportsRecurringEvents,
    addSportsSession,
    deleteSportsSession,
    setSportsScheduleDay,
    setSportsScheduleOverride,
    sportsSettings,
    setSportsSport,
    addSportsRecurringEvent,
    deleteSportsRecurringEvent,

    // reading
    readingBooks,
    readingSessions,
    readingGoals,
    addReadingBook,
    updateReadingBook,
    deleteReadingBook,
    addReadingSession,
    setReadingGoal,

    // mind
    mindHabits,
    mindCompletions,
    mindReviews,
    mindDecisions,
    mindSkillXp,
    mindInsights,
    addMindHabit,
    updateMindHabit,
    deleteMindHabit,
    toggleMindCompletion,
    addMindReview,
    addMindDecision,
    updateMindDecision,

    // family
    familyMembers,
    familyLog,
    familyGoals,
    addFamilyMember,
    deleteFamilyMember,
    addFamilyLog,
    deleteFamilyLogEntry,
    setFamilyGoal,

    // chat streaming
    streamingText,

    // chat: real-calendar-event proposals
    confirmPendingEvent,
    cancelPendingEvent,

    // overview
    overviewCards,
    setUpCount,
    overviewEyebrow,
    dailyFocus,

    // Exposed so App.jsx's own top-level Canvas init effect can force a
    // full refresh after Canvas creates/links classes server-side
    // (routes/canvas.js's /sync-classes) -- this hook owns `classes`
    // state, and that state has no other way to learn about a change
    // made outside one of this hook's own CRUD functions.
    loadData,
  }
}
