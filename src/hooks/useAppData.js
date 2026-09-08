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
  const [chatMessages, setChatMessages] = useState([])
  const [goals, setGoals] = useState([])
  const [notes, setNotes] = useState([])
  const [memories, setMemories] = useState([])

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

    const savedChat = localStorage.getItem('dylan-ai-chat')

    if (savedChat) {
      try {
        setChatMessages(JSON.parse(savedChat))
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('dylan-ai-settings', JSON.stringify(settings))

    document.documentElement.dataset.theme = settings.appearance
  }, [settings])

  useEffect(() => {
    localStorage.setItem('dylan-ai-chat', JSON.stringify(chatMessages))
  }, [chatMessages])

  async function request(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })

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
      setMemories(memoryData.memories || [])
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

  async function sendMessage(text = message) {
    const trimmed = text.trim()

    if (!trimmed || loading) return

    const userMessage = { role: 'user', content: trimmed }

    setChatMessages((prev) => [...prev, userMessage])

    setMessage('')
    setLoading(true)
    setMemorySuggestion('')

    try {
      const chatResult = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [...chatMessages, userMessage],
          settings: {
            allowActions: settings.aiActions,
          },
        }),
      })

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: chatResult.reply || 'No response from Dylan AI.',
        },
      ])

      if (chatResult.actionPerformed) {
        await loadData()
      }

      /*
        Only check memory after normal conversation.
        Direct commands from server.js return skipMemoryCheck: true.
      */

      if (settings.memorySuggestions && !chatResult.skipMemoryCheck) {
        try {
          const memoryResult = await request('/memory-check', {
            method: 'POST',
            body: JSON.stringify({ message: trimmed }),
          })

          if (memoryResult.shouldSuggest) {
            setMemorySuggestion(memoryResult.memory || '')
          }
        } catch {
          // Memory suggestion errors do not interrupt chat.
        }
      }
    } catch (error) {
      showError(error.message)

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I could not connect to the Dylan AI backend.',
        },
      ])
    } finally {
      setLoading(false)
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
      await request(`/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !task.completed }),
      })

      await loadData()
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
        }),
      })

      setGoalInput('')

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

    try {
      await request(`/goals/${goal.id}`, {
        method: 'PUT',
        body: JSON.stringify({ progress }),
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
        progress: schoolTotal ? Math.round((schoolDone / schoolTotal) * 100) : 0,
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

    // chat
    message,
    setMessage,
    chatMessages,
    sendMessage,
    memorySuggestion,
    setMemorySuggestion,

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
    addClass,
    deleteClass,
    addAssignment,
    toggleAssignment,
    deleteAssignment,
    addTest,
    toggleTest,
    deleteTest,

    // goals
    goals,
    goalInput,
    setGoalInput,
    addGoal,
    updateGoal,
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

    // overview
    overviewCards,
    setUpCount,
    overviewEyebrow,
  }
}
