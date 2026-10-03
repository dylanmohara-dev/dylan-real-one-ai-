import './App.css'
import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Lock, CalendarDays, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppData } from './hooks/useAppData.js'
import { useJournal } from './hooks/useJournal.js'
import { useCalendar } from './hooks/useCalendar.js'
import { useGmail } from './hooks/useGmail.js'
import { useDrive } from './hooks/useDrive.js'
import { useGoogleCalendar } from './hooks/useGoogleCalendar.js'
import { useCanvas } from './hooks/useCanvas.js'
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
import SportsPage from './components/SportsPage.jsx'
import ReadingPage from './components/ReadingPage.jsx'
import MindPage from './components/MindPage.jsx'
import FamilyPage from './components/FamilyPage.jsx'
import ModeBackground from './components/ModeBackground.jsx'
import ModeTransition from './components/ModeTransition.jsx'
import ZoomTransition from './components/ZoomTransition.jsx'
import CalendarPage from './components/CalendarPage.jsx'
import ConnectionsPage from './components/ConnectionsPage.jsx'
import ChatOverlay from './components/ChatOverlay.jsx'
import SearchOverlay from './components/SearchOverlay.jsx'
import StatsOverlay from './components/StatsOverlay.jsx'
import AchievementModal from './components/AchievementModal.jsx'
import OnboardingWizard from './components/OnboardingWizard.jsx'
import GameToast from './components/GameToast.jsx'
import TrashPanel from './components/TrashPanel.jsx'

