import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, LIFE_MODES } from '../data/lifeModes.js'

const API = 'http://localhost:3001/api'

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
  const [financeAccounts, setFinanceAccounts] = useState([])
  const [financeNetWorth, setFinanceNetWorth] = useState(0)
  const [financeHistory, setFinanceHistory] = useState([])
  const [skills, setSkills] = useState([])
  const [gymExercises, setGymExercises] = useState([])
  const [gymLogs, setGymLogs] = useState([])
  const [gymRoutines, setGymRoutines] = useState([])
  const [gymWeekPlan, setGymWeekPlan] = useState({})
  const [sportsSessions, setSportsSessions] = useState([])
  const [sportsSchedule, setSportsSchedule] = useState({})
  const [sportsSettings, setSportsSettings] = useState({ sport: '' })
  const [toasts, setToasts] = useState([])

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

  async function loadData() {
    try {
      const [
        taskData,
        goalData,
        noteData,
        memoryData,
        classData,
        assignmentData,
        testData,
        healthData,
        financeData,
        skillsData,
        gymExerciseData,
        gymLogData,
        gymRoutineData,
        gymWeekPlanData,
        sportsSessionData,
        sportsScheduleData,
        sportsSettingsData,
      ] = await Promise.all([
        request('/tasks'),
        request('/goals'),
        request('/notes'),
        request('/memories'),
        request('/classes'),
        request('/assignments'),
        request('/tests'),
        request('/health'),
        request('/finance'),
        request('/skills'),
        request('/gym/exercises'),
        request('/gym/logs'),
        request('/gym/routines'),
        request('/gym/week-plan'),
        request('/sports/sessions'),
        request('/sports/schedule'),
        request('/sports/settings'),
      ])

      setTasks(taskData.tasks || [])
      setGoals(goalData.goals || [])
      setNotes(noteData.notes || [])
      setMemories(memoryData.memories || [])
      setClasses(classData.classes || [])
      setAssignments(assignmentData.assignments || [])
      setTests(testData.tests || [])
      setHealthEntries(healthData.entries || [])
      setFinanceAccounts(financeData.accounts || [])
      setFinanceNetWorth(financeData.netWorth || 0)
      setFinanceHistory(financeData.history || [])
      setSkills(skillsData.skills || [])
      setGymExercises(gymExerciseData.exercises || [])
      setGymLogs(gymLogData.logs || [])
      setGymRoutines(gymRoutineData.routines || [])
      setGymWeekPlan(gymWeekPlanData.weekPlan || {})
      setSportsSessions(sportsSessionData.sessions || [])
      setSportsSchedule(sportsScheduleData.schedule || {})
      setSportsSettings(sportsSettingsData.settings || { sport: '' })

      return { skills: skillsData.skills || [], goals: goalData.goals || [] }
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
      }

      const newBadges = (nextSkill.badges || []).slice(prevBadgeCount)
      newBadges.forEach((badge) => {
        pushToast({
          kind: 'badge',
          title: 'BADGE UNLOCKED',
          message: badge.label,
        })
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
      }
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
        pushToast({
          kind: 'pr',
          title: 'NEW PR',
          message: `${exerciseName}: ${newBestWeight} lbs`,
        })
      } else if (priorLogs.length > 0 && newBest1RM > priorBest1RM) {
        pushToast({
          kind: 'pr',
          title: 'NEW EST. 1RM',
          message: `${exerciseName}: ~${Math.round(newBest1RM)} lbs`,
        })
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

    try {
      const chatResult = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [...priorMessages, userMessage],
          settings: {
            allowActions: settings.aiActions,
          },
          mode: threadKey,
          image: imageDataUrl || undefined,
        }),
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
          },
        ],
      }))

      if (chatResult.actionPerformed) {
        const previousSkills = skills
        const previousGoals = goals
        const fresh = await loadData()
        if (fresh) {
          detectSkillMilestones(previousSkills, fresh.skills)
          detectGoalMilestones(previousGoals, fresh.goals)
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
    }
  }

  async function addHealthEntry(category, value, note = '') {
    if (!value?.toString().trim()) return

    setSaving(true)

    try {
      await request('/health', {
        method: 'POST',
        body: JSON.stringify({ category, value: value.toString().trim(), note }),
      })

      await loadData()

      showSuccess('Logged.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
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

      await loadData()
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
      await request(`/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !assignment.completed }),
      })
      await loadData()
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
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !test.completed }),
      })
      await loadData()
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
        pushToast({ kind: 'goal', title: 'GOAL COMPLETE', message: goal.title })
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
        }
      }

      return { ...mode, progress: 0, isSetUp: false }
    })
  }, [classes, assignments, tests, healthEntries, financeAccounts, financeNetWorth, skills, sportsSessions, sportsSchedule, sportsSettings])

  const setUpCount = useMemo(
    () => overviewCards.filter((card) => card.isSetUp).length,
    [overviewCards]
  )

  const overviewEyebrow =
    setUpCount > 0
      ? `${setUpCount} OF ${LIFE_MODES.length} MODES ACTIVE`
      : 'NOTHING TRACKED YET'

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

    // toasts (game-feel celebration layer)
    toasts,
    dismissToast,

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
    deleteAssignment,
    addTest,
    toggleTest,
    setTestGrade,
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
    addHealthEntry,
    deleteHealthEntry,

    // finance
    financeAccounts,
    financeNetWorth,
    financeHistory,
    addFinanceAccount,
    updateFinanceBalance,
    deleteFinanceAccount,

    // skills
    skills,
    addSkill,
    removeSkill,
    deleteSkillSession,
    uploadSkillVideo,
    deleteSkillVideo,

    // gym
    gymExercises,
    gymLogs,
    gymRoutines,
    gymWeekPlan,
    addGymExercise,
    deleteGymExercise,
    addGymLog,
    deleteGymLog,
    addGymRoutine,
    updateGymRoutine,
    deleteGymRoutine,
    setGymWeekPlanDay,
    // sports
    sportsSessions,
    sportsSchedule,
    addSportsSession,
    deleteSportsSession,
    setSportsScheduleDay,
    sportsSettings,
    setSportsSport,

    // overview
    overviewCards,
    setUpCount,
    overviewEyebrow,
  }
}
