import { LayoutGrid, Lock, CalendarDays, Plug, Settings as SettingsIcon, Send, Bot, Maximize2 } from 'lucide-react'
import { LIFE_MODES } from '../data/lifeModes.js'

export default function Sidebar({
  activePage,
  setActivePage,
  userInitial,
  userName,
  assistantContext,
  modeKey,
  chatMessages,
  message,
  setMessage,
  sendMessage,
  loading,
  onOpenChat,
}) {
  const activeModeForAssistant = modeKey ? LIFE_MODES.find((item) => item.key === modeKey) : null
  const AssistantAvatarIcon = activeModeForAssistant?.icon || Bot
  const iconNav = [
    { key: 'Overview', label: 'Overview', icon: LayoutGrid },
    ...LIFE_MODES.map((mode) => ({
      key: mode.key,
      label: mode.title,
      icon: mode.icon,
    })),
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-avatar-row">
        <div className="user-avatar">{userInitial}</div>
      </div>

      <nav className="icon-nav">
        {iconNav.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.key

          return (
            <button
              key={item.key}
              className={`icon-nav-button ${isActive ? 'active' : ''}`}
              title={item.label}
              onClick={() => setActivePage(item.key)}
            >
              <Icon size={18} strokeWidth={2} />
            </button>
          )
        })}
      </nav>

      <button
        className={`icon-nav-button journal ${activePage === 'Journal' ? 'active' : ''}`}
        title="Journal (private)"
        onClick={() => setActivePage('Journal')}
      >
        <Lock size={18} strokeWidth={2} />
      </button>

      <button
        className={`icon-nav-button calendar ${activePage === 'Calendar' ? 'active' : ''}`}
        title="Calendar"
        onClick={() => setActivePage('Calendar')}
      >
        <CalendarDays size={18} strokeWidth={2} />
      </button>

      <button
        className={`icon-nav-button connections ${activePage === 'Connections' ? 'active' : ''}`}
        title="Connections"
        onClick={() => setActivePage('Connections')}
      >
        <Plug size={18} strokeWidth={2} />
      </button>

      <button
        className={`icon-nav-button gear ${activePage === 'Settings' ? 'active' : ''}`}
        title="Settings"
        onClick={() => setActivePage('Settings')}
      >
        <SettingsIcon size={18} strokeWidth={2} />
      </button>

      <div className="sidebar-user-footer">
        <div className="user-avatar small">{userInitial}</div>
        <span>{userName || 'Dylan'}</span>
      </div>

      <div className="assistant-panel">
        <div className="assistant-header">
          <div className="assistant-bot-icon">
            <AssistantAvatarIcon size={16} strokeWidth={2} />
          </div>

          <div>
            <strong>{assistantContext.assistantName || 'Life assistant'}</strong>
            <span className="assistant-subtitle">
              <span className="assistant-dot" />
              {assistantContext.assistantTitle || 'OWN CONTEXT'}
            </span>
          </div>

          <button className="assistant-expand" onClick={onOpenChat} title="Open full chat">
            <Maximize2 size={13} strokeWidth={2.25} />
          </button>
        </div>

        {(() => {
          const latest = chatMessages && chatMessages.length
            ? chatMessages[chatMessages.length - 1].content
            : assistantContext.message
          const isLong = latest.length > 220
          const preview = isLong ? `${latest.slice(0, 220).trim()}…` : latest

          return (
            <div className="assistant-bubble">
              {preview}
              {isLong && (
                <button className="assistant-bubble-expand" onClick={onOpenChat}>
                  Read full reply in chat →
                </button>
              )}
            </div>
          )
        })()}

        <div className="assistant-pills">
          {assistantContext.prompts.map((prompt) => (
            <button
              key={prompt}
              className="assistant-pill"
              onClick={() => sendMessage(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="assistant-input-row">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') sendMessage()
          }}
          placeholder={`Message ${assistantContext.title}...`}
        />

        <button
          className="assistant-send"
          onClick={() => sendMessage()}
          disabled={loading || !message.trim()}
        >
          <Send size={16} strokeWidth={2.25} />
        </button>
      </div>
    </aside>
  )
}