function App() {
  const data = useAppData()
  const journal = useJournal()
  const calendar = useCalendar()
  const gmail = useGmail()
  const drive = useDrive()
  const googleCalendar = useGoogleCalendar()
  const canvas = useCanvas()
  const slack = useSlack()

  // Canvas assignments (and the silent calendar auto-sync + class sync
  // inside loadAssignments) previously only loaded when Dylan happened to
  // visit Connections first in a given browser session -- checkStatus()
  // was wired up ONLY there. School's "Coming up" list reads
  // canvas.assignments too, so loading School (or any other page)
  // directly, without ever opening Connections, left it permanently empty
  // even though Canvas was genuinely connected with real data. Firing this
  // once here, at the top of the whole app, means it's populated no matter
  // which page loads first. Awaiting the whole chain and then reloading
  // `data` afterward picks up any classes Canvas's sync just created or
  // linked (useAppData owns `classes` state and has no other way to learn
  // about a change routes/canvas.js made outside its own CRUD functions).
  useEffect(() => {
    async function initCanvas() {
      await canvas.checkStatus()
      await data.loadData()
    }
    initCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [chatOverlayOpen, setChatOverlayOpen] = useState(false)
  const openChat = () => setChatOverlayOpen(true)
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
  const [statsOverlayOpen, setStatsOverlayOpen] = useState(false)

  // Ctrl/Cmd+K opens search from anywhere in the app -- the standard
  // convention (Linear, Notion, Slack, GitHub all use it), and the fastest
  // path to "find that thing I logged" without reaching for the mouse.
  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOverlayOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // A quiet click cue on every real button press, app-wide -- one
  // delegated listener here rather than touching every button in every
  // mode page individually. Gated by data.maybePlaySound itself (reads
  // settings.soundEffects), so turning the Sound toggle off silences this
  // completely with no separate check needed here.
  useEffect(() => {
    function handleGlobalClick(event) {
      if (event.target.closest('button')) {
        data.maybePlaySound('click')
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          overviewEyebrow={data.overviewEyebrow}
          userName={settings.userName}
          modesCount={LIFE_MODES.length}
          setUpCount={data.setUpCount}
          overviewCards={data.overviewCards}
          setActivePage={navigateTo}
          openChat={openChat}
          saving={data.saving}
          addHealthEntry={data.addHealthEntry}
          readingBooks={data.readingBooks}
          addReadingSession={data.addReadingSession}
          mindHabits={data.mindHabits}
          mindCompletions={data.mindCompletions}
          toggleMindCompletion={data.toggleMindCompletion}
          addFamilyLog={data.addFamilyLog}
          addSportsSession={data.addSportsSession}
          skills={data.skills}
          addSkillSession={data.addSkillSession}
          classes={data.classes}
          assignments={data.assignments}
          tests={data.tests}
          canvas={canvas}
          canvasCompletions={data.canvasCompletions}
          toggleAssignment={data.toggleAssignment}
          toggleTest={data.toggleTest}
          toggleCanvasAssignment={data.toggleCanvasAssignment}
        />
      )
    }

    if (activePage === 'Chat') {
      return (
        <ChatPage
          chatMessages={data.chatMessages}
          loading={loading}
          streamingText={data.streamingText}
          memorySuggestion={data.memorySuggestion}
          saveMemory={data.saveMemory}
          setMemorySuggestion={data.setMemorySuggestion}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          confirmPendingEvent={data.confirmPendingEvent}
          cancelPendingEvent={data.cancelPendingEvent}
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
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          classes={data.classes}
          assignments={data.assignments}
          tests={data.tests}
          canvas={canvas}
          canvasCompletions={data.canvasCompletions}
          toggleCanvasAssignment={data.toggleCanvasAssignment}
          setCanvasAssignmentCategory={data.setCanvasAssignmentCategory}
          schoolGradeLevel={data.settings.schoolGradeLevel}
          schoolLabelStyle={data.settings.schoolLabelStyle}
          tasks={data.tasks}
          toggleTask={data.toggleTask}
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
          testTopics={data.testTopics}
          setTestTopics={data.setTestTopics}
          saving={data.saving}
          addClass={data.addClass}
          deleteClass={data.deleteClass}
          updateClass={data.updateClass}
          addAssignment={data.addAssignment}
          toggleAssignment={data.toggleAssignment}
          setAssignmentGrade={data.setAssignmentGrade}
          setAssignmentCategory={data.setAssignmentCategory}
          deleteAssignment={data.deleteAssignment}
          addTest={data.addTest}
          toggleTest={data.toggleTest}
          setTestGrade={data.setTestGrade}
          setTestCategory={data.setTestCategory}
          deleteTest={data.deleteTest}
          generateStudyPlan={data.generateStudyPlan}
          clearStudyPlan={data.clearStudyPlan}
          lastSchoolDelete={data.lastSchoolDelete}
          lastSchoolRedo={data.lastSchoolRedo}
          undoLastSchoolDelete={data.undoLastSchoolDelete}
          redoLastSchoolDelete={data.redoLastSchoolDelete}
          dismissSchoolUndo={data.dismissSchoolUndo}
          setActivePage={navigateTo}
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
          setActivePage={navigateTo}
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
      return <ConnectionsPage gmail={gmail} drive={drive} slack={slack} googleCalendar={googleCalendar} canvas={canvas} />
    }

    if (activePage === 'health') {
      return (
        <HealthPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          healthEntries={data.healthEntries}
          goals={data.healthGoals}
          saving={data.saving}
          addHealthEntry={data.addHealthEntry}
          deleteHealthEntry={data.deleteHealthEntry}
          setHealthGoal={data.setHealthGoal}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'finance') {
      return (
        <FinancePage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          accounts={data.financeAccounts}
          netWorth={data.financeNetWorth}
          history={data.financeHistory}
          transactions={data.financeTransactions}
          budgets={data.financeBudgets}
          positions={data.tradingPositions}
          watchlist={data.tradingWatchlist}
          tradingStats={data.tradingStats}
          tradingSettings={data.tradingSettings}
          saving={data.saving}
          addAccount={data.addFinanceAccount}
          updateBalance={data.updateFinanceBalance}
          deleteAccount={data.deleteFinanceAccount}
          addTransaction={data.addFinanceTransaction}
          deleteTransaction={data.deleteFinanceTransaction}
          importTransactions={data.importFinanceTransactions}
          setBudget={data.setFinanceBudget}
          addPosition={data.addTradingPosition}
          closePosition={data.closeTradingPosition}
          deletePosition={data.deleteTradingPosition}
          addWatchlistItem={data.addWatchlistItem}
          updateWatchlistItem={data.updateWatchlistItem}
          deleteWatchlistItem={data.deleteWatchlistItem}
          updateTradingSettings={data.updateTradingSettings}
          financeJournal={data.financeJournal}
          addFinanceJournalEntry={data.addFinanceJournalEntry}
          deleteFinanceJournalEntry={data.deleteFinanceJournalEntry}
          financePsychologyCheckins={data.financePsychologyCheckins}
          financePsychologyMoodOptions={data.financePsychologyMoodOptions}
          addFinancePsychologyCheckin={data.addFinancePsychologyCheckin}
          deleteFinancePsychologyCheckin={data.deleteFinancePsychologyCheckin}
          userName={settings.userName}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'skills') {
      return (
        <SkillsPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          skills={data.skills}
          skillsMeta={data.skillsMeta}
          fetchSkillJournal={data.fetchSkillJournal}
          saving={data.saving}
          addSkill={data.addSkill}
          addSkillSession={data.addSkillSession}
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
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          gymExercises={data.gymExercises}
          gymLogs={data.gymLogs}
          gymRoutines={data.gymRoutines}
          gymWeekPlan={data.gymWeekPlan}
          gymWeekPlanOverrides={data.gymWeekPlanOverrides}
          gymDayNotes={data.gymDayNotes}
          gymSessions={data.gymSessions}
          gymRecurringEvents={data.gymRecurringEvents}
          saving={data.saving}
          addGymExercise={data.addGymExercise}
          deleteGymExercise={data.deleteGymExercise}
          updateGymExercise={data.updateGymExercise}
          addGymLog={data.addGymLog}
          deleteGymLog={data.deleteGymLog}
          addGymRoutine={data.addGymRoutine}
          updateGymRoutine={data.updateGymRoutine}
          deleteGymRoutine={data.deleteGymRoutine}
          setGymWeekPlanDay={data.setGymWeekPlanDay}
          setGymWeekPlanOverride={data.setGymWeekPlanOverride}
          setGymDayNote={data.setGymDayNote}
          addGymSession={data.addGymSession}
          deleteGymSession={data.deleteGymSession}
          addGymRecurringEvent={data.addGymRecurringEvent}
          deleteGymRecurringEvent={data.deleteGymRecurringEvent}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'sports') {
      return (
        <SportsPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          sportsSessions={data.sportsSessions}
          sportsSchedule={data.sportsSchedule}
          sportsScheduleOverrides={data.sportsScheduleOverrides}
          sportsSettings={data.sportsSettings}
          sportsRecurringEvents={data.sportsRecurringEvents}
          saving={data.saving}
          addSportsSession={data.addSportsSession}
          deleteSportsSession={data.deleteSportsSession}
          setSportsScheduleDay={data.setSportsScheduleDay}
          setSportsScheduleOverride={data.setSportsScheduleOverride}
          setSportsSport={data.setSportsSport}
          addSportsRecurringEvent={data.addSportsRecurringEvent}
          deleteSportsRecurringEvent={data.deleteSportsRecurringEvent}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'reading') {
      return (
        <ReadingPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          readingBooks={data.readingBooks}
          readingSessions={data.readingSessions}
          readingGoals={data.readingGoals}
          saving={data.saving}
          addReadingBook={data.addReadingBook}
          updateReadingBook={data.updateReadingBook}
          deleteReadingBook={data.deleteReadingBook}
          addReadingSession={data.addReadingSession}
          setReadingGoal={data.setReadingGoal}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (activePage === 'mind') {
      return (
        <MindPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          mindHabits={data.mindHabits}
          mindCompletions={data.mindCompletions}
          mindReviews={data.mindReviews}
          mindDecisions={data.mindDecisions}
          mindSkillXp={data.mindSkillXp}
          mindInsights={data.mindInsights}
          saving={data.saving}
          addMindHabit={data.addMindHabit}
          updateMindHabit={data.updateMindHabit}
          deleteMindHabit={data.deleteMindHabit}
          toggleMindCompletion={data.toggleMindCompletion}
          addMindReview={data.addMindReview}
          addMindDecision={data.addMindDecision}
          updateMindDecision={data.updateMindDecision}
          assistantContext={assistantContext}
          openChat={openChat}
          mindFreezes={data.mindFreezes}
        />
      )
    }

    if (activePage === 'family') {
      return (
        <FamilyPage
          heroImages={data.heroImages}
          updateHeroImage={data.updateHeroImage}
          resetHeroImage={data.resetHeroImage}
          familyMembers={data.familyMembers}
          familyLog={data.familyLog}
          familyGoals={data.familyGoals}
          saving={data.saving}
          addFamilyMember={data.addFamilyMember}
          deleteFamilyMember={data.deleteFamilyMember}
          addFamilyLog={data.addFamilyLog}
          deleteFamilyLogEntry={data.deleteFamilyLogEntry}
          setFamilyGoal={data.setFamilyGoal}
          assistantContext={assistantContext}
          openChat={openChat}
        />
      )
    }

    if (LIFE_MODES.some((mode) => mode.key === activePage)) {
      return <ModePage modeKey={activePage} setActivePage={navigateTo} assistantContext={assistantContext} openChat={openChat} />
    }

    return (
      <OverviewPage
        heroImages={data.heroImages}
        updateHeroImage={data.updateHeroImage}
        resetHeroImage={data.resetHeroImage}
        overviewEyebrow={data.overviewEyebrow}
        userName={settings.userName}
        modesCount={LIFE_MODES.length}
        setUpCount={data.setUpCount}
        overviewCards={data.overviewCards}
        dailyFocus={data.dailyFocus}
        setActivePage={navigateTo}
        openChat={openChat}
        saving={data.saving}
        addHealthEntry={data.addHealthEntry}
        readingBooks={data.readingBooks}
        addReadingSession={data.addReadingSession}
        mindHabits={data.mindHabits}
        mindCompletions={data.mindCompletions}
        toggleMindCompletion={data.toggleMindCompletion}
        addFamilyLog={data.addFamilyLog}
        addSportsSession={data.addSportsSession}
        skills={data.skills}
        addSkillSession={data.addSkillSession}
        classes={data.classes}
        assignments={data.assignments}
        tests={data.tests}
        canvas={canvas}
        canvasCompletions={data.canvasCompletions}
        toggleAssignment={data.toggleAssignment}
        toggleTest={data.toggleTest}
        toggleCanvasAssignment={data.toggleCanvasAssignment}
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
        : { title: 'Overview', icon: LayoutGrid, key: 'overview' }

  // --- Zoom mode-switch transition (session 37) ---
  // Deliberately its own self-contained effect rather than reusing
  // useAppData's modeFlashKey -- that one drives the OLD full-screen flash
  // (still selectable as Wipe/Fade in Settings) and has no reason to know
  // about DOM rects. This one measures, on every real page change:
  //   1. where to start -- the destination mode's sidebar icon, found by
  //      [data-nav-key] rather than assuming the click came from the
  //      sidebar, so a mode switch from an Overview card, search, or a
  //      chat action still zooms from the right icon.
  //   2. where to end -- .main-content's own box, via mainContentRef.
  // If either measurement comes up empty (a page with no matching sidebar
  // icon -- Chat/Tasks/Goals/Notes/Memory aren't in the nav), this simply
  // renders nothing for that switch and the plain .content fade (App.css)
  // still plays underneath, so nothing ever looks broken.
  const mainContentRef = useRef(null)
  const [zoomTransition, setZoomTransition] = useState(null)
  const zoomKeyRef = useRef(0)
  const previousActivePageRef = useRef(activePage)

  // THE BUG Dylan hit ("zoom feature is bugged"): this used to just
  // querySelector the destination's sidebar icon INSIDE the effect below,
  // which only ran after activePage had already changed and React had
  // already committed the new DOM. That was safe when the sidebar was
  // always mounted -- but now that it unmounts in that SAME render
  // whenever activeMode becomes truthy (entering a mode -- the
  // mode-fullscreen takeover), the icon is already gone by the time the
  // effect's querySelector runs, so entering a mode silently stopped
  // producing any transition at all (instant, jarring page-swap instead
  // of the zoom). navigateTo below captures the origin synchronously,
  // BEFORE calling the real setActivePage -- i.e. while the CURRENT
  // (pre-navigation) DOM, sidebar included, is still what's mounted.
  const pendingZoomOriginRef = useRef(null)

  function navigateTo(nextPage, originHintEl) {
    // originHintEl covers the reverse case: leaving a mode, the sidebar
    // isn't mounted at all (there's no [data-nav-key="Overview"] icon to
    // find), so the Back button passes itself as the origin instead --
    // zooming back down into where you clicked, rather than skipping the
    // transition on the way out.
    const originEl = document.querySelector(`[data-nav-key="${CSS.escape(nextPage)}"]`) || originHintEl || null
    pendingZoomOriginRef.current = originEl ? originEl.getBoundingClientRect() : null
    setActivePage(nextPage)
  }

  useEffect(() => {
    if (previousActivePageRef.current === activePage) return
    previousActivePageRef.current = activePage

    if (!settings.signatureTransitions || settings.enterAnimation !== 'zoom') return

    const originRect = pendingZoomOriginRef.current
    pendingZoomOriginRef.current = null
    const coverEl = mainContentRef.current
    if (!originRect || !coverEl) return

    zoomKeyRef.current += 1
    setZoomTransition({
      key: zoomKeyRef.current,
      origin: originRect,
      // Full-viewport, not just .main-content's box (coverEl is still
      // required above -- a page must be mounted for the switch to be
      // "real" -- but the rect itself now spans the whole screen). Dylan
      // asked three rounds running for a real videogame-style loading
      // screen; .main-content-only was the "professional software"
      // compromise from session 37, and he's since confirmed (by escalating
      // past it rather than pulling back) that he wants the full takeover
      // instead. The sidebar disappearing under it for ~1s is the point.
      coverRect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
      mode: transitionMode,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage])

  // Round 8, "yes everywhere": the GTA-menu tilt OverviewPage's own 9
  // tiles already have, extended app-wide -- every .item-card (School's
  // classes, Finance's accounts/transactions, Gym's exercises, Reading's
  // books, and so on across all 14 pages that use that class) now tilts
  // toward the cursor too. A single delegated listener on .main-content,
  // not per-card handlers copy-pasted into 14 files -- the interaction is
  // identical everywhere, and any future .item-card automatically gets it
  // for free. Kept subtler than Overview's big tiles (±5deg vs ±14deg):
  // a page can show dozens of these in a list, and each one independently
  // fighting for a dramatic tilt would read as chaotic, not game-like.
  useEffect(() => {
    const container = mainContentRef.current
    if (!container) return

    const TILT_SELECTOR = '.item-card, .mode-page-card'
    let tiltedEl = null

    function reduceMotion() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    function clearTilt() {
      if (tiltedEl) {
        tiltedEl.style.transform = ''
        tiltedEl = null
      }
    }

    function tiltFor(card, event, pressed) {
      const rect = card.getBoundingClientRect()
      const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) - 0.5
      const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) - 0.5
      const scale = pressed ? 0.985 : 1
      card.style.transform = `perspective(600px) rotateX(${py * -5}deg) rotateY(${px * 5}deg) translateY(-1px) scale(${scale})`
    }

    function handleMove(event) {
      if (reduceMotion()) return
      const card = event.target.closest(TILT_SELECTOR)
      if (!card || !container.contains(card)) {
        clearTilt()
        return
      }
      if (tiltedEl && tiltedEl !== card) tiltedEl.style.transform = ''
      tiltedEl = card
      tiltFor(card, event, false)
    }

    function handleDown(event) {
      if (reduceMotion()) return
      const card = event.target.closest(TILT_SELECTOR)
      if (card) tiltFor(card, event, true)
    }

    function handleUp(event) {
      if (reduceMotion()) return
      const card = event.target.closest(TILT_SELECTOR)
      if (card) tiltFor(card, event, false)
    }

    container.addEventListener('mousemove', handleMove)
    container.addEventListener('mouseleave', clearTilt)
    container.addEventListener('mousedown', handleDown)
    container.addEventListener('mouseup', handleUp)
    return () => {
      container.removeEventListener('mousemove', handleMove)
      container.removeEventListener('mouseleave', clearTilt)
      container.removeEventListener('mousedown', handleDown)
      container.removeEventListener('mouseup', handleUp)
    }
  }, [])

  // Touch half of "add swipe/arrow navigation" (the arrow buttons
  // themselves are in the JSX below) -- a left/right swipe on a
  // touchscreen cycles modes the same way the arrows do. Re-binds
  // whenever activeMode changes (cheap -- switches at most a few times a
  // minute) so adjacentMode() inside the handler always reflects whatever
  // mode is actually open right now, not whatever it was when the effect
  // first ran.
  useEffect(() => {
    if (!activeMode) return
    const container = mainContentRef.current
    if (!container) return

    let touchStartX = null
    let touchStartY = null

    function handleTouchStart(event) {
      const touch = event.touches[0]
      touchStartX = touch.clientX
      touchStartY = touch.clientY
    }

    function handleTouchEnd(event) {
      if (touchStartX === null) return
      const touch = event.changedTouches[0]
      const deltaX = touch.clientX - touchStartX
      const deltaY = touch.clientY - touchStartY
      touchStartX = null
      touchStartY = null
      // Require a real horizontal swipe, not a vertical scroll or a tap --
      // 60px minimum, and clearly more horizontal than vertical movement.
      if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return
      const target = adjacentMode(deltaX < 0 ? 1 : -1)
      if (target) navigateTo(target.key)
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [activeMode])

  if (!settings.onboardingComplete) {
    return <OnboardingWizard onComplete={completeOnboarding} />
  }

  // Dylan's "whole screen, whole app changes" ask (round 4): while a
  // life-area mode is open, the app takes it over completely -- sidebar
  // gone, that mode's own photo full-bleed behind the page, one back
  // control to leave. activeModeHeroUrl feeds the shared full-bleed
  // background below (the exact same element/CSS Overview already uses,
  // see .overview-hero-bg in App.css -- reused as-is rather than
  // duplicated, since the negative-margin breakout math is identical
  // either way: it's always escaping .content's own padding).
  const activeModeHeroUrl = activeMode ? data.heroImages?.[activeMode.key] : null

  // Round 9, "add swipe/arrow navigation": cycling straight to the next/
  // previous mode without detouring through Overview first, now that a
  // direct mode-to-mode switch is otherwise 2 clicks (Back, then pick).
  // LIFE_MODES' own array order is the cycle order -- it's already the
  // order Dylan gave us his 9 photos in (school, sports, gym, health,
  // finance, skills, reading, mind, family), so "next" reads as a
  // natural sequence, not an arbitrary one.
  const activeModeIndex = activeMode ? LIFE_MODES.findIndex((mode) => mode.key === activeMode.key) : -1
  const adjacentMode = (direction) => {
    if (activeModeIndex === -1) return null
    const nextIndex = (activeModeIndex + direction + LIFE_MODES.length) % LIFE_MODES.length
    return LIFE_MODES[nextIndex]
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

      {/* Door/key "Recently deleted" corner panel -- one per life mode,
          same reasoning as GameToast above for living outside .app-shell.
          Only renders inside an actual life mode (School, Gym, ...), not
          on Overview/Chat/Settings/etc., since those don't have a trash
          of their own. */}
      {LIFE_MODES.some((m) => m.key === activePage) && <TrashPanel modeKey={activePage} />}

      {settings.signatureTransitions && settings.enterAnimation === 'zoom' && zoomTransition && (
        <ZoomTransition
          zoomKey={zoomTransition.key}
          origin={zoomTransition.origin}
          coverRect={zoomTransition.coverRect}
          mode={zoomTransition.mode}
          heroUrl={data.heroImages?.[zoomTransition.mode?.key]}
          onComplete={() => setZoomTransition(null)}
        />
      )}

      {settings.signatureTransitions && settings.enterAnimation !== 'none' && settings.enterAnimation !== 'zoom' && (
        <ModeTransition
          flashKey={modeFlashKey}
          animation={settings.enterAnimation}
          mode={transitionMode}
        />
      )}

      <TopSettingsBar
        settings={settings}
        setSettings={data.setSettings}
        playerStats={data.playerStats}
        onOpenSearch={() => setSearchOverlayOpen(true)}
        onOpenStats={() => setStatsOverlayOpen(true)}
      />

      <AchievementModal
        achievement={data.activeAchievement}
        onDismiss={data.dismissAchievement}
      />

      <div
        className={`app-shell ${themeClass}${activeMode ? ' mode-fullscreen' : ''}`}
        style={activeModeHeroUrl ? { '--mode-hero-photo': `url(${activeModeHeroUrl})` } : undefined}
      >
        {/* Hidden outright, not just visually -- while a mode is open, this
            entire column disappears and .main-content (flex: 1) fills the
            space on its own, no extra CSS needed for the reflow. Overview,
            Chat, Tasks, Settings etc. (activeMode is null there) keep the
            sidebar exactly as before. */}
        {!activeMode && (
          <Sidebar
            activePage={activePage}
            setActivePage={navigateTo}
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
        )}

        <main className="main-content" ref={mainContentRef}>
          <ModeBackground modeKey={backgroundModeKey} />

          {/* The one way back once the sidebar is gone -- a single,
              consistent control instead of duplicating a "Back to
              Overview" button inside every one of the 9 mode page
              components (School already had its own; this replaces the
              need for that everywhere). */}
          {activeMode && (
            <button
              className="mode-fullscreen-back"
              onClick={(event) => navigateTo('Overview', event.currentTarget)}
              aria-label="Back to Overview"
            >
              <ArrowLeft size={22} strokeWidth={2.75} />
              <span>Back to Overview</span>
            </button>
          )}

          {/* Cycle straight to the previous/next mode -- LIFE_MODES' own
              order -- without detouring through Overview. Each arrow
              passes itself as the zoom-transition's origin hint, same
              mechanism as the Back button, since there's no sidebar icon
              to zoom from/to while a mode's own sidebar is hidden. */}
          {activeMode && settings.modeNavArrows !== false && (
            <>
              <button
                className="mode-fullscreen-nav mode-fullscreen-prev"
                onClick={(event) => navigateTo(adjacentMode(-1).key, event.currentTarget)}
                aria-label={`Previous mode: ${adjacentMode(-1)?.title || ''}`}
              >
                <ChevronLeft size={26} strokeWidth={2.75} />
              </button>
              <button
                className="mode-fullscreen-nav mode-fullscreen-next"
                onClick={(event) => navigateTo(adjacentMode(1).key, event.currentTarget)}
                aria-label={`Next mode: ${adjacentMode(1)?.title || ''}`}
              >
                <ChevronRight size={26} strokeWidth={2.75} />
              </button>
            </>
          )}

          {(errorMessage || successMessage) && (
            <div className={`app-notification ${errorMessage ? 'error' : 'success'}`}>
              {errorMessage || successMessage}
            </div>
          )}

          <div className="content" key={activePage}>
            {/* Reuses Overview's own full-bleed hero element/CSS as-is --
                same negative-margin breakout out of .content's padding,
                just fed this mode's photo instead of Overview's. This is
                what makes each life area's picture cover the whole
                screen, not just a header strip. */}
            {activeModeHeroUrl && (
              <div
                className="overview-hero-bg mode-page-hero-bg"
                style={{ '--hero-photo': `url(${activeModeHeroUrl})` }}
              />
            )}
            {renderPage()}
          </div>

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
          streamingText={data.streamingText}
          memorySuggestion={data.memorySuggestion}
          saveMemory={data.saveMemory}
          setMemorySuggestion={data.setMemorySuggestion}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          confirmPendingEvent={data.confirmPendingEvent}
          cancelPendingEvent={data.cancelPendingEvent}
        />

        <SearchOverlay
          open={searchOverlayOpen}
          onClose={() => setSearchOverlayOpen(false)}
          searchAll={data.searchAll}
          setActivePage={navigateTo}
        />

        <StatsOverlay
          open={statsOverlayOpen}
          onClose={() => setStatsOverlayOpen(false)}
          playerStats={data.playerStats}
          skills={data.skills}
          mindHabits={data.mindHabits}
          mindCompletions={data.mindCompletions}
          healthEntries={data.healthEntries}
          gymExercises={data.gymExercises}
          gymLogs={data.gymLogs}
          tasks={data.tasks}
          goals={data.goals}
          assignments={data.assignments}
          tests={data.tests}
          financeHistory={data.financeHistory}
          financeNetWorth={data.financeNetWorth}
        />
      </div>
    </div>
  )
}

export default App
