import { loadData, saveData } from './dataStore.js'

/*
  Shared, persistent "Recently Deleted" store used by every life mode --
  Dylan asked for a door/key icon in each mode that opens a panel of
  everything deleted there, with a Restore button, rather than the
  easy-to-miss toast-and-8-second-timer School had before this. That
  earlier approach lived only in React state (useAppData.js's
  lastSchoolDelete) -- gone on refresh, gone on navigating away, gone the
  moment you didn't notice it in time. This one is a flat JSON file like
  every other collection in data/, so it survives refreshes, tab closes,
  and server restarts, same as the data it's protecting.

  One file (data/trash.json) shared across all modes rather than one per
  mode -- there's no per-mode query cost that matters at this data size,
  and one file means one place to look when something's wrong instead of
  nine.

  Each entry: { id, mode, kind, label, snapshot, deletedAt }
    - mode: the life mode key ('school', 'gym', 'finance', ...) --
      TrashPanel filters to the mode it's rendered in.
    - kind: the resource type within that mode ('class', 'gymLog', ...) --
      routes/trash.js's restore dispatch switches on this.
    - label: human-readable, already-formatted text for the panel row
      ("Gym log: Bench Press, Sep 30") -- computed once at delete time by
      the caller, not reconstructed from the snapshot later, so the panel
      never needs kind-specific rendering logic.
    - snapshot: the full original record (or, where a delete cascades,
      { primary, ...cascaded arrays } -- see classes.js's own addToTrash
      call for the shape that restoreEntry's 'class' case expects).
    - deletedAt: ISO timestamp, for sorting newest-first and for an
      eventual "older than 30 days" prune if this ever needs one (not
      built yet -- Dylan hasn't asked for auto-purge, and guessing at a
      retention window he didn't ask for is worse than leaving it out).
*/

const COLLECTION = 'trash'

export function addToTrash({ mode, kind, label, snapshot }) {
  if (!mode || !kind || !label) {
    throw new Error('addToTrash requires mode, kind, and label')
  }
  const entries = loadData(COLLECTION)
  const entry = {
    id: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    kind,
    label,
    snapshot: snapshot ?? null,
    deletedAt: new Date().toISOString(),
  }
  entries.push(entry)
  saveData(COLLECTION, entries)
  return entry
}

export function listTrash(mode) {
  const entries = loadData(COLLECTION)
  const filtered = mode ? entries.filter((e) => e.mode === mode) : entries
  // Newest-deleted-first -- what you just did is what you're most likely
  // here to undo.
  return filtered.slice().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
}

export function getTrashEntry(id) {
  return loadData(COLLECTION).find((e) => e.id === id) || null
}

export function removeFromTrash(id) {
  const entries = loadData(COLLECTION)
  const remaining = entries.filter((e) => e.id !== id)
  saveData(COLLECTION, remaining)
  return remaining.length !== entries.length
}
