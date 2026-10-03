import { useEffect, useState } from 'react'
import { DoorOpen, X, RotateCcw } from 'lucide-react'
import { LIFE_MODES } from '../data/lifeModes.js'

/*
  Door/key "Recently Deleted" panel, one per life mode, fixed in the
  corner of the screen. Dylan asked for this after the School undo
  banner's 8-second window kept closing before he noticed it (or before
  he'd deleted a second thing by the time he came back) -- this is the
  backstop: a persistent, server-backed list (lib/trashStore.js /
  routes/trash.js) of everything deleted in THIS mode, each with its own
  Restore button, that's still there whenever you open it, not just for
  a few seconds after the delete.

  Self-contained on purpose -- fetches its own trash list rather than
  being threaded through useAppData.js's already enormous prop list, so
  wiring a new mode's deletes into this panel never requires touching
  App.jsx or useAppData.js again. Only needs modeKey.
*/

// Computed once per fetch (see refresh()), not on every render -- calling
// Date.now() from inside render (e.g. a formatWhen() called straight from
// JSX) is an impure render per React's own rules: the exact same item
// could print a different "X ago" on two renders a few ms apart for no
// state change at all. Attaching the formatted label at fetch time keeps
// render pure; the tradeoff is the label doesn't tick upward while the
// panel sits open, which is fine for something meant to be opened,
// glanced at, and acted on, not left up.
function formatWhen(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function TrashPanel({ modeKey }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [error, setError] = useState('')

  const mode = LIFE_MODES.find((m) => m.key === modeKey)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/trash?mode=${encodeURIComponent(modeKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const withLabels = (data.trash || []).map((item) => ({ ...item, whenLabel: formatWhen(item.deletedAt) }))
        setItems(withLabels)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load recently deleted items.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, modeKey])

  async function restore(id) {
    setRestoringId(id)
    setError('')
    try {
      const res = await fetch(`/api/trash/${id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed.')
      setItems((current) => current.filter((item) => item.id !== id))
      // The restored record is back in the real data store, but this
      // panel has no reach into useAppData.js's state -- a reload is the
      // simple, always-correct way to make the rest of the app (the
      // class grid, the deadline list, wherever it was) pick it back up
      // without wiring a refetch callback through every mode page just
      // for this one panel.
      window.location.reload()
    } catch (err) {
      setError(err.message || 'Restore failed.')
      setRestoringId(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className="trash-panel-trigger"
        onClick={() => setOpen(true)}
        title="Recently deleted"
        aria-label="Recently deleted"
      >
        <DoorOpen size={24} strokeWidth={2} />
      </button>

      {open && (
        <div className="trash-panel-backdrop" onClick={() => setOpen(false)}>
          <div className="trash-panel" onClick={(event) => event.stopPropagation()}>
            <div className="trash-panel-header">
              <div className="trash-panel-title">
                <DoorOpen size={16} strokeWidth={2.25} />
                Recently deleted{mode ? ` — ${mode.title}` : ''}
              </div>
              <button type="button" className="trash-panel-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {error && <div className="trash-panel-error">{error}</div>}

            {loading ? (
              <div className="trash-panel-empty">Loading…</div>
            ) : items.length === 0 ? (
              <div className="trash-panel-empty">Nothing deleted here recently.</div>
            ) : (
              <div className="trash-panel-list">
                {items.map((item) => (
                  <div key={item.id} className="trash-panel-row">
                    <div className="trash-panel-row-text">
                      <div className="trash-panel-row-label">{item.label}</div>
                      <div className="trash-panel-row-when">{item.whenLabel}</div>
                    </div>
                    <button
                      type="button"
                      className="trash-panel-restore"
                      onClick={() => restore(item.id)}
                      disabled={restoringId === item.id}
                    >
                      <RotateCcw size={13} strokeWidth={2.5} />
                      {restoringId === item.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
