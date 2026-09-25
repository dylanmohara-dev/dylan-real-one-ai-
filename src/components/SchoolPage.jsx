import { useState } from 'react'
import { Check, Flame, Swords, FileText, X, ExternalLink } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import HeroPhotoButton from './HeroPhotoButton.jsx'
import RadialProgress from './RadialProgress.jsx'

// Standard US 4.0 scale. No school-specific customization yet (some
// schools weight AP/honors classes, use +/- differently, etc.) — this is
// a reasonable default, not a claim that it matches Dylan's actual
// school's exact scale.
function gradeToGPA(percent) {
  if (percent >= 93) return 4.0
  if (percent >= 90) return 3.7
  if (percent >= 87) return 3.3
  if (percent >= 83) return 3.0
  if (percent >= 80) return 2.7
  if (percent >= 77) return 2.3
  if (percent >= 73) return 2.0
  if (percent >= 70) return 1.7
  if (percent >= 67) return 1.3
  if (percent >= 63) return 1.0
  if (percent >= 60) return 0.7
  return 0.0
}

// A class's average is weighted by category, not a flat mean of every
// graded item -- a $5 homework assignment and a final exam counting
// identically was a real, previously-documented gap (see the git history
// for this exact comment before this changed). These weights are a
// reasonable default, same caveat as gradeToGPA's 4.0 scale above: not a
// claim they match Dylan's actual school's real weighting, just a far
// better default than treating everything as equal. category defaults to
// 'homework' (assignments) / 'test' (tests) for any item saved before
// this field existed, matching the backend's own POST default.
const CATEGORY_LABELS = { homework: 'Homework', quiz: 'Quiz', test: 'Test', project: 'Project' }
const CATEGORY_WEIGHTS = { homework: 15, quiz: 25, test: 50, project: 10 }

function itemCategory(item, fallback) {
  return CATEGORY_WEIGHTS[item.category] ? item.category : fallback
}

function classAverage(classId, assignments, tests) {
  const graded = [
    ...assignments
      .filter((a) => a.classId === classId && a.grade !== null && a.grade !== undefined)
      .map((a) => ({ ...a, category: itemCategory(a, 'homework') })),
    ...tests
      .filter((t) => t.classId === classId && t.grade !== null && t.grade !== undefined)
      .map((t) => ({ ...t, category: itemCategory(t, 'test') })),
  ]
  if (!graded.length) return null
  const totalWeight = graded.reduce((sum, item) => sum + CATEGORY_WEIGHTS[item.category], 0)
  const weightedSum = graded.reduce(
    (sum, item) => sum + Number(item.grade) * CATEGORY_WEIGHTS[item.category],
    0
  )
  return weightedSum / totalWeight
}

// Grade weighting: the standard US high school convention — Honors gets
// +0.5, AP/IB gets +1.0, regular/college-prep classes get the flat 4.0
// scale. Dylan's own class list (AP History, Honors Chemistry, College
// Prep Calculus, ...) is exactly what this is for. Every class defaults
// to 'regular' (via classLevel below) so classes created before this
// field existed read correctly without a data migration.
const LEVEL_LABELS = { regular: 'Regular', honors: 'Honors', ap: 'AP / IB' }
const WEIGHT_BONUS = { regular: 0, honors: 0.5, ap: 1.0 }

function classLevel(schoolClass) {
  return schoolClass?.level || 'regular'
}

function weightedClassGPA(percent, level) {
  return gradeToGPA(percent) + (WEIGHT_BONUS[level] || 0)
}

// Computes BOTH the traditional unweighted GPA (every class flat on the
// 4.0 scale) and the weighted GPA (Honors/AP bonus applied) in one pass.
// A class explicitly marked excludeFromGpa (non-academic periods like
// Study Hall or Lunch — real entries in Dylan's own class list) is
// skipped from both entirely, same as an ungraded class: neither counts
// as a phantom 0.0, and neither should drag down or pad the average.
function computeGPAs(classes, assignments, tests) {
  const graded = classes
    .filter((c) => !c.excludeFromGpa)
    .map((c) => ({ avg: classAverage(c.id, assignments, tests), level: classLevel(c) }))
    .filter((entry) => entry.avg !== null)

  if (!graded.length) return { weighted: null, unweighted: null, gradedCount: 0 }

  const unweightedPoints = graded.map((entry) => gradeToGPA(entry.avg))
  const weightedPoints = graded.map((entry) => weightedClassGPA(entry.avg, entry.level))

  return {
    weighted: weightedPoints.reduce((a, b) => a + b, 0) / weightedPoints.length,
    unweighted: unweightedPoints.reduce((a, b) => a + b, 0) / unweightedPoints.length,
    gradedCount: graded.length,
  }
}

