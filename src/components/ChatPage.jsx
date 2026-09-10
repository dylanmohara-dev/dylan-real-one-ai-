import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, X, Sparkles, Mic, MicOff } from 'lucide-react'
import { LIFE_MODES } from '../data/lifeModes.js'

export default function ChatPage({
  chatMessages,
  loading,
  streamingText,
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

  /*
    Voice-to-text via the browser's own SpeechRecognition — no server
    involved, so this works whether or not the local Ollama model is even
    running. Chrome/Edge ship it under a vendor prefix; some browsers
    (older Firefox, some Safari builds) don't ship it at all, so the mic
    button feature-detects and disables itself with an honest tooltip
    rather than pretending to work.
  */
  const SpeechRecognitionAPI =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const recognitionRef = useRef(null)
  // Snapshot of whatever was already typed when listening started, so
  // dictated text appends after it instead of replacing it.
  const baseMessageRef = useRef('')

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  function startListening() {
    if (!SpeechRecognitionAPI) {
      setVoiceError('Voice input is not supported in this browser.')
      return
    }
    setVoiceError('')
    baseMessageRef.current = message
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // Rebuilds the full transcript (interim + final) on every event so the
    // input updates live as Dylan talks, rather than only once he stops —
    // the same "don't leave him staring at nothing happening" reasoning as
    // the thinking-time counter above.
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      const base = baseMessageRef.current
      setMessage(base ? `${base} ${transcript}` : transcript)
    }

    recognition.onerror = (event) => {
      // Chrome's SpeechRecognition round-trips audio to a Google speech
      // service even though the button feels "local" -- a wifi hiccup, a
      // background tab throttle, or the mic just going quiet for a beat can
      // all kill it mid-sentence. Previously every one of those collapsed
      // into the same generic "stopped unexpectedly" with no way to tell
      // which one actually happened; now the real browser error code is
      // included so a recurring failure is at least diagnosable instead of
      // just annoying.
      setVoiceError(
        event.error === 'not-allowed'
          ? 'Microphone access was blocked — allow it in your browser to use voice input.'
          : event.error === 'no-speech'
            ? "Didn't catch anything — try again."
            : `Voice input stopped unexpectedly (${event.error || 'unknown'}). Try again, or type instead if it keeps happening.`
      )
      setIsListening(false)
    }

    // Some browsers end recognition on their own after a pause even in
    // continuous mode — this keeps the button's state honest either way,
    // whether Dylan stopped it or the browser did.
    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  function toggleListening() {
    if (isListening) stopListening()
    else startListening()
  }

  /*
    Live "thinking for Xs" counter. A spinner with no number gives you no way
    to tell "working on it" apart from "hung" — which is exactly the state
    the chat was stuck in before the timeout fixes. A ticking number makes
    slowness legible instead of alarming.
  */
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!loading) {
      // No setState here: the "Thinking for Xs" counter this drives is
      // only ever rendered while loading is true, so there's nothing to
      // reset for right now — it gets zeroed again below the next time
      // loading turns true. (Was calling setElapsedMs(0) unconditionally
      // here too, which is a lint error — synchronous setState in an
      // effect body — and was always redundant with the reset below.)
      return undefined
    }
    const startedAt = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 100)
    return () => clearInterval(timer)
  }, [loading])

  const formatDuration = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return null
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.round((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

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

            <div className="message-content-wrap">
              <div className="message-bubble">{chat.content}</div>
              {chat.role === 'assistant' && formatDuration(chat.thinkingMs) && (
                <span className="message-thinking-time">
                  Thought for {formatDuration(chat.thinkingMs)}
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="message-avatar">
              <AssistantIcon size={14} strokeWidth={2.25} />
            </div>

            <div className="message-content-wrap">
              {streamingText ? (
                // Reuses the exact same bubble a finished message gets --
                // this is real, live model output arriving token by token,
                // not a placeholder, so it should look like an answer, not
                // a loading state.
                <div className="message-bubble">{streamingText}</div>
              ) : (
                <div className="message-bubble typing-dots">
                  <span className="dotPulse">•</span>
                  <span className="dotPulse">•</span>
                  <span className="dotPulse">•</span>
                </div>
              )}
              <span className="message-thinking-time is-live">
                Thinking for {formatDuration(elapsedMs) || '0.0s'}
              </span>
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

      {voiceError && <p className="journal-error chat-voice-error">{voiceError}</p>}

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

        <button
          className={`chat-mic-button ${isListening ? 'is-listening' : ''}`}
          onClick={toggleListening}
          title={
            SpeechRecognitionAPI
              ? isListening ? 'Stop listening' : 'Speak your message'
              : 'Voice input not supported in this browser'
          }
          type="button"
          disabled={!SpeechRecognitionAPI}
        >
          {isListening ? <MicOff size={16} strokeWidth={2.25} /> : <Mic size={16} strokeWidth={2.25} />}
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
