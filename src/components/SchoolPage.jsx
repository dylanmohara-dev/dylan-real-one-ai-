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

// Overall GPA is an unweighted mean of every class's own GPA points — no
// credit-hour weighting yet (every class counts equally). Classes with
// nothing graded yet are excluded rather than dragging the average down
// as a phantom 0.0.
function overallGPA(classes, assignments, tests) {
  const points = classes
    .map((c) => classAverage(c.id, assignments, tests))
    .filter((avg) => avg !== null)
    .map(gradeToGPA)
  if (!points.length) return null
  return points.reduce((a, b) => a + b, 0) / points.length
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
  const currentGPA = overallGPA(classes, assignments, tests)
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

        {currentGPA !== null && (
          <div className="school-gpa-banner">
            <span className="school-gpa-label">Overall GPA</span>
            <span className="school-gpa-value">{currentGPA.toFixed(2)}</span>
            <span className="school-gpa-note">
              Unweighted across {classes.filter((c) => classAverage(c.id, assignments, tests) !== null).length} graded class(es), standard 4.0 scale
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
              return (
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
                      {avg !== null && (
                        <span> · {avg.toFixed(1)}% ({gradeToGPA(avg).toFixed(1)} GPA)</span>
                      )}
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
            {classAvg !== null && ` Current average: ${classAvg.toFixed(1)}% (${gradeToGPA(classAvg).toFixed(1)} GPA).`}
          </p>
        </div>
        <button onClick={() => setSelectedClassId(null)}>
          ← Back to Classes
        </button>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="school" openChat={openChat} />

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
