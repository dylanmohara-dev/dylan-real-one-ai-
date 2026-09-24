import { LIFE_MODES } from '../data/lifeModes.js'
import ModeChatLauncher from './ModeChatLauncher.jsx'

export default function ModePage({ modeKey, setActivePage, assistantContext, openChat }) {
  const mode = LIFE_MODES.find((item) => item.key === modeKey)

  if (!mode) return null

  const Icon = mode.icon

  return (
    <div
      className="page mode-page"
      style={{
        '--card-rgb': mode.rgb,
        '--card-rgb2': mode.rgb2,
      }}
    >
      <div className="page-header">
        <div>
          <span className="eyebrow">{mode.title.toUpperCase()} MODE</span>
          <h1 className="serif">{mode.headline}</h1>
          <p>{mode.subtitle}</p>
        </div>

      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey={modeKey} openChat={openChat} />

      <div className="mode-page-card">
        <div className="mode-card-top">
          <span className="mode-card-label">
            <Icon size={16} strokeWidth={2.25} />
            {mode.title}
          </span>
        </div>

        <div className="mode-card-metric">
          <span>{mode.metricLabel}</span>
          <strong>{mode.metricValue}</strong>
        </div>

        <div className="mode-progress-track">
          <div className="mode-progress-fill" style={{ width: '0%' }} />
        </div>
      </div>

      <p className="mode-page-note">
        More tools for {mode.title} are coming soon.
      </p>
    </div>
  )
}
