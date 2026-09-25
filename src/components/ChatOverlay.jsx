import { X } from 'lucide-react'
import ChatPage from './ChatPage.jsx'

export default function ChatOverlay({ open, onClose, contextTitle, ...chatProps }) {
  if (!open) return null

  return (
    <div className="chat-overlay-backdrop" onClick={onClose}>
      {/* Drifting "fever dream" aura behind the panel -- shared visual
          language with .overview-ask-ai and .mode-chat-launcher, see
          App.css's AI FEVER-DREAM VISUAL LANGUAGE section. */}
      <div className="chat-overlay-glow ai-fever-aura" />
      <div className="chat-overlay-panel" onClick={(event) => event.stopPropagation()}>
        <div className="chat-overlay-topbar">
          <span className="chat-overlay-context">{contextTitle}</span>
          <button className="chat-overlay-close" onClick={onClose} title="Close chat">
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>

        <div className="chat-overlay-body">
          <ChatPage {...chatProps} />
        </div>
      </div>
    </div>
  )
}