// Per-class "quest" progression -- separate from the app-wide player
// level (TopSettingsBar, lib/playerXP.js) and from Skills mode's own
// per-skill leveling (routes/skills.js), but deliberately built on the
// exact same accelerating curve (50*N xp per level) and the exact same
// consecutive-day streak walk Skills mode already uses -- so "Level III"
// or a "5-day streak" means the same amount of real effort everywhere in
// the app, not a third, School-only formula. XP is earned only from real
// completed work, weighted like CATEGORY_WEIGHTS above so a test is worth
// more than a worksheet -- never a decorative number with nothing behind it.
const QUEST_XP = { homework: 10, quiz: 15, test: 30, project: 20 }

function xpForCategory(item, fallback) {
  return QUEST_XP[itemCategory(item, fallback)] ?? QUEST_XP.homework
}

function computeClassLevel(xp) {
  let level = 1
  let required = 50
  let remaining = Number(xp) || 0
  while (remaining >= required) {
    remaining -= required
    level += 1
    required = 50 * level
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: required }
}

// Aggregate across every class -- School's own overall level, distinct
// from any single class's level and from the app-wide player level
// (TopSettingsBar/lib/playerXP.js).
function schoolTotalXP(classes, assignments, tests) {
  return classes.reduce((sum, c) => sum + classXP(c.id, assignments, tests), 0)
}

function classXP(classId, assignments, tests) {
  const homeworkXp = assignments
    .filter((a) => a.classId === classId && a.completed)
    .map((a) => xpForCategory(a, 'homework'))
  const testXp = tests
    .filter((t) => t.classId === classId && t.completed)
    .map((t) => xpForCategory(t, 'test'))
  return [...homeworkXp, ...testXp].reduce((sum, xp) => sum + xp, 0)
}

// Every completed item with a real completedAt timestamp (stamped by
// useAppData.js's toggleAssignment/toggleTest) becomes one "day this
// class got worked on." A class created, or with items completed, before
// completedAt existed simply has no streak yet -- it starts counting from
// here forward rather than guessing at history that was never recorded.
function classCompletionDayTotals(classId, assignments, tests) {
  const totals = {}
  for (const item of [...assignments, ...tests]) {
    if (item.classId !== classId || !item.completed || !item.completedAt) continue
    const day = item.completedAt.slice(0, 10)
    totals[day] = (totals[day] || 0) + 1
  }
  return totals
}

