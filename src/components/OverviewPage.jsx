import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { WELCOME_GREETINGS } from '../data/lifeModes.js'

export default function OverviewPage({
  overviewEyebrow,
  userName,
  modesCount,
  setUpCount,
  overviewCards,
  setActivePage,
  openChat,
}) {
  const greeting = useMemo(() => {
    const pick = WELCOME_GREETINGS[Math.floor(Math.random() * WELCOME_GREETINGS.length)]
    return pick(userName || 'there')
  }, [userName])

  return (
    <div className="overview-page">
      <div className="overview-header">
        <div>
          <span className="eyebrow">{overviewEyebrow}</span>
          <h1 className="serif">{greeting}</h1>
        </div>

        <div className="overview-stats">
          <div className="overview-stat">
            <span>Modes</span>
            <strong>{modesCount}</strong>
          </div>

          <div className="overview-stat">
            <span>Set Up</span>
            <strong>{setUpCount}</strong>
          </div>

          <div className="overview-stat">
            <span>Assistants</span>
            <strong>{modesCount}</strong>
          </div>
        </div>
      </div>

      <button className="overview-ask-ai" onClick={openChat}>
        <span className="overview-ask-ai-icon">
          <Sparkles size={16} strokeWidth={2.25} />
        </span>
        <span className="overview-ask-ai-text">
          <strong>Ask Dylan AI anything</strong>
          <span>It can log things for you too — try "I ate 300 calories of chicken"</span>
        </span>
        <span className="overview-ask-ai-arrow">→</span>
      </button>

      <div className="overview-divider" />

      <div className="mode-grid">
        {overviewCards.map((card) => {
          const Icon = card.icon

          return (
            <button
              className={`mode-card theme-${card.key}`}
              key={card.key}
              style={{
                '--card-rgb': card.rgb,
                '--card-rgb2': card.rgb2,
              }}
              onClick={() => setActivePage(card.key)}
            >
              <div className="mode-card-top">
                <span className="mode-card-label">
                  <Icon size={14} strokeWidth={2.25} />
                  {card.title}
                </span>

                <span className="mode-card-dot" />
              </div>

              <h3 className="serif">{card.headline}</h3>
              <p>{card.subtitle}</p>

              <div className="mode-card-metric">
                <span>{card.metricLabel}</span>
                <strong>{card.metricValue}</strong>
              </div>

              <div className="mode-progress-track">
                <div
                  className="mode-progress-fill"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
