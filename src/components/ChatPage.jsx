export default function ChatPage({
  chatMessages,
  loading,
  memorySuggestion,
  saveMemory,
  setMemorySuggestion,
  message,
  setMessage,
  sendMessage,
}) {
  return (
    <div className="chat-page">
      <div className="chat-header">
        <div>
          <span className="eyebrow">AI ASSISTANT</span>

          <h1>What can I help you with?</h1>

          <p>Your personal AI system for managing your life.</p>
        </div>
      </div>

      <div className="chat-messages">
        {!chatMessages.length && (
          <div className="chat-welcome">
            <div className="welcome-icon">✦</div>

            <h2>
              Your personal AI,
              <br />
              connected to your life.
            </h2>

            <p>
              Ask questions, organize your tasks, update goals, save notes, or
              manage your memories.
            </p>

            <div className="suggestion-grid">
              <button onClick={() => sendMessage('What should I focus on today?')}>
                What should I focus on today?
              </button>

              <button onClick={() => sendMessage('Show me my goals')}>
                Show me my goals
              </button>

              <button onClick={() => sendMessage('Help me organize my tasks')}>
                Help me organize my tasks
              </button>
            </div>
          </div>
        )}

        {chatMessages.map((chat, index) => (
          <div className={`chat-message ${chat.role}`} key={index}>
            <div className="message-avatar">{chat.role === 'user' ? 'D' : '✦'}</div>

            <div className="message-bubble">{chat.content}</div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="message-avatar">✦</div>

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

      <div className="chat-composer">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Ask Dylan AI anything..."
        />

        <button onClick={() => sendMessage()} disabled={loading || !message.trim()}>
          ↑
        </button>
      </div>
    </div>
  )
}
