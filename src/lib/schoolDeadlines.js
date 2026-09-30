// Shared "Coming up" deadline logic -- pulled out of SchoolPage.jsx
// (session 40) so the same real merge/sort/color logic can also drive the
// new Home-screen (OverviewPage.jsx) assignment widget, rather than a
// second hand-copied implementation that could quietly drift from this
// one. Anything that changes how a deadline row is computed belongs here,
// once, for both call sites.

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// UTC-anchored day-number math -- a bare 'YYYY-MM-DD' has no timezone of
// its own, and comparing dates any other way (e.g. new Date(dateKey), or
// subtracting two Date objects in local time) can walk the answer off by
// a day depending on where the browser thinks "local" is. Deliberately
// never round-tripped through a timezone-aware Date for this reason.
export function daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayForDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

const CHIP_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function dateChipParts(dateKey) {
  if (!dateKey) return { month: '--', day: '--' }
  const [, m, d] = dateKey.split('-')
  const monthIdx = Number(m) - 1
  return { month: CHIP_MONTHS[monthIdx] || '--', day: d || '--' }
}

export function deadlineLabel(daysUntil, dateKey) {
  const weekday = dateKey ? ` (${weekdayForDateKey(dateKey)})` : ''
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue${weekday}`
  if (daysUntil === 0) return `Due today${weekday}`
  if (daysUntil === 1) return `Due tomorrow${weekday}`
  return `Due in ${daysUntil} days${weekday}`
}

const LINGER_MS = 24 * 60 * 60 * 1000

// An item that was just checked off stays visible for 24h after
// completedAt, so it doesn't instantly vanish from the list before its
// completion animation/toast is actually seen.
export function stillLingering(item) {
  if (!item.completed || !item.completedAt) return false
  return Date.now() - new Date(item.completedAt).getTime() < LINGER_MS
}

export function upcomingItems(classes, assignments, tests, canvasAssignments, canvasCompletions) {
  const today = todayKey()
  const classNameById = Object.fromEntries(classes.map((c) => [c.id, c.name]))
  const classIdByCourseId = Object.fromEntries(
    classes.filter((c) => c.canvasCourseId).map((c) => [c.canvasCourseId, c.id])
  )

  const fromAssignments = assignments
    .filter((a) => a.dueDate && (!a.completed || stillLingering(a)))
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'Assignment',
      title: a.title,
      className: classNameById[a.classId] || 'Unknown class',
      classId: a.classId,
      dueDate: a.dueDate,
      completed: Boolean(a.completed),
      raw: a,
    }))

  const fromTests = tests
    .filter((t) => t.date && (!t.completed || stillLingering(t)))
    .map((t) => ({
      id: `test-${t.id}`,
      kind: 'Test',
      title: t.title,
      className: classNameById[t.classId] || 'Unknown class',
      classId: t.classId,
      dueDate: t.date,
      completed: Boolean(t.completed),
      raw: t,
    }))

  const fromCanvas = (canvasAssignments || [])
    .filter((c) => c.dueAt)
    .map((c) => {
      const classId = classIdByCourseId[c.courseId] || null
      const completion = (canvasCompletions || {})[c.id]
      return {
        id: c.id,
        kind: 'Canvas',
        title: c.title,
        className: (classId && classNameById[classId]) || c.courseName || 'Canvas',
        classId,
        dueDate: c.dueAt.slice(0, 10),
        completed: Boolean(completion?.completed),
        completedAt: completion?.completedAt || null,
        raw: c,
      }
    })
    .filter((c) => !c.raw.submitted || (c.completed && stillLingering(c)))

  return [...fromAssignments, ...fromTests, ...fromCanvas]
    .map((item) => ({ ...item, daysUntil: daysBetween(today, item.dueDate) }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

// Deterministic per-class accent color -- see the longer explanation that
// used to live with this in SchoolPage.jsx: 4 curated hues (not a wider
// hash palette) chosen not to clash with the gold theme, hashed off the
// class id so every class (including ones saved before this existed) gets
// a distinct, legible color with no migration and no new field.
export const CLASS_COLOR_PALETTE = [
  '111, 198, 222', // teal
  '227, 138, 155', // maroon
  '199, 158, 224', // plum
  '127, 216, 160', // green
]

export function classColorRgb(classId) {
  const key = String(classId || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return CLASS_COLOR_PALETTE[hash % CLASS_COLOR_PALETTE.length]
}
