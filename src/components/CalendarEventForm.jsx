import { useState } from 'react'
import { LIFE_MODES } from '../data/lifeModes.js'

// Local <input type="datetime-local"> / <input type="date"> values are
// naive strings with no timezone (e.g. "2026-09-10T14:30"). Interpreting
// that as a LOCAL time and converting to an ISO string here is what makes
// "2:30 PM" in the form actually mean 2:30 PM on Dylan's Mac once it's UTC
// on the wire and back through toICalUTC() on the server — getting this
// wrong is exactly how a calendar app quietly puts everything a timezone
// off.
function localInputToISO(value, isDate) {
  if (!value) return null
  if (isDate) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d).toISOString()
  }
  return new Date(value).toISOString()
}

function isoToLocalInput(iso, isDate) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  if (isDate) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CalendarEventForm({ initial, defaultDateKey, targetCalendarUrl, onSave, onCancel }) {
  const isEdit = Boolean(initial)
  const [title, setTitle] = useState(initial?.title || '')
  const [allDay, setAllDay] = useState(initial?.allDay ?? false)
  const [startInput, setStartInput] = useState(
    initial ? isoToLocalInput(initial.start, initial.allDay) : (allDay ? defaultDateKey : `${defaultDateKey}T09:00`)
  )
  const [endInput, setEndInput] = useState(
    initial ? isoToLocalInput(initial.end, initial.allDay) : (allDay ? defaultDateKey : `${defaultDateKey}T10:00`)
  )
  const [location, setLocation] = useState(initial?.location || '')
  const [mode, setMode] = useState(initial?.mode && initial.mode !== 'calendar' ? initial.mode : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Repeat pattern — only offered on NEW events. Not supported on edit:
  // an existing event's recurrence can't be changed from here (same
  // standing limitation as everything else about recurring events in
  // this app — see isRecurring elsewhere in the codebase).
  const [repeatFreq, setRepeatFreq] = useState('')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatEndType, setRepeatEndType] = useState('never')
  const [repeatCount, setRepeatCount] = useState(10)
  const [repeatUntil, setRepeatUntil] = useState('')

  // Fixed once an event exists — moving it to a different life area means
  // it lives on a different iCloud calendar, and this form doesn't move
  // events between calendars (see resolveCalendarForMode in
  // lib/appleCalendar.js). Delete and recreate to move one for now.
  const currentModeLabel = LIFE_MODES.find((m) => m.key === initial?.mode)?.title || 'General (no life area)'

  function toggleAllDay(next) {
    setAllDay(next)
    // Re-seed the inputs in the new shape so the user isn't left staring at
    // a stale datetime-local value in a now-plain date field (or vice
    // versa) that silently gets misread.
    setStartInput(next ? startInput.slice(0, 10) : `${startInput.slice(0, 10)}T09:00`)
    setEndInput(next ? endInput.slice(0, 10) : `${endInput.slice(0, 10)}T10:00`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!targetCalendarUrl) {
      setError('No target calendar chosen yet — pick one in Settings first.')
      return
    }

    const start = localInputToISO(startInput, allDay)
    const end = localInputToISO(endInput, allDay) || start

    let recurrence = null
    if (!isEdit && repeatFreq) {
      recurrence = {
        freq: repeatFreq,
        interval: Math.max(1, Number(repeatInterval) || 1),
      }
      if (repeatEndType === 'count') {
        recurrence.count = Math.max(1, Number(repeatCount) || 1)
      } else if (repeatEndType === 'until' && repeatUntil) {
        recurrence.until = localInputToISO(repeatUntil, true)
      }
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        uid: initial?.uid,
        url: initial?.url,
        etag: initial?.etag,
        title: title.trim(),
        start,
        end,
        allDay,
        location: location.trim(),
        mode: mode || null,
        recurrence,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="calendar-event-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <label className="calendar-form-checkbox">
        <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
        All day
      </label>

      <div className="calendar-form-row">
        <label>
          Start
          <input
            type={allDay ? 'date' : 'datetime-local'}
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
          />
        </label>
        <label>
          End
          <input
            type={allDay ? 'date' : 'datetime-local'}
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
          />
        </label>
      </div>

      <input
        type="text"
        placeholder="Location (optional)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      {!isEdit && (
        <div className="calendar-form-repeat">
          <label>
            Repeat
            <select value={repeatFreq} onChange={(e) => setRepeatFreq(e.target.value)}>
              <option value="">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>

          {repeatFreq && (
            <>
              <label className="calendar-form-repeat-interval">
                Every
                <input
                  type="number"
                  min="1"
                  value={repeatInterval}
                  onChange={(e) => setRepeatInterval(e.target.value)}
                />
                {repeatFreq === 'DAILY' && 'day(s)'}
                {repeatFreq === 'WEEKLY' && 'week(s)'}
                {repeatFreq === 'MONTHLY' && 'month(s)'}
                {repeatFreq === 'YEARLY' && 'year(s)'}
              </label>

              <div className="calendar-form-repeat-end">
                <label>
                  <input
                    type="radio"
                    name="repeatEnd"
                    checked={repeatEndType === 'never'}
                    onChange={() => setRepeatEndType('never')}
                  />
                  Never ends
                </label>
                <label>
                  <input
                    type="radio"
                    name="repeatEnd"
                    checked={repeatEndType === 'count'}
                    onChange={() => setRepeatEndType('count')}
                  />
                  After
                  <input
                    type="number"
                    min="1"
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(e.target.value)}
                    disabled={repeatEndType !== 'count'}
                  />
                  times
                </label>
                <label>
                  <input
                    type="radio"
                    name="repeatEnd"
                    checked={repeatEndType === 'until'}
                    onChange={() => setRepeatEndType('until')}
                  />
                  Until
                  <input
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    disabled={repeatEndType !== 'until'}
                  />
                </label>
              </div>

              <span className="calendar-form-mode-hint">
                Once created, a repeating event can only be edited or deleted from Apple Calendar directly — not from here.
              </span>
            </>
          )}
        </div>
      )}

      <label className="calendar-form-mode">
        Life area
        {isEdit ? (
          <input type="text" value={currentModeLabel} disabled />
        ) : (
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">General (no life area)</option>
            {LIFE_MODES.map((m) => (
              <option key={m.key} value={m.key}>{m.title}</option>
            ))}
          </select>
        )}
        {!isEdit && (
          <span className="calendar-form-mode-hint">
            Only shows up as its own color in Apple Calendar if this area has its own calendar mapped in Settings — otherwise it still saves fine here, just filed as general.
          </span>
        )}
      </label>

      {error && <p className="journal-error">{error}</p>}

      <div className="calendar-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add to calendar'}
        </button>
      </div>
    </form>
  )
}
