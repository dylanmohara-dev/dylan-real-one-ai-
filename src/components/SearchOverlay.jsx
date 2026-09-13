import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

// Search across the whole app -- not just the mode you're currently in.
// Deliberately debounced (180ms) rather than firing a request on every
// keystroke: it's a local disk read so the actual query is cheap, but
// typing "chemistry" one letter at a time shouldn't fire 9 separate
// requests and race their results against each other.
const DEBOUNCE_MS = 180

// Maps routes/search.js's lowercase `mode` field to the actual activePage
// values App.jsx's renderPage() switches on -- most life modes use their
// own lowercase key directly, but the general-purpose pages (Tasks, Goals,
// Notes, Memory) are capitalized there, so this is the one place that
// translation lives rather than guessing it inline at the call site.
const MODE_TO_PAGE = {
  tasks: 'Tasks',
  goals: 'Goals',
  notes: 'Notes',
  memory: 'Memory',
}

function pageForMode(mode) {
  return MODE_TO_PAGE[mode] || mode
}

export default function SearchOverlay({ open, onClose, searchAll, setActivePage }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Reset the overlay's own state right as it transitions closed -> open --
  // done during render (React's own documented pattern for "adjust state
  // when a prop changes"), not inside a useEffect, since a synchronous
  // setState call in an effect body trips this repo's react-hooks/
  // set-state-in-effect rule (the same rule useCountUp.js hit building the
  // per-mode animation pass last session).
  if (open && !wasOpen) {
    setWasOpen(true)
    setQuery('')
    setResults([])
    setActiveIndex(-1)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  // Autofocus is a real DOM side effect (not a state update), so this one
  // genuinely belongs in an effect -- it just never calls setState.
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  // Debounced search. Every setState call below lives inside the setTimeout
  // callback, never directly in the effect body -- the effect body itself
  // only ever schedules or cancels a timer, so there's nothing here for
  // set-state-in-effect to flag.
  useEffect(() => {
    if (!open) return undefined
    clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    debounceRef.current = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      try {
        const hits = await searchAll(trimmed)
        setResults(hits)
        setActiveIndex(hits.length ? 0 : -1)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  function goToResult(result) {
    if (!result) return
    setActivePage(pageForMode(result.mode))
    onClose()
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      goToResult(results[activeIndex])
    }
  }

  if (!open) return null

  return (
    <div className="search-overlay-backdrop" onClick={onClose}>
      <div className="search-overlay-panel" onClick={(event) => event.stopPropagation()}>
        <div className="search-overlay-input-row">
          <Search size={16} strokeWidth={2.25} />
          <input
            ref={inputRef}
            className="search-overlay-input"
            placeholder="Search tasks, notes, classes, gym logs, everything..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="search-overlay-close" onClick={onClose} title="Close search">
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>

        <div className="search-overlay-results">
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="search-overlay-empty">No matches for &ldquo;{query}&rdquo;.</div>
          )}
          {query.trim().length > 0 && query.trim().length < 2 && (
            <div className="search-overlay-empty">Keep typing...</div>
          )}
          {results.map((result, index) => (
            <button
              type="button"
              key={result.id}
              className={`search-overlay-result ${index === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => goToResult(result)}
            >
              <span className="search-overlay-result-type">{result.type}</span>
              <span className="search-overlay-result-title">{result.title}</span>
              {result.snippet && <span className="search-overlay-result-snippet">{result.snippet}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
