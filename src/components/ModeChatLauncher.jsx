import { MessageCircle } from 'lucide-react'
import { LIFE_MODES } from '../data/lifeModes.js'

// A dedicated, visually distinct chat entry point embedded directly on a
// mode's own page — not just the shared sidebar mini-chat or the full-screen
// overlay reskinned. Looks up the mode's own icon so School's launcher reads
// differently from Gym's at a glance; color comes for free from the
// .theme-{key} class already on an ancestor (--mode-accent-rgb).
export default function ModeChatLauncher({ assistantContext, modeKey, openChat }) {
  if (!assistantContext) return null

  const mode = LIFE_MODES.find((item) => item.key === modeKey)
  const Icon = mode?.icon || MessageCircle

  return (
    <button className="mode-chat-launcher" onClick={openChat}>
      <span className="mode-chat-launcher-icon">
        <Icon size={20} strokeWidth={2.25} />
      </span>

      <span className="mode-chat-launcher-copy">
        <strong>Ask {assistantContext.assistantName}</strong>
        <span>{assistantContext.assistantTitle}</span>
      </span>

      <span className="mode-chat-launcher-arrow">
        <MessageCircle size={16} strokeWidth={2.25} />
      </span>
    </button>
  )
}
