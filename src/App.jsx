import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutGrid,
  BookOpen,
  Globe,
  Dumbbell,
  Activity,
  TrendingUp,
  Star,
  Columns3,
  CheckCircle2,
  Users,
  Settings as SettingsIcon,
  Send,
  Bot,
} from 'lucide-react'
import './App.css'

const API = 'http://localhost:3001/api'

const DEFAULT_SETTINGS = {
  aiActions: true,
  memorySuggestions: true,
  appearance: 'dark',
  userName: 'Dylan',
  signatureTransitions: true,
  enterAnimation: 'wipe',
}

const LIFE_MODES = [
  {
    key: 'school',
    icon: BookOpen,
    title: 'School',
    rgb: '244, 196, 48',
    rgb2: '255, 157, 58',
    headline: 'No classes yet',
    subtitle: 'Homework, projects, tests',
    metricLabel: 'COURSEWORK',
    metricValue: '0 / 0',
    assistantMessage:
      "Tell me about your classes, homework, and tests — I'll help you organize School.",
    prompts: ['Add a new class', "What's due this week?"],
  },
  {
    key: 'sports',
    icon: Globe,
    title: 'Sports',
    rgb: '34, 197, 94',
    rgb2: '163, 230, 53',
    headline: 'No sessions logged',
    subtitle: 'Practice, games, film',
    metricLabel: 'WEEKLY HOURS',
    metricValue: '0H / 8H',
    assistantMessage:
      "Tell me about your practices and games — I'll help you track Sports.",
    prompts: ["Log today's practice", 'Plan my week of training'],
  },
  {
    key: 'gym',
    icon: Dumbbell,
    title: 'Gym',
    rgb: '249, 115, 22',
    rgb2: '239, 68, 68',
    headline: 'No workouts logged',
    subtitle: 'Schedule, type, weight per lift',
    metricLabel: 'SESSIONS',
    metricValue: '0 / 4',
    assistantMessage:
      "Tell me your split and schedule — I'll help you track Gym.",
    prompts: ['Log a workout', 'Build me a split'],
  },
  {
    key: 'health',
    icon: Activity,
    title: 'Health',
    rgb: '45, 212, 191',
    rgb2: '20, 184, 166',
    headline: 'Nothing logged today',
    subtitle: 'Sleep, food, drink, activity',
    metricLabel: 'DAILY LOG',
    metricValue: '0 / 4',
    assistantMessage:
      "Tell me about your sleep, food, and activity — I'll help you track Health.",
    prompts: ["Log today's sleep and meals", 'How am I doing this week?'],
  },
  {
    key: 'finance',
    icon: TrendingUp,
    title: 'Finance',
    rgb: '59, 130, 246',
    rgb2: '14, 165, 233',
    headline: 'No positions yet',
    subtitle: 'Trading and net worth',
    metricLabel: 'NET WORTH GOAL',
    metricValue: '—',
    assistantMessage:
      "Tell me about your positions and goals — I'll help you track Finance.",
    prompts: ['Log a trade', 'Check my net worth goal'],
  },
  {
    key: 'skills',
    icon: Star,
    title: 'Skills',
    rgb: '168, 85, 247',
    rgb2: '139, 92, 246',
    headline: 'No skill chosen',
    subtitle: 'One focus, tracked daily',
    metricLabel: 'PRACTISED',
    metricValue: '0 / 30 MIN',
    assistantMessage:
      "Tell me the skill you want to focus on — I'll help you track it daily.",
    prompts: ['Pick a skill to focus on', "Log today's practice"],
  },
  {
    key: 'reading',
    icon: Columns3,
    title: 'Reading',
    rgb: '244, 63, 94',
    rgb2: '236, 72, 153',
    headline: '0 pages today',
    subtitle: 'Goal of 10 pages a day',
    metricLabel: 'PAGES',
    metricValue: '0 / 10',
    assistantMessage:
      "Tell me what you're reading — I'll help you track your pages.",
    prompts: ["Log today's pages", 'Recommend what to read next'],
  },
  {
    key: 'discipline',
    icon: CheckCircle2,
    title: 'Discipline',
    rgb: '239, 68, 68',
    rgb2: '220, 38, 38',
    headline: 'No habits set',
    subtitle: 'Daily checklist, every day',
    metricLabel: 'TODAY',
    metricValue: '0 / 0',
    assistantMessage:
      "Tell me the habits you want to build — I'll help you track Discipline.",
    prompts: ['Set up my daily habits', "Did I complete today's checklist?"],
  },
  {
    key: 'family',
    icon: Users,
    title: 'Family',
    rgb: '99, 102, 241',
    rgb2: '59, 130, 246',
    headline: 'No family added',
    subtitle: 'Check-ins and time together',
    metricLabel: 'TIME THIS WEEK',
    metricValue: '0H / 6H',
    assistantMessage:
      "Tell me about your family — I'll help you track check-ins and time together.",
    prompts: ['Add a family member', 'Plan a family check-in'],
  },
]

