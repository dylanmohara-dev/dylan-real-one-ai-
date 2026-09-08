export default function TopSettingsBar({ settings, setSettings }) {
  return (
    <header className="top-settings-bar">
      <div className="top-settings-group">
        <label>Name</label>
        <input
          className="top-settings-name"
          value={settings.userName}
          onChange={(event) =>
            setSettings((prev) => ({
              ...prev,
              userName: event.target.value,
            }))
          }
          placeholder="Your name"
        />
      </div>

      <div className="top-settings-group">
        <label>Theme</label>
        <select
          value={settings.appearance}
          onChange={(event) =>
            setSettings((prev) => ({
              ...prev,
              appearance: event.target.value,
            }))
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div className="top-settings-group">
        <label>Transitions</label>
        <button
          className={`toggle ${settings.signatureTransitions ? 'on' : ''}`}
          onClick={() =>
            setSettings((prev) => ({
              ...prev,
              signatureTransitions: !prev.signatureTransitions,
            }))
          }
        >
          <span />
        </button>
      </div>

      <div className="top-settings-group">
        <label>Enter Animation</label>
        <select
          value={settings.enterAnimation}
          disabled={!settings.signatureTransitions}
          onChange={(event) =>
            setSettings((prev) => ({
              ...prev,
              enterAnimation: event.target.value,
            }))
          }
        >
          <option value="wipe">Wipe</option>
          <option value="fade">Fade</option>
          <option value="none">None</option>
        </select>
      </div>
    </header>
  )
}
