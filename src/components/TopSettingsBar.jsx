import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Settings2, X } from 'lucide-react'

// Beginner-facing top bar: the level/XP pill always shows (it's the one
// piece of at-a-glance feedback everyone wants), but the four display
// controls (Name / Theme / Transitions / Enter Animation) are things a
// brand-new user sets once and then never touches again. Keeping them
// permanently on screen was pure clutter for that person, so they now
// live behind a small gear toggle instead of being deleted -- nothing
// here was the only place to reach these controls became true, so
// hiding them by default is safe rather than a loss of functionality.
export default function TopSettingsBar({ settings, setSettings, playerStats, onOpenSearch, onOpenStats }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="top-settings-bar">
      <button
        type="button"
        className="player-level-pill"
        onClick={onOpenStats}
        title={`Level ${playerStats.level} — ${playerStats.xpIntoLevel} / ${playerStats.xpForNextLevel} XP to next level. Click for career stats.`}
      >
        <span className="player-level-badge">Lv {playerStats.level}</span>
        <span className="player-level-bar">
          <span
            className="player-level-bar-fill"
            style={{
              width: `${
                playerStats.xpForNextLevel
                  ? Math.min(100, (playerStats.xpIntoLevel / playerStats.xpForNextLevel) * 100)
                  : 0
              }%`,
            }}
          />
        </span>
      </button>

      <div className="top-settings-spacer" />

      <button
        type="button"
        className="top-settings-search"
        onClick={onOpenSearch}
        title="Search everything (Ctrl/Cmd+K)"
      >
        <Search size={14} />
        <span>Search</span>
      </button>

      <button
        type="button"
        className={`top-settings-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={open ? 'Hide display settings' : 'Display settings'}
        aria-expanded={open}
      >
        {open ? <X size={14} /> : <Settings2 size={14} />}
        <span>Display</span>
      </button>

      {open && createPortal(
        <div className="top-settings-panel">
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
              <option value="zoom">Zoom (new)</option>
              <option value="wipe">Wipe</option>
              <option value="fade">Fade</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="top-settings-group">
            <label>Animation Feel</label>
            <select
              value={settings.animationIntensity || 'normal'}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  animationIntensity: event.target.value,
                }))
              }
            >
              <option value="subtle">Subtle</option>
              <option value="normal">Normal</option>
              <option value="flashy">Flashy</option>
            </select>
          </div>

          <div className="top-settings-group">
            <label>Hero Photo Motion</label>
            <select
              value={settings.heroMotion || 'normal'}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  heroMotion: event.target.value,
                }))
              }
            >
              <option value="off">Off (static photo)</option>
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </div>

          <div className="top-settings-group">
            <label>Sound</label>
            <button
              className={`toggle ${settings.soundEffects ? 'on' : ''}`}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  soundEffects: !prev.soundEffects,
                }))
              }
            >
              <span />
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  )
}
