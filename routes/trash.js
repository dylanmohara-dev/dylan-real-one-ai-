import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent } from '../lib/calendarAutoSync.js'
import { listTrash, getTrashEntry, removeFromTrash } from '../lib/trashStore.js'
import { includeCourse } from '../lib/canvasExclusions.js'

const router = Router()

/*
  One shared "Recently Deleted" panel per life mode (TrashPanel.jsx), one
  shared server-side store (lib/trashStore.js), one dispatch table here
  instead of a /restore route per resource type scattered across the
  routes/*.js files it restores into -- adding a new kind to the panel is
  one new case here, not a new route file.

  Each handler gets the trash entry's `snapshot` (exactly what the
  deleting route captured right before the delete -- see each route's own
  addToTrash call for that shape) and is responsible for pushing it back
  into the right collection(s), id intact, plus re-running any side
  effect (real-calendar sync) the original create/restore path would
  have run. Never throws past this file -- a restore that fails midway
  through a multi-collection cascade is exactly the kind of silent data
  loss this whole feature exists to prevent, so every handler is written
  to no-op on an item that's already back (same id already present)
  rather than duplicate it.
*/

function pushIfAbsent(collection, record) {
  const items = loadData(collection)
  if (items.some((item) => item.id === record.id)) return false
  items.push(record)
  saveData(collection, items)
  return true
}

// Clears a stale real-calendar link before re-syncing -- see
// routes/assignments.js's /restore (pre-trash-system version) for why:
// the snapshot was taken before the original delete ran clearCalendarEvent,
// so it still points at a real event that's already gone. Reusing that
// link makes syncCalendarEvent retry a doomed update forever instead of
// just creating a fresh one.
function dropStaleCalendarLink(record) {
  delete record.calendarEventUrl
  delete record.calendarEventEtag
  delete record.calendarEventUid
  return record
}

// Re-syncs the real calendar link BEFORE the record is first pushed back
// into its collection, not after -- syncCalendarEvent mutates the record
// in place, and doing that first means the one saveData() call inside
// pushIfAbsent already captures the fresh link fields, instead of needing
// a second save to pick up a mutation that happened after the first one
// was already written to disk.
async function restoreRecord(collection, record, { title, date, mode }) {
  dropStaleCalendarLink(record)
  await syncCalendarEvent(record, { title, date, mode })
  return pushIfAbsent(collection, record)
}

const RESTORE_HANDLERS = {
  class: async (snapshot) => {
    pushIfAbsent('classes', snapshot.class)
    // See routes/classes.js's DELETE handler -- undoes the exclusion
    // that keeps /sync-classes from recreating this course on its own.
    if (snapshot.class?.canvasCourseId !== undefined) {
      includeCourse(snapshot.class.canvasCourseId)
    }
    for (const a of snapshot.assignments || []) {
      await restoreRecord('assignments', a, { title: a.title, date: a.dueDate, mode: 'school' })
    }
    for (const t of snapshot.tests || []) {
      await restoreRecord('tests', t, { title: t.title, date: t.date, mode: 'school' })
    }
    for (const task of snapshot.tasks || []) {
      await restoreRecord('tasks', task, { title: task.title, date: task.dueDate, mode: task.category })
    }
  },
  assignment: async (snapshot) => {
    await restoreRecord('assignments', snapshot, { title: snapshot.title, date: snapshot.dueDate, mode: 'school' })
  },
  test: async (snapshot) => {
    const test = snapshot.test
    await restoreRecord('tests', test, { title: test.title, date: test.date, mode: 'school' })
    for (const task of snapshot.tasks || []) {
      await restoreRecord('tasks', task, { title: task.title, date: task.dueDate, mode: task.category })
    }
  },
}

router.get('/', (req, res) => {
  res.json({ trash: listTrash(req.query.mode) })
})

router.post('/:id/restore', async (req, res) => {
  const entry = getTrashEntry(req.params.id)
  if (!entry) {
    return res.status(404).json({ error: 'Nothing here to restore -- it may already have been restored.' })
  }
  const handler = RESTORE_HANDLERS[entry.kind]
  if (!handler) {
    return res.status(400).json({ error: `Don't know how to restore a "${entry.kind}" yet.` })
  }
  try {
    await handler(entry.snapshot)
    removeFromTrash(entry.id)
    res.json({ success: true })
  } catch (error) {
    console.error(`Restore failed for trash entry ${entry.id} (${entry.kind}):`, error)
    res.status(500).json({ error: 'Restore failed -- nothing was changed.' })
  }
})

export default router
