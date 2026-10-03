import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { syncCalendarEvent } from '../lib/calendarAutoSync.js'
import { listTrash, getTrashEntry, removeFromTrash } from '../lib/trashStore.js'
import { includeCourse } from '../lib/canvasExclusions.js'
import { DEFAULT_WEEK_PLAN } from './gym.js'
import { round2, recordHistorySnapshot, DEBT_TYPES } from './finance.js'

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
  'family-member': (snapshot) => {
    pushIfAbsent('family_members', snapshot)
  },
  'family-log': (snapshot) => {
    pushIfAbsent('family_log', snapshot)
  },
  'reading-book': (snapshot) => {
    pushIfAbsent('reading_books', snapshot.book)
    for (const session of snapshot.sessions || []) {
      pushIfAbsent('reading_sessions', session)
    }
  },
  'reading-session': (snapshot) => {
    pushIfAbsent('reading_sessions', snapshot)
  },
  'mind-habit': (snapshot) => {
    pushIfAbsent('mind_habits', snapshot.habit)
    for (const completion of snapshot.completions || []) {
      pushIfAbsent('mind_completions', completion)
    }
  },
  'health-entry': (snapshot) => {
    pushIfAbsent('health', snapshot)
  },
  // Re-adds exactly the XP amount the original delete subtracted
  // (snapshot.xpDelta, captured at delete time -- see routes/skills.js's
  // DELETE /sessions/:id) rather than recomputing quantity+BASE_SESSION_XP,
  // which could overshoot if the original subtraction got clamped at 0.
  // If the skill itself no longer exists, the session still comes back --
  // just without an XP replay, same "never throws, best-effort" rule as
  // every other handler here.
  'skill-session': (snapshot) => {
    const added = pushIfAbsent('skill_sessions', snapshot.session)
    if (added && snapshot.xpDelta) {
      const skills = loadData('skills')
      const skill = skills.find((s) => s.id === snapshot.skillId)
      if (skill) {
        skill.xp = (skill.xp || 0) + snapshot.xpDelta
        saveData('skills', skills)
      }
    }
  },
  'sports-session': async (snapshot) => {
    await restoreRecord('sports_sessions', snapshot, {
      title: snapshot.type === 'game' ? `Game${snapshot.opponent ? ` vs ${snapshot.opponent}` : ''}` : 'Sports practice',
      date: snapshot.date,
      mode: 'sports',
    })
  },
  'sports-recurring-event': (snapshot) => {
    pushIfAbsent('sports_recurring_events', snapshot)
  },
  'gym-exercise': (snapshot) => {
    pushIfAbsent('gym_exercises', snapshot)
  },
  'gym-session': async (snapshot) => {
    await restoreRecord('gym_sessions', snapshot, { title: 'Gym session', date: snapshot.date, mode: 'gym' })
  },
  'gym-recurring-event': (snapshot) => {
    pushIfAbsent('gym_recurring_events', snapshot)
  },
  'gym-log': (snapshot) => {
    pushIfAbsent('gym_logs', snapshot)
  },
  // Puts the routine back, then reinstates its week-plan day assignments
  // and date overrides ONLY where that slot is still unset -- if Dylan
  // picked a different routine for a day in the meantime, this restore
  // must not clobber that newer choice.
  'gym-routine': (snapshot) => {
    pushIfAbsent('gym_routines', snapshot.routine)

    const weekPlan = loadData('gym_week_plan', DEFAULT_WEEK_PLAN)
    let weekPlanChanged = false
    for (const day of snapshot.weekDays || []) {
      if (!weekPlan[day]) {
        weekPlan[day] = snapshot.routine.id
        weekPlanChanged = true
      }
    }
    if (weekPlanChanged) saveData('gym_week_plan', weekPlan)

    const overrides = loadData('gym_week_plan_overrides', {})
    let overridesChanged = false
    for (const date of Object.keys(snapshot.overrides || {})) {
      if (!overrides[date]) {
        overrides[date] = snapshot.overrides[date]
        overridesChanged = true
      }
    }
    if (overridesChanged) saveData('gym_week_plan_overrides', overrides)
  },
  'finance-account': (snapshot) => {
    const accounts = loadData('finance_accounts')
    if (accounts.some((a) => a.id === snapshot.id)) return
    accounts.push(snapshot)
    saveData('finance_accounts', accounts)
    recordHistorySnapshot(accounts)
  },
  // Re-applies the exact same signed balance effect the original delete
  // reversed (see routes/finance.js's DELETE /transactions/:id) -- not a
  // recomputation from today's account state, so this stays correct even
  // if the account's asset/debt type were ever to change later. If the
  // account no longer exists (hadAccount captured false, or it's since
  // been deleted), the transaction still comes back, just without a
  // balance replay -- same "never throws, best-effort" rule as every
  // other handler here.
  'finance-transaction': (snapshot) => {
    const { transaction, hadAccount } = snapshot
    const transactions = loadData('finance_transactions')
    if (transactions.some((t) => t.id === transaction.id)) return

    const accounts = loadData('finance_accounts')
    const account = accounts.find((a) => a.id === transaction.accountId)
    if (hadAccount && account) {
      const isDebtAccount = DEBT_TYPES.includes(account.type)
      const direction = transaction.type === 'expense' ? -1 : 1
      const signedDelta = isDebtAccount ? -direction * transaction.amount : direction * transaction.amount
      account.balance = round2((Number(account.balance) || 0) + signedDelta)
      account.updatedAt = new Date().toISOString()
      saveData('finance_accounts', accounts)
    }

    transactions.push(transaction)
    saveData('finance_transactions', transactions)
    recordHistorySnapshot(accounts)
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
