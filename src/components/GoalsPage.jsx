export default function GoalsPage({
  goals,
  goalInput,
  setGoalInput,
  saving,
  addGoal,
  updateGoal,
  deleteGoal,
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">PROGRESS</span>

          <h1>Goals</h1>

          <p>Turn long-term goals into visible progress.</p>
        </div>
      </div>

      <div className="form-card">
        <input
          value={goalInput}
          onChange={(event) => setGoalInput(event.target.value)}
          placeholder="What is your goal?"
        />

        <button onClick={addGoal} disabled={saving || !goalInput.trim()}>
          + Add Goal
        </button>
      </div>

      <div className="items-list">
        {goals.length ? (
          goals
            .slice()
            .reverse()
            .map((goal) => (
              <div className="goal-card" key={goal.id}>
                <div className="goal-row">
                  <strong>{goal.title}</strong>

                  <span>{goal.progress}%</span>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>

                <div className="goal-controls">
                  <button onClick={() => updateGoal(goal, -10)}>−10%</button>

                  <button onClick={() => updateGoal(goal, 10)}>+10%</button>

                  <button className="delete-button" onClick={() => deleteGoal(goal.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
        ) : (
          <div className="empty-state">
            <div>◎</div>
            <h3>No goals yet</h3>
            <p>Create a goal to start tracking progress.</p>
          </div>
        )}
      </div>
    </div>
  )
}
