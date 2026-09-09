import { useRef, useState } from 'react'
import { Image as ImageIcon, X, Sparkles } from 'lucide-react'
import { LIFE_MODES } from '../data/lifeModes.js'

export default function ChatPage({
  chatMessages,
  loading,
  memorySuggestion,
  saveMemory,
  setMemorySuggestion,
  message,
  setMessage,
  sendMessage,
  assistantContext,
  modeKey,
}) {
  const [attachedImage, setAttachedImage] = useState(null)
  const [attachedImageName, setAttachedImageName] = useState('')
  const fileInputRef = useRef(null)

  const mode = modeKey ? LIFE_MODES.find((item) => item.key === modeKey) : null
  const AssistantIcon = mode?.icon || Sparkles
  const assistantName = assistantContext?.assistantName || 'Dylan AI'
  const assistantTitle = assistantContext?.assistantTitle || 'General assistant'
  const suggestionPrompts =
    assistantContext?.prompts?.length ? assistantContext.prompts : [
      'What should I focus on today?',
      'Show me my goals',
      'Help me organize my tasks',
    ]

  function handleImagePick(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttachedImage(reader.result)
      setAttachedImageName(file.name)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function handleSend() {
    sendMessage(message, attachedImage)
    setAttachedImage(null)
    setAttachedImageName('')
  }

  function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || [])
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (!imageItem) return

    event.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setAttachedImage(reader.result)
      setAttachedImageName('Pasted image')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div>
          <span className="eyebrow">{assistantTitle.toUpperCase()}</span>

          <h1>Ask {assistantName}</h1>

          <p>
            {mode
              ? `Your dedicated AI for ${mode.title} — separate memory, separate expertise from every other mode.`
              : 'Your personal AI system for managing your life.'}
          </p>
        </div>
      </div>

      <div className="chat-messages">
        {!chatMessages.length && (
          <div className="chat-welcome">
            <div className="welcome-icon">
              <AssistantIcon size={28} strokeWidth={2} />
            </div>

            <h2>
              {mode ? `${assistantName},` : 'Your personal AI,'}
              <br />
              {mode ? assistantTitle.toLowerCase() : 'connected to your life.'}
            </h2>

            <p>
              {mode
                ? (assistantContext?.message || `Ask ${assistantName} anything about ${mode.title}.`)
                : 'Ask questions, organize your tasks, update goals, save notes, or manage your memories.'}
            </p>

            <div className="suggestion-grid">
              {suggestionPrompts.map((prompt) => (
                <button key={prompt} onClick={() => sendMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((chat, index) => (
          <div className={`chat-message ${chat.role}`} key={index}>
            <div className="message-avatar">
              {chat.role === 'user' ? 'D' : <AssistantIcon size={14} strokeWidth={2.25} />}
            </div>

            <div className="message-bubble">{chat.content}</div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="message-avatar">
              <AssistantIcon size={14} strokeWidth={2.25} />
            </div>

            <div className="message-bubble typing-dots">
              <span className="dotPulse">•</span>
              <span className="dotPulse">•</span>
              <span className="dotPulse">•</span>
            </div>
          </div>
        )}
      </div>

      {memorySuggestion && (
        <div className="memory-suggestion">
          <div>
            <strong>Remember this?</strong>

            <p>{memorySuggestion}</p>
          </div>

          <div className="memory-actions">
            <button onClick={() => saveMemory(memorySuggestion)}>Save</button>

            <button onClick={() => setMemorySuggestion('')}>Dismiss</button>
          </div>
        </div>
      )}

      {attachedImage && (
        <div className="chat-image-preview">
          <img src={attachedImage} alt={attachedImageName} />
          <span>{attachedImageName}</span>
          <button onClick={() => { setAttachedImage(null); setAttachedImageName('') }} title="Remove image">
            <X size={12} strokeWidth={2.25} />
          </button>
        </div>
      )}

      <div className="chat-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="chat-image-file-input"
          onChange={handleImagePick}
        />

        <button
          className="chat-attach-button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach an image"
          type="button"
        >
          <ImageIcon size={16} strokeWidth={2.25} />
        </button>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          onPaste={handlePaste}
          placeholder="Ask Dylan AI anything... (paste or attach an image too)"
        />

        <button onClick={handleSend} disabled={loading || (!message.trim() && !attachedImage)}>
          ↑
        </button>
      </div>
    </div>
  )
}