// Same day-walk as routes/skills.js's computeCurrentStreak: today counts
// if it already has a completion, otherwise the walk starts from
// yesterday so a streak isn't reported broken before the day is even over.
function currentStreakFromTotals(totals) {
  const today = todayKey()
  const cursor = new Date()
  if (!totals[today]) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (totals[key] > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// Deterministic per-class accent color -- "everything is the same color,
// hard to distinguish" was Dylan's own diagnosis of School mode. Derived
// from the class id (a stable hash into a small curated hue set) rather
// than stored on the class or picked in a settings UI, so every class --
// including ones already saved before this existed -- gets a distinct,
// legible color immediately, with no migration and no new field.
const CLASS_COLOR_PALETTE = [
  '239, 68, 68', // crimson
  '245, 158, 11', // amber
  '132, 204, 22', // lime
  '16, 185, 129', // emerald
  '6, 182, 212', // cyan
  '59, 130, 246', // azure
  '139, 92, 246', // violet
  '217, 70, 239', // fuchsia
  '244, 63, 94', // rose
]

function classColorRgb(classId) {
  const key = String(classId || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return CLASS_COLOR_PALETTE[hash % CLASS_COLOR_PALETTE.length]
}

// Boss Battle HP: a test's own health bar, drained by real prep -- each
// completed study-plan session (a real Task, toggled in Tasks mode same
// as any other task) is one hit landed. No plan generated yet reads as
// full HP (the fight hasn't started), not zero and not hidden.
function bossHp(test, tasks) {
  const planTasks = (tasks || []).filter((t) => t.studyPlanFor === test.id)
  if (!planTasks.length) return 100
  const done = planTasks.filter((t) => t.completed).length
  return Math.round(100 - (done / planTasks.length) * 100)
}

// Persistent School-mode HUD -- Dylan's explicit ask for a lobby-style bar
// pinned at the top, separate from the page content scrolling below it.
// bestStreak is the LONGEST current streak across any one class, not a
// sum -- summing would reward spreading thin work across many classes
// over actually staying consistent in any single one.
function SchoolHUD({ classes, assignments, tests }) {
  const totalXp = schoolTotalXP(classes, assignments, tests)
  const { level, xpIntoLevel, xpForNextLevel } = computeClassLevel(totalXp)
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  const bestStreak = classes.reduce((max, c) => {
    const streak = currentStreakFromTotals(classCompletionDayTotals(c.id, assignments, tests))
    return Math.max(max, streak)
  }, 0)
  return (
    <div className="school-hud">
      <span className="school-hud-tag">Overall</span>
      <span className="school-hud-level">LV {level}</span>
      <div className="school-hud-track" title={`${xpIntoLevel} / ${xpForNextLevel} XP to next level`}>
        <div className="school-hud-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="school-hud-xp">{xpIntoLevel} / {xpForNextLevel} XP</span>
      {bestStreak > 0 && (
        <span className="school-hud-streak" title={`Best current streak: ${bestStreak} day${bestStreak === 1 ? '' : 's'}`}>
          <Flame size={14} strokeWidth={2.5} />
          {bestStreak}
        </span>
      )}
    </div>
  )
}

function ClassQuestBar({ classId, assignments, tests, size }) {
  const xp = classXP(classId, assignments, tests)
  const { level, xpIntoLevel, xpForNextLevel } = computeClassLevel(xp)
  const streak = currentStreakFromTotals(classCompletionDayTotals(classId, assignments, tests))
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))
  return (
    <div className={`school-quest-bar${size === 'lg' ? ' lg' : ''}`}>
      <span className="school-quest-level" title={`Level ${level} in this class`}>
        LV {level}
      </span>
      <div className="school-quest-track" title={`${xpIntoLevel} / ${xpForNextLevel} XP to next level`}>
        <div className="school-quest-fill" style={{ width: `${pct}%` }} />
      </div>
      {streak > 0 && (
        <span className="school-quest-streak" title={`${streak}-day streak in this class`}>
          <Flame size={12} strokeWidth={2.5} />
          {streak}
        </span>
      )}
    </div>
  )
}

// Deadline dashboard: every incomplete assignment/test with a date,
// across every class, sorted soonest-first. Overdue items sort first
// (negative daysUntil), not hidden -- an overdue item is exactly the
// thing you most need to see, not something to bury.
//
// Timezone-safe by construction: dueDate/date are bare "YYYY-MM-DD"
// strings. "Today" is read from local date parts (so it matches the
// calendar day the user is actually living in), then both sides are
// compared as UTC-anchored day numbers -- never round-tripped through
// `new Date(bareDateString)`, which is the exact bug that shifted goal/
// assignment/test dates back a day earlier this session.
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// UTC-anchored on purpose, same convention as daysBetween() above -- a
// bare 'YYYY-MM-DD' has no timezone of its own, and parsing it any other
// way (e.g. `new Date(dateKey)`, which treats it as UTC midnight then
// renders in local time) can walk it back a day depending on Dylan's
// timezone. This reads back the exact same calendar day the string says.
function weekdayForDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function deadlineLabel(daysUntil, dateKey) {
  const weekday = dateKey ? ` (${weekdayForDateKey(dateKey)})` : ''
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue${weekday}`
  if (daysUntil === 0) return `Due today${weekday}`
  if (daysUntil === 1) return `Due tomorrow${weekday}`
  return `Due in ${daysUntil} days${weekday}`
}

const LINGER_MS = 24 * 60 * 60 * 1000

function stillLingering(item) {
  if (!item.completed || !item.completedAt) return false
  return Date.now() - new Date(item.completedAt).getTime() < LINGER_MS
}

function upcomingItems(classes, assignments, tests, canvasAssignments) {
  const today = todayKey()
  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]))
  // Canvas's own courseId -> this app's local class id, built from classes
  // routes/canvas.js's /sync-classes has already linked or created. A
  // Canvas course with no matching local class (sync hasn't run yet, or
  // failed silently) just falls back to classId: null below, same as
  // before this existed.
  const classIdByCourseId = Object.fromEntries(
    classes.filter((c) => c.canvasCourseId).map((c) => [c.canvasCourseId, c.id])
  )

  const fromAssignments = assignments
    .filter((a) => a.dueDate && (!a.completed || stillLingering(a)))
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'Assignment',
      title: a.title,
      className: classNameById[a.classId] || 'Unknown class',
      classId: a.classId,
      dueDate: a.dueDate,
      completed: Boolean(a.completed),
      raw: a,
    }))

  const fromTests = tests
    .filter((t) => t.date && (!t.completed || stillLingering(t)))
    .map((t) => ({
      id: `test-${t.id}`,
      kind: 'Test',
      title: t.title,
      className: classNameById[t.classId] || 'Unknown class',
      classId: t.classId,
      dueDate: t.date,
      completed: Boolean(t.completed),
      raw: t,
    }))

  // Canvas assignments are read-only here (Canvas is the source of truth,
  // not this app), so they carry no classId/raw-toggle -- they're merged
  // into the same "Coming up" list rather than living in a second,
  // easy-to-miss place, which was Dylan's actual complaint: Canvas showed
  // as connected but its due dates never appeared here or on the
  // calendar. A submitted item is dropped the same way a completed local
  // assignment is -- it's no longer something to look at.
  const fromCanvas = (canvasAssignments || [])
    .filter((c) => c.dueAt && !c.submitted)
    .map((c) => {
      const classId = classIdByCourseId[c.courseId] || null
      return {
        id: c.id,
        kind: 'Canvas',
        title: c.title,
        className: (classId && classNameById[classId]) || c.courseName || 'Canvas',
        classId,
        dueDate: c.dueAt.slice(0, 10),
        raw: c,
      }
    })

  return [...fromAssignments, ...fromTests, ...fromCanvas]
    .map((item) => ({ ...item, daysUntil: daysBetween(today, item.dueDate) }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

export default function SchoolPage({
  heroImages,
  updateHeroImage,
  resetHeroImage,
  classes,
  assignments,
  tests,
  canvas,
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
  saving,
  addClass,
  deleteClass,
  updateClass,
  addAssignment,
  toggleAssignment,
  setAssignmentGrade,
  setAssignmentCategory,
  deleteAssignment,
  tasks,
  addTest,
  toggleTest,
  setTestGrade,
  setTestCategory,
  deleteTest,
  generateStudyPlan,
  clearStudyPlan,
  setActivePage,
  assistantContext,
  openChat,
}) {
  const classAssignments = (classId) => assignments.filter((a) => a.classId === classId)
  const classTests = (classId) => tests.filter((t) => t.classId === classId)
  // Canvas assignments filed under this class's page, not just the
  // top-level "Coming up" list -- matched the same way upcomingItems()
  // above matches them, via the class's own canvasCourseId (set by
  // routes/canvas.js's /sync-classes). A submitted item drops off the
  // same way a completed local assignment would.
  const canvasClassAssignments = (classId) => {
    const activeClassForId = classes.find((c) => c.id === classId)
    if (!activeClassForId?.canvasCourseId) return []
    return (canvas?.assignments || []).filter(
      (c) => !c.submitted && c.dueAt && c.courseId === activeClassForId.canvasCourseId
    )
  }
  const { weighted: weightedGPA, unweighted: unweightedGPA, gradedCount } = computeGPAs(classes, assignments, tests)

  // Decluttering fix: Dylan's own complaint was that "Coming up" felt
  // cluttered -- it used to be one flat list, unlimited length, with no
  // distinction between "due today" and "due in six weeks." Grouping by
  // real urgency and collapsing the long tail behind a click is the
  // actual fix; nothing about which items show is changed, only how
  // they're organized.
  const [showLaterDeadlines, setShowLaterDeadlines] = useState(false)
  // Holds the id of whichever deadline item was just checked off, so its
  // row can play a completion animation for a beat before upcomingItems()
  // (driven by the real completed flag) drops it from the list on the
  // next data refresh.
  const [celebratingId, setCelebratingId] = useState(null)
  // Manual "remove now" for a lingering-completed item (see deadline-
  // dismiss below) -- declared before `deadlines` uses it; a const
  // referenced above its own declaration would throw at runtime (temporal
  // dead zone), not just read as undefined.
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const deadlines = upcomingItems(classes, assignments, tests, canvas?.assignments).filter(
    (item) => !dismissedIds.has(item.id)
  )
  function completeWithCelebration(item) {
    setCelebratingId(item.id)
    window.setTimeout(() => {
      if (item.kind === 'Assignment') toggleAssignment(item.raw)
      else toggleTest(item.raw)
    }, 420)
  }
  const overdueDeadlines = deadlines.filter((item) => item.daysUntil < 0)
  const thisWeekDeadlines = deadlines.filter((item) => item.daysUntil >= 0 && item.daysUntil <= 7)
  const laterDeadlines = deadlines.filter((item) => item.daysUntil > 7)

  function renderDeadlineItem(item) {
    const tone = item.completed ? 'done' : item.daysUntil < 0 ? 'overdue' : item.daysUntil <= 2 ? 'soon' : 'normal'
    const isCanvas = item.kind === 'Canvas'
    const isCelebrating = celebratingId === item.id
    return (
      <div
        className={`deadline-item deadline-${tone}${isCanvas ? '' : ' deadline-clickable'}${isCelebrating ? ' deadline-celebrating' : ''}`}
        key={item.id}
        style={item.classId ? { '--class-color-rgb': classColorRgb(item.classId) } : undefined}
        onClick={() => {
          // Canvas rows no longer navigate away on a plain click -- Dylan's
          // own complaint. Opening Canvas is now the small explicit
          // ExternalLink button below, a separate deliberate action.
          if (!isCanvas) setSelectedClassId(item.classId)
        }}
      >
        {isCanvas ? (
          <span className="check-button check-button-canvas" title="From Canvas -- read-only here"></span>
        ) : (
          <button
            className={`check-button${isCelebrating || item.completed ? ' check-button-done' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              if (!isCelebrating && !item.completed) completeWithCelebration(item)
            }}
            title={item.completed ? 'Done' : 'Mark done'}
          >
            {(isCelebrating || item.completed) && <Check size={14} strokeWidth={3} />}
          </button>
        )}
        <span className={`deadline-kind deadline-kind-${item.kind.toLowerCase()}`}>
          {item.kind === 'Test' && <Swords size={10} strokeWidth={2.5} />}
          {item.kind === 'Assignment' && <FileText size={10} strokeWidth={2.5} />}
          {item.kind}
        </span>
        <div className="deadline-body">
          <strong>{item.title}</strong>
          <span className="deadline-class">{item.className}</span>
        </div>
        {item.completed ? (
          <span className="deadline-when deadline-when-done">Done</span>
        ) : (
          <span className="deadline-when">{deadlineLabel(item.daysUntil, item.dueDate)}</span>
        )}
        {item.completed && (
          <button
            type="button"
            className="deadline-dismiss"
            title="Remove now"
            onClick={(event) => {
              event.stopPropagation()
              setDismissedIds((prev) => new Set(prev).add(item.id))
            }}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
        {isCanvas && (
          <button
            type="button"
            className="deadline-canvas-open"
            title="Open in Canvas"
            onClick={(event) => {
              event.stopPropagation()
              window.open(item.raw.url, '_blank', 'noopener')
            }}
          >
            <ExternalLink size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    )
  }

  if (!selectedClassId) {
    return (
      <div className="page school-page">
        <div
          className={`page-header${heroImages?.school ? ' mode-hero' : ''}`}
          style={heroImages?.school ? { '--hero-photo': `url(${heroImages.school})` } : undefined}
        >
          <HeroPhotoButton
            modeKey="school"
            heroUrl={heroImages?.school}
            onChange={updateHeroImage}
            onReset={resetHeroImage}
          />
          <div>
            <span className="eyebrow">SCHOOL MODE</span>
            <h1 className="serif">School</h1>
            <p>Pick a class, or add a new one.</p>
          </div>
        </div>

        <SchoolHUD classes={classes} assignments={assignments} tests={tests} />

      <ModeChatLauncher assistantContext={assistantContext} modeKey="school" openChat={openChat} />

        {weightedGPA !== null && (
          <div className="school-gpa-banner">
            <span className="school-gpa-label">Weighted GPA</span>
            <span className="school-gpa-value">{weightedGPA.toFixed(2)}</span>
            <span className="school-gpa-note">
              Unweighted: {unweightedGPA.toFixed(2)} &middot; across {gradedCount} graded class{gradedCount === 1 ? '' : 'es'} &middot; Honors +0.5, AP/IB +1.0
            </span>
          </div>
        )}

        <div className="school-deadlines">
          <div className="panel-heading">
            <h2>Coming up</h2>
          </div>
          {deadlines.length ? (
            <div className="deadline-list">
              {overdueDeadlines.length > 0 && (
                <div className="deadline-group">
                  <span className="deadline-group-label">Overdue</span>
                  {overdueDeadlines.map(renderDeadlineItem)}
                </div>
              )}
              {thisWeekDeadlines.length > 0 && (
                <div className="deadline-group">
                  <span className="deadline-group-label">This week</span>
                  {thisWeekDeadlines.map(renderDeadlineItem)}
                </div>
              )}
              {laterDeadlines.length > 0 && (
                <div className="deadline-group">
                  <button
                    type="button"
                    className="deadline-group-toggle"
                    onClick={() => setShowLaterDeadlines((prev) => !prev)}
                  >
                    {showLaterDeadlines ? 'Hide later items ▲' : `Show ${laterDeadlines.length} later item${laterDeadlines.length === 1 ? '' : 's'} ▼`}
                  </button>
                  {showLaterDeadlines && laterDeadlines.map(renderDeadlineItem)}
                </div>
              )}
            </div>
          ) : (
            <div className="mini-empty">Nothing due -- add a due date to an assignment or test to see it here.</div>
          )}
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

        <div className="items-list school-classes-grid">
          {classes.length ? (
            classes.map((schoolClass) => {
              const avg = classAverage(schoolClass.id, assignments, tests)
              const level = classLevel(schoolClass)
              return (
                <div
                  className="item-card school-class-card"
                  key={schoolClass.id}
                  style={{ '--class-color-rgb': classColorRgb(schoolClass.id) }}
                >
                  <button
                    type="button"
                    className="school-grade-ring-button"
                    onClick={() => setSelectedClassId(schoolClass.id)}
                    title={avg !== null ? `${avg.toFixed(1)}% average` : 'No grades yet'}
                  >
                    <RadialProgress percent={avg} size={40} strokeWidth={4} label={avg !== null ? Math.round(avg) : '–'} />
                  </button>
                  <div
                    className="item-content"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedClassId(schoolClass.id)}
                  >
                    <strong>
                      {schoolClass.name}
                      {level !== 'regular' && <span className="school-level-badge">{LEVEL_LABELS[level]}</span>}
                    </strong>
                    <div className="item-meta">
                      <span>
                        {classAssignments(schoolClass.id).length + canvasClassAssignments(schoolClass.id).length} assignments
                        {canvasClassAssignments(schoolClass.id).length > 0
                          ? ` (${canvasClassAssignments(schoolClass.id).length} Canvas)`
                          : ''}
                      </span>
                      <span> · {classTests(schoolClass.id).length} tests</span>
                      {avg !== null && (
                        <span>
                          {' '}
                          · {avg.toFixed(1)}% ({weightedClassGPA(avg, level).toFixed(1)} GPA
                          {level !== 'regular' ? ', weighted' : ''})
                        </span>
                      )}
                      {schoolClass.excludeFromGpa && <span> · not counted in GPA</span>}
                    </div>
                    <ClassQuestBar classId={schoolClass.id} assignments={assignments} tests={tests} />
                  </div>
                  <button className="delete-button" onClick={() => deleteClass(schoolClass.id)}>
                    ×
                  </button>
                </div>
              )
            })
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
  const classAvg = classAverage(selectedClassId, assignments, tests)

  return (
    <div className="page school-page">
      <div className="page-header">
        {classAvg !== null && (
          <RadialProgress percent={classAvg} size={56} strokeWidth={5} label={`${Math.round(classAvg)}%`} />
        )}
        <div>
          <span className="eyebrow">SCHOOL MODE</span>
          <h1 className="serif">{activeClass ? activeClass.name : 'Class'}</h1>
          <p>
            Assignments and tests for this class.
            {classAvg !== null &&
              ` Current average: ${classAvg.toFixed(1)}% (${weightedClassGPA(classAvg, classLevel(activeClass)).toFixed(1)} GPA${
                classLevel(activeClass) !== 'regular' ? ', weighted' : ''
              }).`}
          </p>
          {activeClass && (
            <div className="school-quest-bar-wrap">
              <span className="school-quest-tag">This class</span>
              <ClassQuestBar classId={selectedClassId} assignments={assignments} tests={tests} size="lg" />
            </div>
          )}
        </div>
        <button className="school-back-to-classes" onClick={() => setSelectedClassId(null)}>
          ← Back to Classes
        </button>
      </div>

      <SchoolHUD classes={classes} assignments={assignments} tests={tests} />

      <ModeChatLauncher assistantContext={assistantContext} modeKey="school" openChat={openChat} />

      {activeClass && (
        <div className="school-class-settings">
          <div className="school-level-picker">
            {['regular', 'honors', 'ap'].map((level) => (
              <button
                key={level}
                type="button"
                className={classLevel(activeClass) === level ? 'active' : ''}
                onClick={() => updateClass(activeClass.id, { level })}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
          <label className="school-exclude-toggle">
            <input
              type="checkbox"
              checked={Boolean(activeClass.excludeFromGpa)}
              onChange={(event) => updateClass(activeClass.id, { excludeFromGpa: event.target.checked })}
            />
            Don't count this class in my GPA (e.g. Study Hall, Lunch)
          </label>
        </div>
      )}

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
            {currentAssignments.length || canvasClassAssignments(selectedClassId).length ? (
              <>
                {currentAssignments.map((assignment) => (
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
                        {assignment.dueDate && (
                        <span>
                          Due {assignment.dueDate} ({weekdayForDateKey(assignment.dueDate)})
                        </span>
                      )}
                      </div>
                    </div>
                    <select
                      className="category-select"
                      value={itemCategory(assignment, 'homework')}
                      title="Grade weight category"
                      onChange={(event) => setAssignmentCategory(assignment, event.target.value)}
                    >
                      {Object.keys(CATEGORY_LABELS).map((key) => (
                        <option key={key} value={key}>
                          {CATEGORY_LABELS[key]} ({CATEGORY_WEIGHTS[key]}%)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="grade-input"
                      min="0"
                      max="100"
                      placeholder="Grade %"
                      defaultValue={assignment.grade ?? ''}
                      onBlur={(event) => {
                        if (event.target.value !== String(assignment.grade ?? '')) {
                          setAssignmentGrade(assignment, event.target.value)
                        }
                      }}
                    />
                    <button className="delete-button" onClick={() => deleteAssignment(assignment.id)}>
                      ×
                    </button>
                  </div>
                ))}
                {canvasClassAssignments(selectedClassId).map((c) => (
                  <div className="item-card" key={c.id}>
                    <span
                      className="check-button check-button-canvas"
                      title="From Canvas -- read-only here"
                    ></span>
                    <div className="item-content">
                      <strong>{c.title}</strong>
                      <div className="item-meta">
                        <span>
                          Due {c.dueAt.slice(0, 10)} ({weekdayForDateKey(c.dueAt.slice(0, 10))}) &middot; Canvas
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="deadline-canvas-open"
                      title="Open in Canvas"
                      onClick={() => window.open(c.url, '_blank', 'noopener')}
                    >
                      <ExternalLink size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </>
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
            <input
              value={testTopics}
              onChange={(event) => setTestTopics(event.target.value)}
              placeholder="Topics covered, comma-separated (optional -- makes the study plan specific)"
            />
            <button onClick={addTest} disabled={saving || !testInput.trim()}>
              + Add
            </button>
          </div>
          <div className="items-list">
            {currentTests.length ? (
              currentTests.map((test) => {
                const planTasks = (tasks || []).filter((t) => t.studyPlanFor === test.id)
                return (
                  <div
                    className={`item-card school-test-card ${test.completed ? 'completed' : ''}`}
                    key={test.id}
                  >
                    <div className="school-test-row">
                      <button className="check-button" onClick={() => toggleTest(test)}>
                        {test.completed ? '✓' : ''}
                      </button>
                      <div className="item-content">
                        <strong>{test.title}</strong>
                        <div className="item-meta">
                          {test.date && <span>Date {test.date}</span>}
                        </div>
                      </div>
                      <select
                        className="category-select"
                        value={itemCategory(test, 'test')}
                        title="Grade weight category"
                        onChange={(event) => setTestCategory(test, event.target.value)}
                      >
                        {Object.keys(CATEGORY_LABELS).map((key) => (
                          <option key={key} value={key}>
                            {CATEGORY_LABELS[key]} ({CATEGORY_WEIGHTS[key]}%)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="grade-input"
                        min="0"
                        max="100"
                        placeholder="Grade %"
                        defaultValue={test.grade ?? ''}
                        onBlur={(event) => {
                          if (event.target.value !== String(test.grade ?? '')) {
                            setTestGrade(test, event.target.value)
                          }
                        }}
                      />
                      <button className="delete-button" onClick={() => deleteTest(test.id)}>
                        ×
                      </button>
                    </div>

                    {!test.completed && (
                      <div
                        className={`school-boss-bar${bossHp(test, tasks) <= 30 ? ' school-boss-low' : ''}`}
                        title="Boss HP -- drops as you complete this test's study plan. A 90%+ grade is what actually defeats it."
                      >
                        <Swords size={14} strokeWidth={2.5} />
                        <span className="school-boss-label-text">Boss</span>
                        <div className="school-boss-track">
                          <div className="school-boss-fill" style={{ width: `${bossHp(test, tasks)}%` }} />
                        </div>
                        <span className="school-boss-label">{bossHp(test, tasks)}% HP</span>
                        <Swords size={14} strokeWidth={2.5} />
                      </div>
                    )}

                    {test.date && (
                      <>
                        <div className="school-topics-row">
                          <input
                            className="school-topics-input"
                            defaultValue={test.topics || ''}
                            placeholder="What does this test cover? (comma-separated topics)"
                            onBlur={(event) => {
                              if (event.target.value.trim() !== (test.topics || '')) {
                                setTestTopicsValue(test, event.target.value)
                              }
                            }}
                          />
                        </div>

                        <div className="school-study-plan-row">
                          {planTasks.length ? (
                            <>
                              <span className="school-study-plan-status">
                                Study plan: {planTasks.length} session{planTasks.length === 1 ? '' : 's'} scheduled
                              </span>
                              <button
                                type="button"
                                className="school-study-plan-action"
                                onClick={() => generateStudyPlan(test.id)}
                              >
                                Regenerate
                              </button>
                              <button
                                type="button"
                                className="school-study-plan-action"
                                onClick={() => clearStudyPlan(test.id)}
                              >
                                Clear
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="school-study-plan-action"
                              onClick={() => generateStudyPlan(test.id)}
                            >
                              Generate study plan
                            </button>
                          )}
                        </div>

                        {planTasks.length > 0 && (
                          // The actual plan, visible right here -- not just a
                          // count. Dylan's own words: the old version was "just
                          // like a placeholder... there isn't actually a plan
                          // for me to study or do." This is the plan itself:
                          // every session's date, technique, and (when topics
                          // were given above) exactly what it covers.
                          <ol className="school-study-plan-sessions">
                            {planTasks
                              .slice()
                              .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
                              .map((task) => (
                                <li key={task.id}>
                                  <strong>
                                    {task.dueDate} &mdash; {task.title.split(': ').slice(-1)[0]}
                                  </strong>
                                  <p>{task.studyPlanDetail}</p>
                                </li>
                              ))}
                          </ol>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="mini-empty">No tests yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
