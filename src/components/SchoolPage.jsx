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

// A class's average is a straight (unweighted) mean of every graded
// assignment and test in it — no assignments-vs-tests weighting yet,
// same "simple first, real" scope discipline as everything else this
// session. null means "nothing graded yet", not "0%" — an ungraded
// class should never look like it's failing.
function classAverage(classId, assignments, tests) {
  const graded = [
    ...assignments.filter((a) => a.classId === classId && a.grade !== null && a.grade !== undefined),
    ...tests.filter((t) => t.classId === classId && t.grade !== null && t.grade !== undefined),
  ]
  if (!graded.length) return null
  const sum = graded.reduce((total, item) => total + Number(item.grade), 0)
  return sum / graded.length
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

function upcomingItems(classes, assignments, tests) {
  const today = todayKey()
  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]))

  const fromAssignments = assignments
    .filter((a) => !a.completed && a.dueDate)
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'Assignment',
      title: a.title,
      className: classNameById[a.classId] || 'Unknown class',
      dueDate: a.dueDate,
    }))

  const fromTests = tests
    .filter((t) => !t.completed && t.date)
    .map((t) => ({
      id: `test-${t.id}`,
      kind: 'Test',
      title: t.title,
      className: classNameById[t.classId] || 'Unknown class',
      dueDate: t.date,
    }))

  return [...fromAssignments, ...fromTests]
    .map((item) => ({ ...item, daysUntil: daysBetween(today, item.dueDate) }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

export default function SchoolPage({
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
  saving,
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
  setActivePage,
  assistantContext,
  openChat,
}) {
  const classAssignments = (classId) => assignments.filter((a) => a.classId === classId)
  const classTests = (classId) => tests.filter((t) => t.classId === classId)
  const { weighted: weightedGPA, unweighted: unweightedGPA, gradedCount } = computeGPAs(classes, assignments, tests)
  const deadlines = upcomingItems(classes, assignments, tests)

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
              {deadlines.map((item) => {
                const tone =
                  item.daysUntil < 0 ? 'overdue' : item.daysUntil <= 2 ? 'soon' : 'normal'
                return (
                  <div className={`deadline-item deadline-${tone}`} key={item.id}>
                    <span className="deadline-kind">{item.kind}</span>
                    <div className="deadline-body">
                      <strong>{item.title}</strong>
                      <span className="deadline-class">{item.className}</span>
                    </div>
                    <span className="deadline-when">{deadlineLabel(item.daysUntil)}</span>
                  </div>
                )
              })}
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
