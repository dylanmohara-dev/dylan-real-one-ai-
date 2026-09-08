import { X } from 'lucide-react'
import ChatPage from './ChatPage.jsx'

export default function ChatOverlay({ open, onClose, contextTitle, ...chatProps }) {
  if (!open) return null

  return (
    <div className="chat-overlay-backdrop" onClick={onClose}>
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
