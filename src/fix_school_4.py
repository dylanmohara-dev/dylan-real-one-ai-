with open('App.jsx', 'r') as f:
    content = f.read()

old4 = """  function renderSchool() {
    const schoolTasks = tasks.filter(
      (task) => task.category === 'school'
    )

    return (
      <div className="page school-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">
              LIFE AREA
            </span>
            <h1>
              School
            </h1>
            <p>
              Assignments and schoolwork, kept separate from your general tasks.
            </p>
          </div>
          <button onClick={() => setActivePage('Life Areas')}>
            ← Back to Life Areas
          </button>
        </div>

        <div className="form-card">
          <input
            value={schoolInput}
            onChange={(event) => setSchoolInput(event.target.value)}
            placeholder="What assignment is due?"
          />

          <input
            type="date"
            value={schoolDueDate}
            onChange={(event) => setSchoolDueDate(event.target.value)}
          />

          <button
            onClick={addSchoolTask}
            disabled={saving || !schoolInput.trim()}
          >
            + Add Assignment
          </button>
        </div>

        <div className="items-list">
          {schoolTasks.length ? (
            schoolTasks
              .slice()
              .reverse()
              .map((task) => (
                <div
                  className={`item-card ${task.completed ? 'completed' : ''}`}
                  key={task.id}
                >
                  <button
                    className="check-button"
                    onClick={() => toggleTask(task)}
                  >
                    {task.completed ? '✓' : ''}
                  </button>

                  <div className="item-content">
                    <strong>{task.title}</strong>
                    <div className="item-meta">
                      {task.dueDate && <span>Due {task.dueDate}</span>}
                    </div>
                  </div>

                  <button
                    className="delete-button"
                    onClick={() => deleteTask(task.id)}
                  >
                    ×
                  </button>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <div>⌂</div>
              <h3>No assignments yet</h3>
              <p>Add your first assignment above.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderLifeAreas() {"""
new4 = """  function renderSchool() {
    const classAssignments = (classId) =>
      assignments.filter((a) => a.classId === classId)

    const classTests = (classId) =>
      tests.filter((t) => t.classId === classId)

    if (!selectedClassId) {
      return (
        <div className="page school-page">
          <div className="page-header">
            <div>
              <span className="eyebrow">LIFE AREA</span>
              <h1>School</h1>
              <p>Pick a class, or add a new one.</p>
            </div>
            <button onClick={() => setActivePage('Life Areas')}>
              ← Back to Life Areas
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
            <span className="eyebrow">SCHOOL</span>
            <h1>{activeClass ? activeClass.name : 'Class'}</h1>
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

  function renderLifeAreas() {"""
assert content.count(old4) == 1, f"MISMATCH 4: found {content.count(old4)} times"
content = content.replace(old4, new4)

old5 = '    <div className="app-shell">'
new5 = "    <div className={`app-shell ${activePage === 'School' ? 'theme-school' : ''}`}>"
assert content.count(old5) == 1, f"MISMATCH 5: found {content.count(old5)} times"
content = content.replace(old5, new5)

with open('App.jsx', 'w') as f:
    f.write(content)

print("PART 4 SUCCESS: renderSchool rebuilt, theme class applied")
