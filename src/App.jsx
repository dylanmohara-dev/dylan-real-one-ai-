import './App.css'
import { useState } from 'react'
import { LayoutGrid, Lock, CalendarDays } from 'lucide-react'
import { useAppData } from './hooks/useAppData.js'
import { useJournal } from './hooks/useJournal.js'
import { useCalendar } from './hooks/useCalendar.js'
import { useGmail } from './hooks/useGmail.js'
import { useDrive } from './hooks/useDrive.js'
import { useSlack } from './hooks/useSlack.js'
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
import FinancePage from './components/FinancePage.jsx'
import SkillsPage from './components/SkillsPage.jsx'
import GymPage from './components/GymPage.jsx'
import ModeBackground from './components/ModeBackground.jsx'
import ModeTransition from './components/ModeTransition.jsx'
import CalendarPage from './components/CalendarPage.jsx'
import ConnectionsPage from './components/ConnectionsPage.jsx'
import ChatOverlay from './components/ChatOverlay.jsx'
import OnboardingWizard from './components/OnboardingWizard.jsx'
import GameToast from './components/GameToast.jsx'

function App() {
  const data = useAppData()
  const journal = useJournal()
  const calendar = useCalendar()
  const gmail = useGmail()
  const drive = useDrive()
  const slack = useSlack()
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false)
  const openChat = () => setChatOverlayOpen(true)

  function completeOnboarding({ name }) {
    // Write directly (and synchronously) to localStorage rather than relying on
    // setSettings + the settings-persisting effect — that effect runs on React's
    // next render, and the reload right below would race it, so the flag could
    // be lost and the wizard would come back on every load.
    const updated = {
      ...settings,
      onboardingComplete: true,
      userName: name || settings.userName,
    }
    localStorage.setItem('dylan-ai-settings', JSON.stringify(updated))
    window.location.reload()
  }

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
    toasts,
    dismissToast,
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
          openChat={openChat}
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
          goalDueDate={data.goalDueDate}
          setGoalDueDate={data.setGoalDueDate}
          saving={data.saving}
          addGoal={data.addGoal}
          updateGoal={data.updateGoal}
          updateGoalDueDate={data.updateGoalDueDate}
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
          setAssignmentGrade={data.setAssignmentGrade}
          deleteAssignment={data.deleteAssignment}
          addTest={data.addTest}
          toggleTest={data.toggleTest}
          setTestGrade={data.setTestGrade}
          deleteTest={data.deleteTest}
          setActivePage={setActivePage}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'Settings') {
      return (
        <SettingsPage
          settings={settings}
          setSettings={data.setSettings}
          setActivePage={setActivePage}
          openChat={openChat}
          calendar={calendar}
        />
      )
    }

    if (activePage === 'Journal') {
      return <JournalPage journal={journal} />
    }

    if (activePage === 'Calendar') {
      return <CalendarPage calendar={calendar} />
    }

    if (activePage === 'Connections') {
      return <ConnectionsPage gmail={gmail} drive={drive} slack={slack} />
    }

    if (activePage === 'health') {
      return (
        <HealthPage
          healthEntries={data.healthEntries}
          saving={data.saving}
          addHealthEntry={data.addHealthEntry}
          deleteHealthEntry={data.deleteHealthEntry}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'finance') {
      return (
        <FinancePage
          accounts={data.financeAccounts}
          netWorth={data.financeNetWorth}
          history={data.financeHistory}
          saving={data.saving}
          addAccount={data.addFinanceAccount}
          updateBalance={data.updateFinanceBalance}
          deleteAccount={data.deleteFinanceAccount}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'skills') {
      return (
        <SkillsPage
          skills={data.skills}
          saving={data.saving}
          addSkill={data.addSkill}
          removeSkill={data.removeSkill}
          deleteSkillSession={data.deleteSkillSession}
          uploadSkillVideo={data.uploadSkillVideo}
          deleteSkillVideo={data.deleteSkillVideo}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'gym') {
      return (
        <GymPage
          gymExercises={data.gymExercises}
          gymLogs={data.gymLogs}
          saving={data.saving}
          addGymExercise={data.addGymExercise}
          deleteGymExercise={data.deleteGymExercise}
          addGymLog={data.addGymLog}
          deleteGymLog={data.deleteGymLog}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (LIFE_MODES.some((mode) => mode.key === activePage)) {
      return <ModePage modeKey={activePage} setActivePage={setActivePage} assistantContext={assistantContext} openChat={openChat} />
    }

    return (
      <OverviewPage
        overviewEyebrow={data.overviewEyebrow}
        userName={settings.userName}
        modesCount={LIFE_MODES.length}
        setUpCount={data.setUpCount}
        overviewCards={data.overviewCards}
        setActivePage={setActivePage}
        openChat={openChat}
      />
    )
  }

  const assistantContext = activeMode
    ? {
        title: activeMode.title,
        assistantName: activeMode.assistantName || 'Life assistant',
        assistantTitle: activeMode.assistantTitle || '',
        message: activeMode.assistantMessage,
        prompts: activeMode.prompts,
      }
    : {
        title: 'Overview',
        assistantName: 'Dylan AI',
        assistantTitle: 'General assistant',
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

  if (!settings.onboardingComplete) {
    return <OnboardingWizard onComplete={completeOnboarding} />
  }

  const modeThemeClass = activeMode
    ? `theme-${activeMode.key}`
    : activePage === 'Journal'
    ? 'theme-journal'
    : activePage === 'Calendar'
    ? 'theme-calendar'
    : ''

  const designClass = `design-${settings.designSystem || 'minimal-glass'}`
  const paletteClass = `palette-${settings.colorPalette || 'vivid'}`
  const themeClass = `${modeThemeClass} ${designClass} ${paletteClass}`.trim()

  return (
    <div className={`app-root ${themeClass}`}>
      {/* Rendered outside .app-shell on purpose: .app-shell carries a CSS
          `filter` (for the design-system/color-palette composition), and a
          `filter` on an ancestor makes it the containing block for any
          position:fixed descendant — so a toast nested inside .app-shell
          would anchor to .app-shell's box instead of the viewport and could
          end up clipped by its `overflow: hidden`. Keeping it here, outside
          the filtered element, is what makes position:fixed behave like
          fixed-to-viewport actually mean that. */}
      <GameToast toasts={toasts} dismissToast={dismissToast} />

      {settings.signatureTransitions && settings.enterAnimation !== 'none' && (
        <ModeTransition
          flashKey={modeFlashKey}
          animation={settings.enterAnimation}
          mode={transitionMode}
        />
      )}

      <TopSettingsBar settings={settings} setSettings={data.setSettings} />

      <div className={`app-shell ${themeClass}`}>
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          userInitial={userInitial}
          userName={settings.userName}
          assistantContext={assistantContext}
          modeKey={activeMode ? activeMode.key : null}
          chatMessages={data.chatMessages}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          loading={loading}
          onOpenChat={openChat}
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

        <ChatOverlay
          open={chatOverlayOpen}
          onClose={() => setChatOverlayOpen(false)}
          contextTitle={assistantContext.assistantName}
          assistantContext={assistantContext}
          modeKey={activeMode ? activeMode.key : null}
          chatMessages={data.chatMessages}
          loading={loading}
          memorySuggestion={data.memorySuggestion}
          saveMemory={data.saveMemory}
          setMemorySuggestion={data.setMemorySuggestion}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
        />
      </div>
    </div>
  )
}

export default App
