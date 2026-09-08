export default function TasksPage({
  tasks,
  taskInput,
  setTaskInput,
  taskPriority,
  setTaskPriority,
  taskDueDate,
  setTaskDueDate,
  taskReminder,
  setTaskReminder,
  saving,
  addTask,
  toggleTask,
  updateTaskPriority,
  deleteTask,
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">PRODUCTIVITY</span>

          <h1>Tasks</h1>

          <p>Stay on top of what needs to get done.</p>
        </div>
      </div>

      <div className="form-card">
        <input
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
          placeholder="What needs to get done?"
        />

        <select
          value={taskPriority}
          onChange={(event) => setTaskPriority(event.target.value)}
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>

        <input
          type="date"
          value={taskDueDate}
          onChange={(event) => setTaskDueDate(event.target.value)}
        />

        <select
          value={taskReminder}
          onChange={(event) => setTaskReminder(event.target.value)}
        >
          <option value="none">No reminder</option>
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
        </select>

        <button onClick={addTask} disabled={saving || !taskInput.trim()}>
          + Add Task
        </button>
      </div>

      <div className="items-list">
        {tasks.length ? (
          tasks
            .slice()
            .reverse()
            .map((task) => (
              <div
                className={`item-card ${task.completed ? 'completed' : ''}`}
                key={task.id}
              >
                <button className="check-button" onClick={() => toggleTask(task)}>
                  {task.completed ? '✓' : ''}
                </button>

                <div className="item-content">
                  <strong>{task.title}</strong>

                  <div className="item-meta">
                    {task.dueDate && <span>Due {task.dueDate}</span>}
                  </div>
                </div>

                <select
                  value={task.priority || 'medium'}
                  onChange={(event) => updateTaskPriority(task, event.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>

                <button className="delete-button" onClick={() => deleteTask(task.id)}>
                  ×
                </button>
              </div>
            ))
        ) : (
          <div className="empty-state">
            <div>✓</div>
            <h3>No tasks yet</h3>
            <p>Add your first task above.</p>
          </div>
        )}
      </div>
    </div>
  )
}
