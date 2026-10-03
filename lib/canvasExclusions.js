import { loadData, saveData } from './dataStore.js'

/*
  Canvas's own sync (routes/canvas.js's /sync-classes, run automatically
  on every app load via useCanvas.js's checkStatus -> loadAssignments)
  recreates any class whose canvasCourseId isn't already linked locally
  -- that's the whole point of it existing (link up a newly-added Canvas
  course without Dylan doing anything). But it has no way to tell "this
  course was never linked yet" apart from "Dylan deliberately deleted the
  class for this course" -- both look identical (no local class with that
  canvasCourseId) from sync-classes's point of view. Without this list, a
  Canvas-linked class Dylan deletes comes right back on the next page
  load or refresh, which is exactly the bug he hit: delete "CP English
  11", refresh, it's back.

  This is the fix: a small persisted list of course ids Dylan has
  explicitly deleted. sync-classes skips anything in it. Restoring the
  class (via the trash panel, or School's own undo) takes it back out,
  so the course goes back to syncing normally -- deleting it again just
  re-adds it here, same as before.
*/

const COLLECTION = 'canvas_excluded_courses'

export function excludeCourse(courseId) {
  if (courseId === undefined || courseId === null) return
  const ids = loadData(COLLECTION)
  if (!ids.includes(courseId)) {
    ids.push(courseId)
    saveData(COLLECTION, ids)
  }
}

export function includeCourse(courseId) {
  if (courseId === undefined || courseId === null) return
  const ids = loadData(COLLECTION)
  const remaining = ids.filter((id) => id !== courseId)
  if (remaining.length !== ids.length) {
    saveData(COLLECTION, remaining)
  }
}

export function isExcluded(courseId) {
  return loadData(COLLECTION).includes(courseId)
}
