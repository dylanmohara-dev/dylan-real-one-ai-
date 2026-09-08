export default function SettingsPage({ settings, setSettings, setActivePage }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">CONTROL CENTER</span>

          <h1>Settings</h1>

          <p>Control how Dylan AI behaves.</p>
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-card">
          <div>
            <strong>AI Actions</strong>

            <p>
              Allow Dylan AI to create, update, and delete tasks, goals, notes,
              and memories.
            </p>
          </div>

          <button
            className={`toggle ${settings.aiActions ? 'on' : ''}`}
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                aiActions: !prev.aiActions,
              }))
            }
          >
            <span />
          </button>
        </div>

        <div className="settings-card">
          <div>
            <strong>Memory Suggestions</strong>

            <p>
              Let Dylan AI suggest useful personal memories before saving them.
            </p>
          </div>

          <button
            className={`toggle ${settings.memorySuggestions ? 'on' : ''}`}
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                memorySuggestions: !prev.memorySuggestions,
              }))
            }
          >
            <span />
          </button>
        </div>

        <div className="settings-note">
          <strong>Your data stays local.</strong>

          <p>
            Dylan AI currently stores your tasks, goals, notes, and memories
            locally in your app.
          </p>
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">CLASSIC TOOLS</span>
        <p className="classic-tools-note">
          The general Tasks, Goals, Notes, Memory, and Chat views still work
          — they're just tucked away here now that the sidebar focuses on
          life modes.
        </p>

        <div className="classic-tools-grid">
          <button onClick={() => setActivePage('Tasks')}>Tasks</button>
          <button onClick={() => setActivePage('Goals')}>Goals</button>
          <button onClick={() => setActivePage('Notes')}>Notes</button>
          <button onClick={() => setActivePage('Memory')}>Memory</button>
          <button onClick={() => setActivePage('Chat')}>Chat</button>
        </div>
      </div>
    </div>
  )
}
