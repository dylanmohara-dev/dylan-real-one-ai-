import { useEffect, useState } from 'react'
import './App.css'

const API = 'http://localhost:3001/api'

function App() {
  const [message, setMessage] = useState('')
  const [activePage, setActivePage] = useState('Chat')
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

  const [goalInput, setGoalInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [memoryInput, setMemoryInput] = useState('')

  const [memorySuggestion, setMemorySuggestion] = useState(null)

  function showSuccess(message) {
    setSuccessMessage(message)
    setErrorMessage('')

    setTimeout(() => {
      setSuccessMessage('')
    }, 2500)
  }

  function showError(message) {
    setErrorMessage(message)
    setSuccessMessage('')

    setTimeout(() => {
      setErrorMessage('')
    }, 4000)
  }

  async function request(url, options = {}) {
    const response = await fetch(url, options)

    let data = {}

    try {
      data = await response.json()
    } catch {
      data = {}
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Request failed with status ${response.status}`
      )
    }

    return data
  }

  async function loadData() {
    try {
      const [
        tasksData,
        goalsData,
        notesData,
        memoriesData,
      ] = await Promise.all([
        request(`${API}/tasks`),
        request(`${API}/goals`),
        request(`${API}/notes`),
        request(`${API}/memories`),
      ])

      setTasks(tasksData.tasks || [])
      setGoals(goalsData.goals || [])
      setNotes(notesData.notes || [])
      setMemories(memoriesData.memories || [])

      return true
    } catch (error) {
      console.error('Could not load Dylan AI data:', error)
      showError(
        'Could not connect to the Dylan AI server.'
      )
      return false
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // --------------------------------
  // CHAT
  // --------------------------------

  async function sendMessage(event) {
    event.preventDefault()

    if (!message.trim() || loading) return

    const userMessage = message.trim()

    const updatedMessages = [
      ...chatMessages,
      {
        role: 'user',
        content: userMessage,
      },
    ]

    setChatMessages(updatedMessages)
    setMessage('')
    setLoading(true)
    setMemorySuggestion(null)
    setErrorMessage('')

    try {
      const [chatData, memoryData] =
        await Promise.all([
          request(`${API}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: updatedMessages,
            }),
          }),

          request(`${API}/memory-check`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: userMessage,
            }),
          }),
        ])

      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            chatData.reply ||
            'No response from Dylan AI.',
        },
      ])

      // If Dylan AI performed an action,
      // immediately reload all saved data.
      if (chatData.actionPerformed) {
        await loadData()
      }

      if (
        memoryData.shouldSuggest &&
        memoryData.memory
      ) {
        setMemorySuggestion(memoryData.memory)
      }
    } catch (error) {
      console.error('Chat error:', error)

      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            'I could not complete that request.',
        },
      ])

      showError(error.message)
    } finally {
      setLoading(false)
    }
  }

  // --------------------------------
  // MEMORY
  // --------------------------------

  async function saveMemory(content) {
    if (!content?.trim()) {
      showError('Enter something to remember.')
      return
    }

    setSaving(true)

    try {
      const data = await request(
        `${API}/memories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: content.trim(),
          }),
        }
      )

      setMemories((current) => [
        ...current,
        data.memory,
      ])

      setMemorySuggestion(null)
      setMemoryInput('')

      showSuccess('Memory saved.')
    } catch (error) {
      console.error(error)
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addMemory(event) {
    event.preventDefault()
    await saveMemory(memoryInput)
  }

  async function deleteMemory(id) {
    try {
      await request(`${API}/memories/${id}`, {
        method: 'DELETE',
      })

      setMemories((current) =>
        current.filter(
          (memory) => memory.id !== id
        )
      )

      showSuccess('Memory forgotten.')
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  // --------------------------------
  // TASKS
  // --------------------------------

  async function addTask(event) {
    event.preventDefault()

    if (!taskInput.trim()) {
      showError('Enter a task first.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const data = await request(`${API}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: taskInput.trim(),
          priority: taskPriority,
          dueDate: taskDueDate,
          reminder: taskReminder,
          completed: false,
        }),
      })

      setTasks((current) => [
        ...current,
        data.task,
      ])

      setTaskInput('')
      setTaskPriority('medium')
      setTaskDueDate('')
      setTaskReminder('none')

      showSuccess('Task added.')
    } catch (error) {
      console.error('Could not save task:', error)
      showError(
        `Could not add task: ${error.message}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function updateTask(id, changes) {
    try {
      const data = await request(
        `${API}/tasks/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        }
      )

      setTasks((current) =>
        current.map((task) =>
          task.id === id ? data.task : task
        )
      )
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  async function toggleTask(id) {
    const task = tasks.find(
      (currentTask) => currentTask.id === id
    )

    if (!task) return

    await updateTask(id, {
      completed: !task.completed,
    })
  }

  async function changeTaskPriority(
    id,
    priority
  ) {
    await updateTask(id, { priority })
  }

  async function deleteTask(id) {
    try {
      await request(`${API}/tasks/${id}`, {
        method: 'DELETE',
      })

      setTasks((current) =>
        current.filter((task) => task.id !== id)
      )

      showSuccess('Task deleted.')
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  // --------------------------------
  // GOALS
  // --------------------------------

  async function addGoal(event) {
    event.preventDefault()

    if (!goalInput.trim()) {
      showError('Enter a goal first.')
      return
    }

    setSaving(true)

    try {
      const data = await request(`${API}/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: goalInput.trim(),
          progress: 0,
        }),
      })

      setGoals((current) => [
        ...current,
        data.goal,
      ])

      setGoalInput('')

      showSuccess('Goal added.')
    } catch (error) {
      console.error(error)
      showError(
        `Could not add goal: ${error.message}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function updateGoalProgress(
    id,
    amount
  ) {
    const goal = goals.find(
      (currentGoal) => currentGoal.id === id
    )

    if (!goal) return

    const progress = Math.max(
      0,
      Math.min(
        100,
        Number(goal.progress) + amount
      )
    )

    await updateGoal(id, { progress })
  }

  async function updateGoal(id, changes) {
    try {
      const data = await request(
        `${API}/goals/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        }
      )

      setGoals((current) =>
        current.map((goal) =>
          goal.id === id ? data.goal : goal
        )
      )
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  async function deleteGoal(id) {
    try {
      await request(`${API}/goals/${id}`, {
        method: 'DELETE',
      })

      setGoals((current) =>
        current.filter((goal) => goal.id !== id)
      )

      showSuccess('Goal deleted.')
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  // --------------------------------
  // NOTES
  // --------------------------------

  async function addNote(event) {
    event.preventDefault()

    if (!noteInput.trim()) {
      showError('Enter a note first.')
      return
    }

    setSaving(true)

    try {
      const data = await request(`${API}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: noteInput.trim(),
        }),
      })

      setNotes((current) => [
        ...current,
        data.note,
      ])

      setNoteInput('')

      showSuccess('Note saved.')
    } catch (error) {
      console.error(error)
      showError(
        `Could not save note: ${error.message}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id) {
    try {
      await request(`${API}/notes/${id}`, {
        method: 'DELETE',
      })

      setNotes((current) =>
        current.filter((note) => note.id !== id)
      )

      showSuccess('Note deleted.')
    } catch (error) {
      console.error(error)
      showError(error.message)
    }
  }

  // --------------------------------
  // NAVIGATION
  // --------------------------------

  const navigation = [
    { icon: '⌂', label: 'Chat' },
    { icon: '✓', label: 'Tasks' },
    { icon: '◎', label: 'Goals' },
    { icon: '▤', label: 'Notes' },
    { icon: '✦', label: 'Memory' },
    { icon: '◈', label: 'Life Areas' },
  ]

  // --------------------------------
  // CHAT PAGE
  // --------------------------------

  function renderChat() {
    return (
      <>
        <section className="messages">
          {chatMessages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✦</div>

              <h1>What can I help you with?</h1>

              <p>
                Your personal AI system for managing your life.
              </p>

              <div className="suggestions">
                <button
                  type="button"
                  onClick={() =>
                    setMessage(
                      'What should I focus on today?'
                    )
                  }
                >
                  What should I focus on today?
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMessage('Show me my goals')
                  }
                >
                  Show me my goals
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMessage(
                      'Help me organize my tasks'
                    )
                  }
                >
                  Help me organize my tasks
                </button>
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {chatMessages.map(
                (chatMessage, index) => (
                  <div
                    key={index}
                    className={`chat-message ${chatMessage.role}`}
                  >
                    <div className="chat-message-content">
                      {chatMessage.content}
                    </div>
                  </div>
                )
              )}

              {loading && (
                <div className="chat-message assistant">
                  <div className="chat-message-content">
                    <span className="typing-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {memorySuggestion && (
          <div className="memory-suggestion">
            <div>
              <strong>🧠 Remember this?</strong>
              <p>{memorySuggestion}</p>
            </div>

            <div className="memory-suggestion-actions">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  saveMemory(memorySuggestion)
                }
              >
                Remember
              </button>

              <button
                type="button"
                onClick={() =>
                  setMemorySuggestion(null)
                }
              >
                Not now
              </button>
            </div>
          </div>
        )}

        <form
          className="composer"
          onSubmit={sendMessage}
        >
          <input
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            placeholder="Message Dylan AI..."
            disabled={loading}
          />

          <button
            className="send-button"
            type="submit"
            disabled={
              !message.trim() || loading
            }
          >
            {loading ? '•••' : '↑'}
          </button>
        </form>

        <div className="disclaimer">
          Dylan AI can make mistakes. Check important information.
        </div>
      </>
    )
  }

  // --------------------------------
  // TASKS PAGE
  // --------------------------------

  function renderTasks() {
    const completedTasks = tasks.filter(
      (task) => task.completed
    ).length

    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>Tasks</h1>
            <p>
              {completedTasks} of {tasks.length} completed
            </p>
          </div>
        </div>

        <form
          className="task-add-form"
          onSubmit={addTask}
        >
          <input
            value={taskInput}
            onChange={(event) =>
              setTaskInput(event.target.value)
            }
            placeholder="Add a task..."
            disabled={saving}
          />

          <select
            value={taskPriority}
            onChange={(event) =>
              setTaskPriority(event.target.value)
            }
            disabled={saving}
          >
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          <input
            type="date"
            value={taskDueDate}
            onChange={(event) =>
              setTaskDueDate(event.target.value)
            }
            disabled={saving}
          />

          <select
            value={taskReminder}
            onChange={(event) =>
              setTaskReminder(event.target.value)
            }
            disabled={saving}
          >
            <option value="none">No reminder</option>
            <option value="15min">
              15 minutes before
            </option>
            <option value="1hour">
              1 hour before
            </option>
            <option value="tomorrow">
              Tomorrow
            </option>
          </select>

          <button
            type="submit"
            disabled={
              saving || !taskInput.trim()
            }
          >
            {saving ? 'Adding...' : '+ Add Task'}
          </button>
        </form>

        <div className="task-list">
          {tasks.length === 0 ? (
            <div className="empty-state">
              <span>✓</span>
              <h3>No tasks yet</h3>
              <p>Add your first task above.</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`task-card priority-${task.priority}`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(task.completed)}
                  onChange={() =>
                    toggleTask(task.id)
                  }
                />

                <div className="task-details">
                  <span
                    className={
                      task.completed
                        ? 'completed'
                        : ''
                    }
                  >
                    {task.title}
                  </span>

                  <small>
                    {task.priority === 'high' &&
                      '🔴 High'}

                    {task.priority === 'medium' &&
                      '🟡 Medium'}

                    {task.priority === 'low' &&
                      '🟢 Low'}

                    {task.dueDate &&
                      ` • Due ${task.dueDate}`}

                    {task.reminder &&
                      task.reminder !== 'none' &&
                      ` • ${task.reminder}`}
                  </small>
                </div>

                <select
                  value={task.priority}
                  onChange={(event) =>
                    changeTaskPriority(
                      task.id,
                      event.target.value
                    )
                  }
                >
                  <option value="high">🔴 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    deleteTask(task.id)
                  }
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  // --------------------------------
  // GOALS PAGE
  // --------------------------------

  function renderGoals() {
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>Goals</h1>
            <p>Track what you're working toward.</p>
          </div>
        </div>

        <form
          className="goal-add-form"
          onSubmit={addGoal}
        >
          <input
            value={goalInput}
            onChange={(event) =>
              setGoalInput(event.target.value)
            }
            placeholder="Add a goal..."
            disabled={saving}
          />

          <button
            type="submit"
            disabled={
              saving || !goalInput.trim()
            }
          >
            {saving ? 'Adding...' : '+ Add Goal'}
          </button>
        </form>

        <div className="goal-list">
          {goals.length === 0 ? (
            <div className="empty-state">
              <span>◎</span>
              <h3>No goals yet</h3>
              <p>Create a goal and start tracking it.</p>
            </div>
          ) : (
            goals.map((goal) => (
              <div
                key={goal.id}
                className="goal-card"
              >
                <h3>{goal.title}</h3>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${goal.progress}%`,
                    }}
                  />
                </div>

                <p>
                  {goal.progress}% complete
                </p>

                <button
                  type="button"
                  onClick={() =>
                    updateGoalProgress(
                      goal.id,
                      10
                    )
                  }
                >
                  +10%
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateGoalProgress(
                      goal.id,
                      -10
                    )
                  }
                >
                  -10%
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteGoal(goal.id)
                  }
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  // --------------------------------
  // NOTES PAGE
  // --------------------------------

  function renderNotes() {
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>Notes</h1>
            <p>Keep important information in one place.</p>
          </div>
        </div>

        <form
          className="note-add-form"
          onSubmit={addNote}
        >
          <textarea
            value={noteInput}
            onChange={(event) =>
              setNoteInput(event.target.value)
            }
            placeholder="Write a note..."
            disabled={saving}
          />

          <button
            type="submit"
            disabled={
              saving || !noteInput.trim()
            }
          >
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </form>

        <div className="note-list">
          {notes.length === 0 ? (
            <div className="empty-state">
              <span>▤</span>
              <h3>No notes yet</h3>
              <p>Save something important for later.</p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="note-card"
              >
                <p>{note.content}</p>

                <small>
                  {new Date(
                    note.createdAt
                  ).toLocaleDateString()}
                </small>

                <button
                  type="button"
                  onClick={() =>
                    deleteNote(note.id)
                  }
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  // --------------------------------
  // MEMORY PAGE
  // --------------------------------

  function renderMemory() {
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>Memory</h1>
            <p>
              Information Dylan AI has been approved to remember.
            </p>
          </div>
        </div>

        <form onSubmit={addMemory}>
          <input
            value={memoryInput}
            onChange={(event) =>
              setMemoryInput(event.target.value)
            }
            placeholder="Add something to remember..."
            disabled={saving}
          />

          <button
            type="submit"
            disabled={
              saving || !memoryInput.trim()
            }
          >
            {saving ? 'Saving...' : 'Save Memory'}
          </button>
        </form>

        <div className="memory-list">
          {memories.length === 0 ? (
            <div className="empty-state">
              <span>✦</span>
              <h3>No memories yet</h3>
              <p>
                Dylan AI will suggest memories when appropriate.
              </p>
            </div>
          ) : (
            memories.map((memory) => (
              <div
                key={memory.id}
                className="memory-card"
              >
                <p>{memory.content}</p>

                <button
                  type="button"
                  onClick={() =>
                    deleteMemory(memory.id)
                  }
                >
                  Forget
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  // --------------------------------
  // LIFE AREAS
  // --------------------------------

  function renderLifeAreas() {
    const areas = [
      ['🎓', 'School', 'Classes, assignments & studying'],
      ['🏈', 'Gym & Sports', 'Training, football & performance'],
      ['🥗', 'Nutrition', 'Food, habits & nutrition'],
      ['📈', 'Trading', 'Markets, watchlists & plans'],
      ['💼', 'Business', 'Ideas, projects & execution'],
      ['💰', 'Money', 'Saving, spending & investing'],
    ]

    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>Life Areas</h1>
            <p>Your life organized into systems.</p>
          </div>
        </div>

        <div className="life-area-grid">
          {areas.map(
            ([icon, title, description]) => (
              <button
                type="button"
                key={title}
                className="life-area-card"
                onClick={() => {
                  setActivePage('Chat')
                  setMessage(
                    `Help me with my ${title} life area.`
                  )
                }}
              >
                <span className="life-area-icon">
                  {icon}
                </span>

                <strong>{title}</strong>

                <small>{description}</small>
              </button>
            )
          )}
        </div>
      </section>
    )
  }

  function renderPage() {
    if (activePage === 'Chat') return renderChat()
    if (activePage === 'Tasks') return renderTasks()
    if (activePage === 'Goals') return renderGoals()
    if (activePage === 'Notes') return renderNotes()
    if (activePage === 'Memory') return renderMemory()
    if (activePage === 'Life Areas')
      return renderLifeAreas()

    return renderChat()
  }

  return (
    <div className="app">
      {errorMessage && (
        <div className="app-notification error">
          ⚠ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="app-notification success">
          ✓ {successMessage}
        </div>
      )}

      <aside className="sidebar">
        <div className="logo">
          <span>✦</span>
          <strong>Dylan AI</strong>
        </div>

        <nav>
          <div className="nav-section-title">
            WORKSPACE
          </div>

          {navigation.map((item) => (
            <button
              type="button"
              key={item.label}
              className={
                activePage === item.label
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() =>
                setActivePage(item.label)
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="settings-button"
          onClick={() =>
            showError(
              'Settings are being built next.'
            )
          }
        >
          ⚙ Settings
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <span>{activePage}</span>

          <div className="status">
            <span className="status-dot" />
            AI Online
          </div>
        </header>

        <div className="content">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

export default App