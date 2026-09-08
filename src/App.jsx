import './App.css'
import { LayoutGrid, Lock, CalendarDays } from 'lucide-react'
import { useAppData } from './hooks/useAppData.js'
import { useJournal } from './hooks/useJournal.js'
import { useCalendar } from './hooks/useCalendar.js'
import { LIFE_MODES, OVERVIEW_ASSISTANT_MESSAGE, OVERVIEW_PROMPTS } from './data/lifeModes.js'
import TopSettingsBar from './components/TopSettingsBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import OverviewPage from './components/OverviewPage.jsx'
import ModePage from './components/ModePage.jsx'
import ChatPage from './components/ChatPage.jsx'
import TasksPage from './components/TasksPage.jsx'
import GoalsPage from './components/GoalsPage.jsx'
import NotesPage from './components/NotesPage.jsx'
import MemoryPage from './components/MemoryPage.jsx'
import SchoolPage from './components/SchoolPage.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import JournalPage from './components/JournalPage.jsx'
import HealthPage from './components/HealthPage.jsx'
import ModeBackground from './components/ModeBackground.jsx'
import ModeTransition from './components/ModeTransition.jsx'
import CalendarPage from './components/CalendarPage.jsx'

function App() {
  const data = useAppData()
  const journal = useJournal()
  const calendar = useCalendar()

  const {
    activePage,
    setActivePage,
    activeMode,
    modeFlashKey,
    loading,
    errorMessage,
    successMessage,
    message,
    setMessage,
    sendMessage,
    settings,
  } = data

  function renderPage() {
    if (activePage === 'Overview') {
      return (
        <OverviewPage
          overviewEyebrow={data.overviewEyebrow}
          userName={settings.userName}
          modesCount={LIFE_MODES.length}
          setUpCount={data.setUpCount}
          overviewCards={data.overviewCards}
          setActivePage={setActivePage}
        />
      )
    }

    if (activePage === 'Chat') {
      return (
        <ChatPage
          chatMessages={data.chatMessages}
          loading={loading}
          memorySuggestion={data.memorySuggestion}
          saveMemory={data.saveMemory}
          setMemorySuggestion={data.setMemorySuggestion}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
        />
      )
    }

    if (activePage === 'Tasks') {
      return (
        <TasksPage
          tasks={data.tasks}
          taskInput={data.taskInput}
          setTaskInput={data.setTaskInput}
          taskPriority={data.taskPriority}
          setTaskPriority={data.setTaskPriority}
          taskDueDate={data.taskDueDate}
          setTaskDueDate={data.setTaskDueDate}
          taskReminder={data.taskReminder}
          setTaskReminder={data.setTaskReminder}
          saving={data.saving}
          addTask={data.addTask}
          toggleTask={data.toggleTask}
          updateTaskPriority={data.updateTaskPriority}
          deleteTask={data.deleteTask}
        />
      )
    }

    if (activePage === 'Goals') {
      return (
        <GoalsPage
          goals={data.goals}
          goalInput={data.goalInput}
          setGoalInput={data.setGoalInput}
          saving={data.saving}
          addGoal={data.addGoal}
          updateGoal={data.updateGoal}
          deleteGoal={data.deleteGoal}
        />
      )
    }

    if (activePage === 'Notes') {
      return (
        <NotesPage
          notes={data.notes}
          noteInput={data.noteInput}
          setNoteInput={data.setNoteInput}
          saving={data.saving}
          addNote={data.addNote}
          deleteNote={data.deleteNote}
        />
      )
    }

    if (activePage === 'Memory') {
      return (
        <MemoryPage
          memories={data.memories}
          memoryInput={data.memoryInput}
          setMemoryInput={data.setMemoryInput}
          saving={data.saving}
          saveMemory={data.saveMemory}
          deleteMemory={data.deleteMemory}
        />
      )
    }

    if (activePage === 'school') {
      return (
        <SchoolPage
          classes={data.classes}
          assignments={data.assignments}
          tests={data.tests}
          selectedClassId={data.selectedClassId}
          setSelectedClassId={data.setSelectedClassId}
          classNameInput={data.classNameInput}
          setClassNameInput={data.setClassNameInput}
          assignmentInput={data.assignmentInput}
          setAssignmentInput={data.setAssignmentInput}
          assignmentDueDate={data.assignmentDueDate}
          setAssignmentDueDate={data.setAssignmentDueDate}
          testInput={data.testInput}
          setTestInput={data.setTestInput}
          testDate={data.testDate}
          setTestDate={data.setTestDate}
          saving={data.saving}
          addClass={data.addClass}
          deleteClass={data.deleteClass}
          addAssignment={data.addAssignment}
          toggleAssignment={data.toggleAssignment}
          deleteAssignment={data.deleteAssignment}
          addTest={data.addTest}
          toggleTest={data.toggleTest}
          deleteTest={data.deleteTest}
          setActivePage={setActivePage}
        />
      )
    }

    if (activePage === 'Settings') {
      return (
        <SettingsPage
          settings={settings}
          setSettings={data.setSettings}
          setActivePage={setActivePage}
        />
      )
    }

    if (activePage === 'Journal') {
      return <JournalPage journal={journal} />
    }

    if (activePage === 'Calendar') {
      return <CalendarPage calendar={calendar} />
    }

    if (activePage === 'health') {
      return (
        <HealthPage
          healthEntries={data.healthEntries}
          saving={data.saving}
          addHealthEntry={data.addHealthEntry}
          deleteHealthEntry={data.deleteHealthEntry}
        />
      )
    }

    if (LIFE_MODES.some((mode) => mode.key === activePage)) {
      return <ModePage modeKey={activePage} setActivePage={setActivePage} />
    }

    return (
      <OverviewPage
        overviewEyebrow={data.overviewEyebrow}
        userName={settings.userName}
        modesCount={LIFE_MODES.length}
        setUpCount={data.setUpCount}
        overviewCards={data.overviewCards}
        setActivePage={setActivePage}
      />
    )
  }

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

  const backgroundModeKey = activeMode
    ? activeMode.key
    : activePage === 'Journal'
      ? 'journal'
      : activePage === 'Calendar'
        ? 'calendar'
        : null

  const transitionMode = activeMode
    ? activeMode
    : activePage === 'Journal'
      ? { title: 'Journal', icon: Lock }
      : activePage === 'Calendar'
        ? { title: 'Calendar', icon: CalendarDays }
        : { title: 'Overview', icon: LayoutGrid }

  return (
    <div className="app-root">
      {settings.signatureTransitions && settings.enterAnimation !== 'none' && (
        <ModeTransition
          flashKey={modeFlashKey}
          animation={settings.enterAnimation}
          mode={transitionMode}
        />
      )}

      <TopSettingsBar settings={settings} setSettings={data.setSettings} />

      <div className={`app-shell ${activeMode ? `theme-${activeMode.key}` : activePage === 'Journal' ? 'theme-journal' : activePage === 'Calendar' ? 'theme-calendar' : ''}`}>
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          userInitial={userInitial}
          userName={settings.userName}
          assistantContext={assistantContext}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          loading={loading}
        />

        <main className="main-content">
          <ModeBackground modeKey={backgroundModeKey} />

          {(errorMessage || successMessage) && (
            <div className={`app-notification ${errorMessage ? 'error' : 'success'}`}>
              {errorMessage || successMessage}
            </div>
          )}

          <div className="content">{renderPage()}</div>

          <footer>Dylan AI can make mistakes. Check important information.</footer>
        </main>
      </div>
    </div>
  )
}

export default App
