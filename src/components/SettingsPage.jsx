import { DESIGN_SYSTEMS, COLOR_PALETTES } from '../data/lifeModes.js'

export default function SettingsPage({ settings, setSettings, setActivePage, openChat }) {
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
        <span className="eyebrow">DESIGN & THEME</span>
        <p className="classic-tools-note">
          Pick the visual system for the whole app — chrome font, corner
          sharpness, and background texture. Your 9 life-mode colors stay
          the same no matter which one you pick.
        </p>

        <div className="design-system-grid">
          {DESIGN_SYSTEMS.map((system) => (
            <button
              key={system.key}
              className={`design-system-card ${settings.designSystem === system.key ? 'active' : ''}`}
              onClick={() =>
                setSettings((prev) => ({ ...prev, designSystem: system.key }))
              }
            >
              <h4>{system.name}</h4>
              <span className="design-system-tagline">{system.tagline}</span>
              <p>{system.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">COLOR PALETTE</span>
        <p className="classic-tools-note">
          A mood/intensity dial on top of everything else — your 9 mode
          colors and whichever design system you picked above stay exactly
          the same, this just turns them up or down.
        </p>

        <div className="design-system-grid">
          {COLOR_PALETTES.map((palette) => (
            <button
              key={palette.key}
              className={`design-system-card ${settings.colorPalette === palette.key ? 'active' : ''}`}
              onClick={() =>
                setSettings((prev) => ({ ...prev, colorPalette: palette.key }))
              }
            >
              <h4>{palette.name}</h4>
              <span className="design-system-tagline">{palette.tagline}</span>
              <p>{palette.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="classic-tools">
        <span className="eyebrow">CLASSIC TOOLS</span>
        <p className="classic-tools-note">
          The general Tasks, Goals, Notes, and Memory views still work
          — they're just tucked away here now that the sidebar focuses on
          life modes. Chat lives in the sidebar on every page now (hit the
          expand icon), or use the button below for the general assistant.
        </p>

        <div className="classic-tools-grid">
          <button onClick={() => setActivePage('Tasks')}>Tasks</button>
          <button onClick={() => setActivePage('Goals')}>Goals</button>
          <button onClick={() => setActivePage('Notes')}>Notes</button>
          <button onClick={() => setActivePage('Memory')}>Memory</button>
          <button onClick={openChat}>Chat</button>
        </div>

        <div className="setup-wizard-rerun">
          <div>
            <strong>Setup wizard</strong>
            <p>Re-run the first-time setup questions any time — nothing already
              tracked gets touched.</p>
          </div>
          <button onClick={() => setSettings((prev) => ({ ...prev, onboardingComplete: false }))}>
            Run setup wizard
          </button>
        </div>
      </div>
    </div>
  )
}