const OVERVIEW_ASSISTANT_MESSAGE =
  "Nothing is tracked yet. Tell me what your week looks like and I'll set the modes up around it."
const OVERVIEW_PROMPTS = [
  'Set up my school classes',
  'What should I focus on this week?',
]

function App() {
  const [message, setMessage] = useState('')
  const [activePage, setActivePage] = useState('Overview')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [tasks, setTasks] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [goals, setGoals] = useState([])
  const [notes, setNotes] = useState([])
  const [memories, setMemories] = useState([])

  const [taskInput, setTaskInput] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskReminder, setTaskReminder] = useState('none')

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

  const [goalInput, setGoalInput] = useState('')
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

    const savedChat =
      localStorage.getItem('dylan-ai-chat')

    if (savedChat) {
      try {
        setChatMessages(
          JSON.parse(savedChat)
        )
      } catch {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'dylan-ai-settings',
      JSON.stringify(settings)
    )

    document.documentElement.dataset.theme =
      settings.appearance
  }, [settings])

  useEffect(() => {
    localStorage.setItem(
      'dylan-ai-chat',
      JSON.stringify(chatMessages)
    )
  }, [chatMessages])

  async function request(
    endpoint,
    options = {}
  ) {
    const response = await fetch(
      `${API}${endpoint}`,
      {
        headers: {
          'Content-Type':
            'application/json',
          ...(options.headers || {}),
        },
        ...options,
      }
    )

    const data =
      await response
        .json()
        .catch(() => ({}))

    if (!response.ok) {
      throw new Error(
        data.error ||
          'Something went wrong.'
      )
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
      ] = await Promise.all([
        request('/tasks'),
        request('/goals'),
        request('/notes'),
        request('/memories'),
        request('/classes'),
        request('/assignments'),
        request('/tests'),
      ])

      setTasks(taskData.tasks || [])
      setGoals(goalData.goals || [])
      setNotes(noteData.notes || [])
      setMemories(
        memoryData.memories || []
      )
      setClasses(classData.classes || [])
      setAssignments(assignmentData.assignments || [])
      setTests(testData.tests || [])
    } catch (error) {
      setErrorMessage(error.message)
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

  async function sendMessage(
    text = message
  ) {
    const trimmed = text.trim()

    if (!trimmed || loading) return

    const userMessage = {
      role: 'user',
      content: trimmed,
    }

    setChatMessages((prev) => [
      ...prev,
      userMessage,
    ])

    setMessage('')
    setLoading(true)
    setMemorySuggestion('')

    try {
      const chatResult =
        await request('/chat', {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              ...chatMessages,
              userMessage,
            ],
            settings: {
              allowActions:
                settings.aiActions,
            },
          }),
        })

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            chatResult.reply ||
            'No response from Dylan AI.',
        },
      ])

      if (chatResult.actionPerformed) {
        await loadData()
      }

      /*
        Only check memory after normal
        conversation.

        Direct commands from server.js
        return skipMemoryCheck: true.
      */

      if (
        settings.memorySuggestions &&
        !chatResult.skipMemoryCheck
      ) {
        try {
          const memoryResult =
            await request(
              '/memory-check',
              {
                method: 'POST',
                body: JSON.stringify({
                  message: trimmed,
                }),
              }
            )

          if (
            memoryResult.shouldSuggest
          ) {
            setMemorySuggestion(
              memoryResult.memory || ''
            )
          }
        } catch {
          // Memory suggestion errors do not
          // interrupt chat.
        }
      }
    } catch (error) {
      showError(error.message)

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I could not connect to the Dylan AI backend.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function saveMemory(
    content = memoryInput
  ) {
    if (!content.trim()) return

    setSaving(true)

    try {
      await request('/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
        }),
      })

      setMemoryInput('')
      setMemorySuggestion('')

      await loadData()

      showSuccess(
        'Memory saved.'
      )
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteMemory(id) {
    try {
      await request(
        `/memories/${id}`,
        {
          method: 'DELETE',
        }
      )

      await loadData()

      showSuccess(
        'Memory deleted.'
      )
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

      showSuccess(
        'Task added.'
      )
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

      showSuccess(
        'Assignment added.'
      )
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
        }),
      })
      setTestInput('')
      setTestDate('')
      await loadData()
      showSuccess('Test added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
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

  async function toggleTask(task) {
    try {
      await request(
        `/tasks/${task.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            completed:
              !task.completed,
          }),
        }
      )

      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function updateTaskPriority(
    task,
    priority
  ) {
    try {
      await request(
        `/tasks/${task.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            priority,
          }),
        }
      )

      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteTask(id) {
    try {
      await request(
        `/tasks/${id}`,
        {
          method: 'DELETE',
        }
      )

      await loadData()

      showSuccess(
        'Task deleted.'
      )
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
        }),
      })

      setGoalInput('')

      await loadData()

      showSuccess(
        'Goal created.'
      )
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateGoal(
    goal,
    amount
  ) {
    const progress = Math.max(
      0,
      Math.min(
        100,
        Number(
          goal.progress || 0
        ) + amount
      )
    )

    try {
      await request(
        `/goals/${goal.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            progress,
          }),
        }
      )

      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteGoal(id) {
    try {
      await request(
        `/goals/${id}`,
        {
          method: 'DELETE',
        }
      )

      await loadData()

      showSuccess(
        'Goal deleted.'
      )
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
        body: JSON.stringify({
          content:
            noteInput.trim(),
        }),
      })

      setNoteInput('')

      await loadData()

      showSuccess(
        'Note saved.'
      )
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id) {
    try {
      await request(
        `/notes/${id}`,
        {
          method: 'DELETE',
        }
      )

      await loadData()

      showSuccess(
        'Note deleted.'
      )
    } catch (error) {
      showError(error.message)
    }
  }

  const overviewCards = useMemo(() => {
    const schoolTotal = assignments.length + tests.length
    const schoolDone =
      assignments.filter((a) => a.completed).length +
      tests.filter((t) => t.completed).length

    return LIFE_MODES.map((mode) => {
      if (mode.key !== 'school') {
        return { ...mode, progress: 0, isSetUp: false }
      }

      return {
        ...mode,
        headline: classes.length
          ? `${classes.length} class${classes.length === 1 ? '' : 'es'} tracked`
          : mode.headline,
        metricValue: `${schoolDone} / ${schoolTotal}`,
        progress: schoolTotal
          ? Math.round((schoolDone / schoolTotal) * 100)
          : 0,
        isSetUp: classes.length > 0,
      }
    })
  }, [classes, assignments, tests])

  const setUpCount = useMemo(
    () => overviewCards.filter((card) => card.isSetUp).length,
    [overviewCards]
  )

  const overviewEyebrow =
    setUpCount > 0
      ? `${setUpCount} OF ${LIFE_MODES.length} MODES ACTIVE`
      : 'NOTHING TRACKED YET'

  function renderOverview() {
    return (
      <div className="overview-page">
        <div className="overview-header">
          <div>
            <span className="eyebrow">{overviewEyebrow}</span>
            <h1 className="serif">Welcome, {settings.userName || 'there'}</h1>
          </div>

          <div className="overview-stats">
            <div className="overview-stat">
              <span>Modes</span>
              <strong>{LIFE_MODES.length}</strong>
            </div>

            <div className="overview-stat">
              <span>Set Up</span>
              <strong>{setUpCount}</strong>
            </div>

            <div className="overview-stat">
              <span>Assistants</span>
              <strong>{LIFE_MODES.length}</strong>
            </div>
          </div>
        </div>

        <div className="overview-divider" />

        <div className="mode-grid">
          {overviewCards.map((card) => {
            const Icon = card.icon

            return (
              <button
                className="mode-card"
                key={card.key}
                style={{
                  '--card-rgb': card.rgb,
                  '--card-rgb2': card.rgb2,
                }}
                onClick={() => setActivePage(card.key)}
              >
                <div className="mode-card-top">
                  <span className="mode-card-label">
                    <Icon size={14} strokeWidth={2.25} />
                    {card.title}
                  </span>

                  <span className="mode-card-dot" />
                </div>

                <h3 className="serif">{card.headline}</h3>
                <p>{card.subtitle}</p>

                <div className="mode-card-metric">
                  <span>{card.metricLabel}</span>
                  <strong>{card.metricValue}</strong>
                </div>

                <div className="mode-progress-track">
                  <div
                    className="mode-progress-fill"
                    style={{ width: `${card.progress}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderModePage(modeKey) {
    const mode = LIFE_MODES.find((item) => item.key === modeKey)

    if (!mode) return null

    const Icon = mode.icon

    return (
      <div
        className="page mode-page"
        style={{
          '--card-rgb': mode.rgb,
          '--card-rgb2': mode.rgb2,
        }}
      >
        <div className="page-header">
          <div>
            <span className="eyebrow">{mode.title.toUpperCase()} MODE</span>
            <h1 className="serif">{mode.headline}</h1>
            <p>{mode.subtitle}</p>
          </div>

          <button onClick={() => setActivePage('Overview')}>
            ← Back to Overview
          </button>
        </div>

        <div className="mode-page-card">
          <div className="mode-card-top">
            <span className="mode-card-label">
              <Icon size={16} strokeWidth={2.25} />
              {mode.title}
            </span>
          </div>

          <div className="mode-card-metric">
            <span>{mode.metricLabel}</span>
            <strong>{mode.metricValue}</strong>
          </div>

          <div className="mode-progress-track">
            <div className="mode-progress-fill" style={{ width: '0%' }} />
          </div>
        </div>

        <p className="mode-page-note">
          More tools for {mode.title} are coming soon.
        </p>
      </div>
    )
  }

  function renderChat() {
    return (
      <div className="chat-page">
        <div className="chat-header">
          <div>
            <span className="eyebrow">
              AI ASSISTANT
            </span>

            <h1>
              What can I help you with?
            </h1>

            <p>
              Your personal AI system for
              managing your life.
            </p>
          </div>
        </div>

        <div className="chat-messages">
          {!chatMessages.length && (
            <div className="chat-welcome">
              <div className="welcome-icon">
                ✦
              </div>

              <h2>
                Your personal AI,
                <br />
                connected to your life.
              </h2>

              <p>
                Ask questions, organize your
                tasks, update goals, save notes,
                or manage your memories.
              </p>

              <div className="suggestion-grid">
                <button
                  onClick={() =>
                    sendMessage(
                      'What should I focus on today?'
                    )
                  }
                >
                  What should I focus on today?
                </button>

                <button
                  onClick={() =>
                    sendMessage(
                      'Show me my goals'
                    )
                  }
                >
                  Show me my goals
                </button>

                <button
                  onClick={() =>
                    sendMessage(
                      'Help me organize my tasks'
                    )
                  }
                >
                  Help me organize my tasks
                </button>
              </div>
            </div>
          )}

          {chatMessages.map(
            (chat, index) => (
              <div
                className={`chat-message ${chat.role}`}
                key={index}
              >
                <div className="message-avatar">
                  {chat.role === 'user'
                    ? 'D'
                    : '✦'}
                </div>

                <div className="message-bubble">
                  {chat.content}
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="chat-message assistant">
              <div className="message-avatar">
                ✦
              </div>

              <div className="message-bubble typing-dots">
                <span className="dotPulse">
                  •
                </span>
                <span className="dotPulse">
                  •
                </span>
                <span className="dotPulse">
                  •
                </span>
              </div>
            </div>
          )}
        </div>

        {memorySuggestion && (
          <div className="memory-suggestion">
            <div>
              <strong>
                Remember this?
              </strong>

              <p>
                {memorySuggestion}
              </p>
            </div>

            <div className="memory-actions">
              <button
                onClick={() =>
                  saveMemory(
                    memorySuggestion
                  )
                }
              >
                Save
              </button>

              <button
                onClick={() =>
                  setMemorySuggestion('')
                }
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="chat-composer">
          <textarea
            value={message}
            onChange={(event) =>
              setMessage(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Ask Dylan AI anything..."
          />

          <button
            onClick={() =>
              sendMessage()
            }
            disabled={
              loading ||
              !message.trim()
            }
          >
            ↑
          </button>
        </div>
      </div>
    )
  }

  function renderTasks() {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              PRODUCTIVITY
            </span>

            <h1>
              Tasks
            </h1>

            <p>
              Stay on top of what needs to get
              done.
            </p>
          </div>
        </div>

        <div className="form-card">
          <input
            value={taskInput}
            onChange={(event) =>
              setTaskInput(
                event.target.value
              )
            }
            placeholder="What needs to get done?"
          />

          <select
            value={taskPriority}
            onChange={(event) =>
              setTaskPriority(
                event.target.value
              )
            }
          >
            <option value="low">
              Low priority
            </option>

            <option value="medium">
              Medium priority
            </option>

            <option value="high">
              High priority
            </option>
          </select>

          <input
            type="date"
            value={taskDueDate}
            onChange={(event) =>
              setTaskDueDate(
                event.target.value
              )
            }
          />

          <select
            value={taskReminder}
            onChange={(event) =>
              setTaskReminder(
                event.target.value
              )
            }
          >
            <option value="none">
              No reminder
            </option>

            <option value="morning">
              Morning
            </option>

            <option value="evening">
              Evening
            </option>
          </select>

          <button
            onClick={addTask}
            disabled={
              saving ||
              !taskInput.trim()
            }
          >
            + Add Task
          </button>
        </div>

        <div className="items-list">
          {tasks.length ? (
            tasks
              .slice()
              .reverse()
              .map((task) => (
                <div
                  className={`item-card ${
                    task.completed
                      ? 'completed'
                      : ''
                  }`}
                  key={task.id}
                >
                  <button
                    className="check-button"
                    onClick={() =>
                      toggleTask(task)
                    }
                  >
                    {task.completed
                      ? '✓'
                      : ''}
                  </button>

                  <div className="item-content">
                    <strong>
                      {task.title}
                    </strong>

                    <div className="item-meta">
                      {task.dueDate && (
                        <span>
                          Due {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <select
                    value={
                      task.priority ||
                      'medium'
                    }
                    onChange={(event) =>
                      updateTaskPriority(
                        task,
                        event.target.value
                      )
                    }
                  >
                    <option value="low">
                      Low
                    </option>

                    <option value="medium">
                      Medium
                    </option>

                    <option value="high">
                      High
                    </option>
                  </select>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteTask(task.id)
                    }
                  >
                    ×
                  </button>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <div>✓</div>
              <h3>
                No tasks yet
              </h3>
              <p>
                Add your first task above.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderGoals() {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              PROGRESS
            </span>

            <h1>
              Goals
            </h1>

            <p>
              Turn long-term goals into visible
              progress.
            </p>
          </div>
        </div>

        <div className="form-card">
          <input
            value={goalInput}
            onChange={(event) =>
              setGoalInput(
                event.target.value
              )
            }
            placeholder="What is your goal?"
          />

          <button
            onClick={addGoal}
            disabled={
              saving ||
              !goalInput.trim()
            }
          >
            + Add Goal
          </button>
        </div>

        <div className="items-list">
          {goals.length ? (
            goals
              .slice()
              .reverse()
              .map((goal) => (
                <div
                  className="goal-card"
                  key={goal.id}
                >
                  <div className="goal-row">
                    <strong>
                      {goal.title}
                    </strong>

                    <span>
                      {goal.progress}%
                    </span>
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width:
                          `${goal.progress}%`,
                      }}
                    />
                  </div>

                  <div className="goal-controls">
                    <button
                      onClick={() =>
                        updateGoal(
                          goal,
                          -10
                        )
                      }
                    >
                      −10%
                    </button>

                    <button
                      onClick={() =>
                        updateGoal(
                          goal,
                          10
                        )
                      }
                    >
                      +10%
                    </button>

                    <button
                      className="delete-button"
                      onClick={() =>
                        deleteGoal(goal.id)
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <div>◎</div>
              <h3>
                No goals yet
              </h3>
              <p>
                Create a goal to start tracking
                progress.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderNotes() {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              KNOWLEDGE
            </span>

            <h1>
              Notes
            </h1>

            <p>
              Keep important thoughts and ideas
              in one place.
            </p>
          </div>
        </div>

        <div className="form-card note-form">
          <textarea
            value={noteInput}
            onChange={(event) =>
              setNoteInput(
                event.target.value
              )
            }
            placeholder="Write a note..."
          />

          <button
            onClick={addNote}
            disabled={
              saving ||
              !noteInput.trim()
            }
          >
            Save Note
          </button>
        </div>

        <div className="items-list">
          {notes.length ? (
            notes
              .slice()
              .reverse()
              .map((note) => (
                <div
                  className="item-card note-card"
                  key={note.id}
                >
                  <div className="item-content">
                    <p>
                      {note.content}
                    </p>

                    <span className="item-meta">
                      {new Date(
                        note.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteNote(note.id)
                    }
                  >
                    ×
                  </button>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <div>▤</div>
              <h3>
                No notes yet
              </h3>
              <p>
                Save something important.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderMemory() {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              PERSONAL CONTEXT
            </span>

            <h1>
              Memory
            </h1>

            <p>
              Control what Dylan AI remembers
              about you.
            </p>
          </div>
        </div>

        <div className="form-card">
          <input
            value={memoryInput}
            onChange={(event) =>
              setMemoryInput(
                event.target.value
              )
            }
            placeholder="Tell Dylan AI something to remember..."
          />

          <button
            onClick={() =>
              saveMemory()
            }
            disabled={
              saving ||
              !memoryInput.trim()
            }
          >
            Save Memory
          </button>
        </div>

        <div className="items-list">
          {memories.length ? (
            memories
              .slice()
              .reverse()
              .map((memory) => (
                <div
                  className="item-card"
                  key={memory.id}
                >
                  <div className="item-content">
                    <strong>
                      {memory.content}
                    </strong>

                    <span className="item-meta">
                      Saved{' '}
                      {new Date(
                        memory.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteMemory(
                        memory.id
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <div>✦</div>
              <h3>
                No memories yet
              </h3>
              <p>
                Dylan AI will ask before saving
                important personal information.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderSchool() {
    const classAssignments = (classId) =>
      assignments.filter((a) => a.classId === classId)

    const classTests = (classId) =>
      tests.filter((t) => t.classId === classId)

    if (!selectedClassId) {
      return (
        <div className="page school-page">
          <div className="page-header">
            <div>
              <span className="eyebrow">SCHOOL MODE</span>
              <h1 className="serif">School</h1>
              <p>Pick a class, or add a new one.</p>
            </div>
            <button onClick={() => setActivePage('Overview')}>
              ← Back to Overview
            </button>
          </div>

          <div className="form-card">
            <input
              value={classNameInput}
              onChange={(event) => setClassNameInput(event.target.value)}
              placeholder="Class name (e.g. AP History)"
            />
            <button onClick={addClass} disabled={saving || !classNameInput.trim()}>
              + Add Class
            </button>
          </div>

          <div className="items-list">
            {classes.length ? (
              classes.map((schoolClass) => (
                <div className="item-card" key={schoolClass.id}>
                  <div
                    className="item-content"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedClassId(schoolClass.id)}
                  >
                    <strong>{schoolClass.name}</strong>
                    <div className="item-meta">
                      <span>{classAssignments(schoolClass.id).length} assignments</span>
                      <span> · {classTests(schoolClass.id).length} tests</span>
                    </div>
                  </div>
                  <button className="delete-button" onClick={() => deleteClass(schoolClass.id)}>
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div>⌂</div>
                <h3>No classes yet</h3>
                <p>Add your first class above.</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    const activeClass = classes.find((c) => c.id === selectedClassId)
    const currentAssignments = classAssignments(selectedClassId)
    const currentTests = classTests(selectedClassId)

    return (
      <div className="page school-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">SCHOOL MODE</span>
            <h1 className="serif">{activeClass ? activeClass.name : 'Class'}</h1>
            <p>Assignments and tests for this class.</p>
          </div>
          <button onClick={() => setSelectedClassId(null)}>
            ← Back to Classes
          </button>
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <div className="panel-heading">
              <h2>Assignments</h2>
            </div>
            <div className="form-card">
              <input
                value={assignmentInput}
                onChange={(event) => setAssignmentInput(event.target.value)}
                placeholder="Assignment name"
              />
              <input
                type="date"
                value={assignmentDueDate}
                onChange={(event) => setAssignmentDueDate(event.target.value)}
              />
              <button onClick={addAssignment} disabled={saving || !assignmentInput.trim()}>
                + Add
              </button>
            </div>
            <div className="items-list">
              {currentAssignments.length ? (
                currentAssignments.map((assignment) => (
                  <div
                    className={`item-card ${assignment.completed ? 'completed' : ''}`}
                    key={assignment.id}
                  >
                    <button className="check-button" onClick={() => toggleAssignment(assignment)}>
                      {assignment.completed ? '✓' : ''}
                    </button>
                    <div className="item-content">
                      <strong>{assignment.title}</strong>
                      <div className="item-meta">
                        {assignment.dueDate && <span>Due {assignment.dueDate}</span>}
                      </div>
                    </div>
                    <button className="delete-button" onClick={() => deleteAssignment(assignment.id)}>
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="mini-empty">No assignments yet.</div>
              )}
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <h2>Tests</h2>
            </div>
            <div className="form-card">
              <input
                value={testInput}
                onChange={(event) => setTestInput(event.target.value)}
                placeholder="Test name"
              />
              <input
                type="date"
                value={testDate}
                onChange={(event) => setTestDate(event.target.value)}
              />
              <button onClick={addTest} disabled={saving || !testInput.trim()}>
                + Add
              </button>
            </div>
            <div className="items-list">
              {currentTests.length ? (
                currentTests.map((test) => (
                  <div
                    className={`item-card ${test.completed ? 'completed' : ''}`}
                    key={test.id}
                  >
                    <button className="check-button" onClick={() => toggleTest(test)}>
                      {test.completed ? '✓' : ''}
                    </button>
                    <div className="item-content">
                      <strong>{test.title}</strong>
                      <div className="item-meta">
                        {test.date && <span>Date {test.date}</span>}
                      </div>
                    </div>
                    <button className="delete-button" onClick={() => deleteTest(test.id)}>
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="mini-empty">No tests yet.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }


  function renderSettings() {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              CONTROL CENTER
            </span>

            <h1>
              Settings
            </h1>

            <p>
              Control how Dylan AI behaves.
            </p>
          </div>
        </div>

        <div className="settings-list">
          <div className="settings-card">
            <div>
              <strong>
                AI Actions
              </strong>

              <p>
                Allow Dylan AI to create,
                update, and delete tasks,
                goals, notes, and memories.
              </p>
            </div>

            <button
              className={`toggle ${
                settings.aiActions
                  ? 'on'
                  : ''
              }`}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  aiActions:
                    !prev.aiActions,
                }))
              }
            >
              <span />
            </button>
          </div>

          <div className="settings-card">
            <div>
              <strong>
                Memory Suggestions
              </strong>

              <p>
                Let Dylan AI suggest useful
                personal memories before saving
                them.
              </p>
            </div>

            <button
              className={`toggle ${
                settings.memorySuggestions
                  ? 'on'
                  : ''
              }`}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  memorySuggestions:
                    !prev.memorySuggestions,
                }))
              }
            >
              <span />
            </button>
          </div>

          <div className="settings-note">
            <strong>
              Your data stays local.
            </strong>

            <p>
              Dylan AI currently stores your
              tasks, goals, notes, and memories
              locally in your app.
            </p>
          </div>
        </div>

        <div className="classic-tools">
          <span className="eyebrow">CLASSIC TOOLS</span>
          <p className="classic-tools-note">
            The general Tasks, Goals, Notes, Memory, and Chat views still
            work — they're just tucked away here now that the sidebar
            focuses on life modes.
          </p>

          <div className="classic-tools-grid">
            <button onClick={() => setActivePage('Tasks')}>Tasks</button>
            <button onClick={() => setActivePage('Goals')}>Goals</button>
            <button onClick={() => setActivePage('Notes')}>Notes</button>
            <button onClick={() => setActivePage('Memory')}>Memory</button>
            <button onClick={() => setActivePage('Chat')}>Chat</button>
          </div>
        </div>
      </div>
    )
  }

  function renderPage() {
    if (activePage === 'Overview') return renderOverview()
    if (activePage === 'Chat') return renderChat()
    if (activePage === 'Tasks') return renderTasks()
    if (activePage === 'Goals') return renderGoals()
    if (activePage === 'Notes') return renderNotes()
    if (activePage === 'Memory') return renderMemory()
    if (activePage === 'school') return renderSchool()
    if (activePage === 'Settings') return renderSettings()

    if (LIFE_MODES.some((mode) => mode.key === activePage)) {
      return renderModePage(activePage)
    }

    return renderOverview()
  }

  const iconNav = [
    { key: 'Overview', label: 'Overview', icon: LayoutGrid },
    ...LIFE_MODES.map((mode) => ({
      key: mode.key,
      label: mode.title,
      icon: mode.icon,
    })),
  ]

  const assistantContext = activeMode
    ? {
        title: activeMode.title,
        message: activeMode.assistantMessage,
        prompts: activeMode.prompts,
      }
    : {
        title: 'Overview',
        message: OVERVIEW_ASSISTANT_MESSAGE,
        prompts: OVERVIEW_PROMPTS,
      }

  const userInitial = (settings.userName || 'D').trim().charAt(0).toUpperCase()

  return (
    <div className="app-root">
      {settings.signatureTransitions && settings.enterAnimation !== 'none' && (
        <div
          key={modeFlashKey}
          className={`mode-flash anim-${settings.enterAnimation}`}
        />
      )}

      <header className="top-settings-bar">
        <div className="top-settings-group">
          <label>Name</label>
          <input
            className="top-settings-name"
            value={settings.userName}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                userName: event.target.value,
              }))
            }
            placeholder="Your name"
          />
        </div>

        <div className="top-settings-group">
          <label>Theme</label>
          <select
            value={settings.appearance}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                appearance: event.target.value,
              }))
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className="top-settings-group">
          <label>Transitions</label>
          <button
            className={`toggle ${settings.signatureTransitions ? 'on' : ''}`}
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                signatureTransitions: !prev.signatureTransitions,
              }))
            }
          >
            <span />
          </button>
        </div>

        <div className="top-settings-group">
          <label>Enter Animation</label>
          <select
            value={settings.enterAnimation}
            disabled={!settings.signatureTransitions}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                enterAnimation: event.target.value,
              }))
            }
          >
            <option value="wipe">Wipe</option>
            <option value="fade">Fade</option>
            <option value="none">None</option>
          </select>
        </div>
      </header>

      <div
        className={`app-shell ${activeMode ? `theme-${activeMode.key}` : ''}`}
      >
        <aside className="sidebar">
          <div className="sidebar-avatar-row">
            <div className="user-avatar">{userInitial}</div>
          </div>

          <nav className="icon-nav">
            {iconNav.map((item) => {
              const Icon = item.icon
              const isActive = activePage === item.key

              return (
                <button
                  key={item.key}
                  className={`icon-nav-button ${isActive ? 'active' : ''}`}
                  title={item.label}
                  onClick={() => setActivePage(item.key)}
                >
                  <Icon size={18} strokeWidth={2} />
                </button>
              )
            })}
          </nav>

          <button
            className={`icon-nav-button gear ${
              activePage === 'Settings' ? 'active' : ''
            }`}
            title="Settings"
            onClick={() => setActivePage('Settings')}
          >
            <SettingsIcon size={18} strokeWidth={2} />
          </button>

          <div className="sidebar-user-footer">
            <div className="user-avatar small">{userInitial}</div>
            <span>{settings.userName || 'Dylan'}</span>
          </div>

          <div className="assistant-panel">
            <div className="assistant-header">
              <div className="assistant-bot-icon">
                <Bot size={16} strokeWidth={2} />
              </div>

              <div>
                <strong>Life assistant</strong>
                <span className="assistant-subtitle">
                  <span className="assistant-dot" />
                  OWN CONTEXT
                </span>
              </div>
            </div>

            <div className="assistant-bubble">{assistantContext.message}</div>

            <div className="assistant-pills">
              {assistantContext.prompts.map((prompt) => (
                <button
                  key={prompt}
                  className="assistant-pill"
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="assistant-input-row">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendMessage()
              }}
              placeholder={`Message ${assistantContext.title}...`}
            />

            <button
              className="assistant-send"
              onClick={() => sendMessage()}
              disabled={loading || !message.trim()}
            >
              <Send size={16} strokeWidth={2.25} />
            </button>
          </div>
        </aside>

        <main className="main-content">
          {(errorMessage || successMessage) && (
            <div
              className={`app-notification ${
                errorMessage ? 'error' : 'success'
              }`}
            >
              {errorMessage || successMessage}
            </div>
          )}

          <div className="content">{renderPage()}</div>

          <footer>
            Dylan AI can make mistakes. Check important information.
          </footer>
        </main>
      </div>
    </div>
  )
}

export default App