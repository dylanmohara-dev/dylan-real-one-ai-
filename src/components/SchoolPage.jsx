import { useState } from 'react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

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

function deadlineLabel(daysUntil) {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue`
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  return `Due in ${daysUntil} days`
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
    .filter((a) => !a.completed && a.dueDate)
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'Assignment',
      title: a.title,
      className: classNameById[a.classId] || 'Unknown class',
      classId: a.classId,
      dueDate: a.dueDate,
      raw: a,
    }))

  const fromTests = tests
    .filter((t) => !t.completed && t.date)
    .map((t) => ({
      id: `test-${t.id}`,
      kind: 'Test',
      title: t.title,
      className: classNameById[t.classId] || 'Unknown class',
      classId: t.classId,
      dueDate: t.date,
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
  const deadlines = upcomingItems(classes, assignments, tests, canvas?.assignments)

  // Decluttering fix: Dylan's own complaint was that "Coming up" felt
  // cluttered -- it used to be one flat list, unlimited length, with no
  // distinction between "due today" and "due in six weeks." Grouping by
  // real urgency and collapsing the long tail behind a click is the
  // actual fix; nothing about which items show is changed, only how
  // they're organized.
  const [showLaterDeadlines, setShowLaterDeadlines] = useState(false)
  const overdueDeadlines = deadlines.filter((item) => item.daysUntil < 0)
  const thisWeekDeadlines = deadlines.filter((item) => item.daysUntil >= 0 && item.daysUntil <= 7)
  const laterDeadlines = deadlines.filter((item) => item.daysUntil > 7)

  function renderDeadlineItem(item) {
    const tone = item.daysUntil < 0 ? 'overdue' : item.daysUntil <= 2 ? 'soon' : 'normal'
    const isCanvas = item.kind === 'Canvas'
    return (
      <div
        className={`deadline-item deadline-${tone} deadline-clickable`}
        key={item.id}
        onClick={() => {
          if (isCanvas) window.open(item.raw.url, '_blank', 'noopener')
          else setSelectedClassId(item.classId)
        }}
      >
        {isCanvas ? (
          <span className="check-button check-button-canvas" title="From Canvas -- mark done in Canvas itself"></span>
        ) : (
          <button
            className="check-button"
            onClick={(event) => {
              event.stopPropagation()
              if (item.kind === 'Assignment') toggleAssignment(item.raw)
              else toggleTest(item.raw)
            }}
            title="Mark done"
          ></button>
        )}
        <span className="deadline-kind">{item.kind}</span>
        <div className="deadline-body">
          <strong>{item.title}</strong>
          <span className="deadline-class">{item.className}</span>
        </div>
        <span className="deadline-when">{deadlineLabel(item.daysUntil)}</span>
      </div>
    )
  }

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

        <div className="items-list">
          {classes.length ? (
            classes.map((schoolClass) => {
              const avg = classAverage(schoolClass.id, assignments, tests)
              const level = classLevel(schoolClass)
              return (
                <div className="item-card" key={schoolClass.id}>
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
                      <span>{classAssignments(schoolClass.id).length} assignments</span>
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
        </div>
        <button onClick={() => setSelectedClassId(null)}>
          ← Back to Classes
        </button>
      </div>

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
                        {assignment.dueDate && <span>Due {assignment.dueDate}</span>}
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
                  <div
                    className="item-card deadline-clickable"
                    key={c.id}
                    onClick={() => window.open(c.url, '_blank', 'noopener')}
                  >
                    <span
                      className="check-button check-button-canvas"
                      title="From Canvas -- mark done in Canvas itself"
                    ></span>
                    <div className="item-content">
                      <strong>{c.title}</strong>
                      <div className="item-meta">
                        <span>Due {c.dueAt.slice(0, 10)} &middot; Canvas</span>
                      </div>
                    </div>
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
