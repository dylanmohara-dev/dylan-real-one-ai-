import { createEvent, updateEvent, deleteEvent, LIFE_MODE_KEYS } from './appleCalendar.js'

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/
const VALID_MODES = new Set(LIFE_MODE_KEYS)

/*
  Best-effort, one-way bridge from an app record (a task, test, assignment,
  goal, or sports session) to a real all-day event on Dylan's actual
  "Dylan AI" iCloud calendar target. Dylan asked for this directly:
  "everything I add in the app should automatically be put under Dylan AI
  calendar." Unlike chat's create_event (session 23), there is no
  confirm-first step here -- Dylan is the one directly typing/saving these
  records himself, so this isn't a model guessing at something to write; it's
  the app finishing the write Dylan already asked for by hand, the same way
  the existing "shows on the in-app Calendar" behavior already treats a
  dueDate as calendar-relevant, just now as a real iCloud event too.

  Deliberately scoped to record types that represent ONE discrete dated
  thing -- a deadline, or a single practice/game. Gym exercise logs and
  skill/health entries are NOT synced here even though they carry dates:
  those are granular, several-per-day logs of things already done (one gym
  session alone can produce 5+ separate exercise-log rows), and syncing
  each one would flood the real calendar with near-duplicate events for a
  single day instead of one meaningful entry. If Dylan wants those on the
  calendar too, that's a different design (one event per gym DAY, not per
  log row) worth its own pass rather than bolting onto this one.

  Mutates `record` in place with calendarEventUrl/calendarEventEtag/
  calendarEventUid so a later edit or delete can find the same event again
  -- exactly like the existing studyPlanFor tagging pattern this project
  already uses to let a generated feature find/clean up its own records.
  The caller is responsible for saving `record` afterward via its own
  saveData() call, same as any other field on it.

  Never throws: a calendar write failing (no calendar chosen yet, iCloud
  unreachable, a stale etag) must never block the primary task/test/etc.
  save the user is waiting on -- consistent with the project's standing
  rule that a background dependency that can be down shouldn't be
  load-bearing for a feature that doesn't strictly need it to succeed.
  Failures are logged server-side so a persistent problem is still
  diagnosable without becoming a user-facing error on an ordinary save.
*/
export async function syncCalendarEvent(record, { title, date, mode, location } = {}) {
  try {
    const validTitle = typeof title === 'string' ? title.trim() : ''
    const validDate = typeof date === 'string' && BARE_DATE.test(date) ? date : null

    if (!validTitle || !validDate) {
      // No longer has enough to make a real calendar event out of (date
      // cleared, or never had one to begin with) -- if it USED to have a
      // synced event, clean that up rather than leaving an orphaned real
      // event nothing in the app can find or manage anymore.
      await clearCalendarEvent(record)
      return
    }

    const resolvedMode = mode && VALID_MODES.has(mode) ? mode : undefined

    if (record.calendarEventUrl && record.calendarEventUid) {
      // Already synced -- update the existing event in place rather than
      // creating a second one, so editing a due date MOVES the real
      // calendar entry instead of leaving a stale one behind alongside a
      // new one.
      try {
        const result = await updateEvent({
          url: record.calendarEventUrl,
          etag: record.calendarEventEtag || undefined,
          uid: record.calendarEventUid,
          title: validTitle,
          start: validDate,
          end: validDate,
          allDay: true,
          location,
        })
        record.calendarEventEtag = result?.etag || null
        return
      } catch (updateError) {
        // A stale-etag conflict ("changed elsewhere") is NOT transient --
        // without clearing the link, every future sync retries the exact
        // same doomed write against the same stale etag forever. Found
        // this live: one stuck record logged this identical failure 300+
        // times across repeat syncs, never once recovering on its own.
        // Clear the link and fall through to the "create a fresh event"
        // path below, in the SAME call, so the record leaves this
        // function in a valid synced state instead of a permanently
        // broken one the caller silently never persists a fix for. The
        // tradeoff is one possible duplicate on the real calendar (the
        // old, now-orphaned event stays until manually removed there)
        // rather than a silent, permanent failure loop.
        if (!/changed elsewhere/.test(updateError.message)) throw updateError
        record.calendarEventUrl = null
        record.calendarEventEtag = null
        record.calendarEventUid = null
      }
    }

    const created = await createEvent({
      title: validTitle,
      start: validDate,
      end: validDate,
      allDay: true,
      location,
      mode: resolvedMode,
    })
    record.calendarEventUrl = created.url
    record.calendarEventEtag = created.etag || null
    record.calendarEventUid = created.uid
  } catch (error) {
    console.error(`AUTO_CALENDAR_SYNC_FAILED ("${title || record?.id}"):`, error.message)
  }
}

/*
  Removes the real calendar event linked to a record, if any -- called
  when the record itself is deleted, or edited to no longer have a valid
  date/title. Same best-effort contract as syncCalendarEvent above: never
  throws, so deleting a task can never fail just because its calendar
  cleanup failed. Always clears the link fields off the record even if the
  real delete itself failed, since a broken link is useless either way and
  would otherwise make every future edit try (and fail) the same delete
  again.
*/
export async function clearCalendarEvent(record) {
  if (!record?.calendarEventUrl) return
  try {
    await deleteEvent({ url: record.calendarEventUrl, etag: record.calendarEventEtag || undefined })
  } catch (error) {
    console.error(`AUTO_CALENDAR_SYNC_DELETE_FAILED ("${record.title || record.id}"):`, error.message)
  } finally {
    delete record.calendarEventUrl
    delete record.calendarEventEtag
    delete record.calendarEventUid
  }
}
