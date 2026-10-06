import { useState } from 'react'

const WEEKDAYS = [
  ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'],
]

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function WindowRow({ window, weekday, date, onSave, onDelete }) {
  const [draft, setDraft] = useState({ ...window, ...(weekday ? { weekday } : {}), ...(date ? { date } : {}) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError('')
    try {
      await onDelete()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="availability-window-row">
      {weekday && (
        <select aria-label="Availability weekday" value={draft.weekday} onChange={(event) => setDraft((old) => ({ ...old, weekday: event.target.value }))}>
          {WEEKDAYS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      )}
      {date && <input aria-label="Override date" type="date" value={draft.date} onChange={(event) => setDraft((old) => ({ ...old, date: event.target.value }))} />}
      <label>Start <input type="time" value={draft.startTime} onChange={(event) => setDraft((old) => ({ ...old, startTime: event.target.value }))} /></label>
      <label>End <input type="time" value={draft.endTime} onChange={(event) => setDraft((old) => ({ ...old, endTime: event.target.value }))} /></label>
      <label className="availability-enabled"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft((old) => ({ ...old, enabled: event.target.checked }))} /> Enabled</label>
      <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={remove} disabled={saving}>Delete</button>
      {error && <small className="journal-error">{error}</small>}
    </div>
  )
}

export default function AvailabilitySettings({ availability, saveAvailability }) {
  const config = availability || { weeklyWindows: [], dateOverrides: [] }
  const [weekday, setWeekday] = useState('monday')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function persist(next) {
    setError('')
    setSaving(true)
    try {
      await saveAvailability(next)
    } catch (saveError) {
      setError(saveError.message)
      throw saveError
    } finally {
      setSaving(false)
    }
  }

  async function addWindow() {
    if (!date && (!startTime || !endTime)) return setError('Choose both a start and end time.')
    if (date && Boolean(startTime) !== Boolean(endTime)) return setError('Enter both times, or leave both blank to override this date with no work window.')
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose a valid override date.')
    try {
      if (date) {
        const existing = config.dateOverrides.find((item) => item.date === date)
        const windows = startTime ? [...(existing?.windows || []), { id: newId(), startTime, endTime, enabled: true }] : []
        const override = { id: existing?.id || newId(), date, enabled: true, windows }
        await persist({
          ...config,
          dateOverrides: existing
            ? config.dateOverrides.map((item) => item.id === existing.id ? override : item)
            : [...config.dateOverrides, override],
        })
      } else {
        await persist({
          ...config,
          weeklyWindows: [...config.weeklyWindows, { id: newId(), weekday, startTime, endTime, enabled: true }],
        })
      }
      setStartTime('')
      setEndTime('')
    } catch {
      return
    }
  }

  async function updateWindow(draft, isDateOverride, overrideId) {
    if (isDateOverride) {
      const oldOverride = config.dateOverrides.find((item) => item.id === overrideId)
      if (!oldOverride) return
      const changedDate = draft.date !== oldOverride.date
      await persist({
        ...config,
        dateOverrides: config.dateOverrides.map((item) => item.id === overrideId ? {
          ...item,
          date: draft.date,
          windows: item.windows.map((window) => window.id === draft.id
            ? { id: draft.id, startTime: draft.startTime, endTime: draft.endTime, enabled: draft.enabled }
            : window),
        } : item).filter((item) => !changedDate || item.id !== overrideId || item.date === draft.date),
      })
      return
    }
    await persist({
      ...config,
      weeklyWindows: config.weeklyWindows.map((window) => window.id === draft.id
        ? { ...window, weekday: draft.weekday, startTime: draft.startTime, endTime: draft.endTime, enabled: draft.enabled }
        : window),
    })
  }

  async function removeWindow(id, isDateOverride, overrideId) {
    if (isDateOverride) {
      const override = config.dateOverrides.find((item) => item.id === overrideId)
      if (!override) return
      const windows = override.windows.filter((window) => window.id !== id)
      await persist({
        ...config,
        dateOverrides: windows.length
          ? config.dateOverrides.map((item) => item.id === overrideId ? { ...item, windows } : item)
          : config.dateOverrides.filter((item) => item.id !== overrideId),
      })
      return
    }
    await persist({ ...config, weeklyWindows: config.weeklyWindows.filter((window) => window.id !== id) })
  }

  async function removeOverride(id) {
    await persist({ ...config, dateOverrides: config.dateOverrides.filter((item) => item.id !== id) })
  }

  return (
    <div className="classic-tools availability-settings">
      <span className="eyebrow">WORK AVAILABILITY</span>
      <p className="classic-tools-note">
        Add times when you are generally willing and able to focus. These are declarations, not guaranteed free time; Dylan AI subtracts known scheduled commitments. No windows means capacity stays unknown.
      </p>
      <div className="availability-add-row">
        <select aria-label="Availability weekday" value={weekday} onChange={(event) => setWeekday(event.target.value)}>
          {WEEKDAYS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
        <label>Start <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>End <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <button type="button" onClick={() => { setDate(''); addWindow() }} disabled={saving || !startTime || !endTime}>Add weekday window</button>
      </div>
      {config.weeklyWindows.map((window) => (
        <WindowRow key={window.id} window={window} weekday={window.weekday}
          onSave={(draft) => updateWindow(draft, false)}
          onDelete={() => removeWindow(window.id, false)} />
      ))}
      <div className="availability-add-row">
        <label>Date override <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Start <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>End <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <button type="button" onClick={addWindow} disabled={saving || !date}>Set date override</button>
      </div>
      {config.dateOverrides.map((override) => (
        <div className="availability-override" key={override.id}>
          <div className="availability-override-heading">
            <strong>{override.date}</strong>
            <label className="availability-enabled">
              <input type="checkbox" checked={override.enabled !== false} onChange={(event) => persist({
                ...config,
                dateOverrides: config.dateOverrides.map((item) => item.id === override.id ? { ...item, enabled: event.target.checked } : item),
              }).catch(() => {})} /> Override enabled
            </label>
            <button type="button" onClick={() => removeOverride(override.id)} disabled={saving}>Remove override</button>
          </div>
          {!override.windows.length && <p className="mode-page-note">No work window is declared for this date; the weekday pattern is replaced.</p>}
          {override.windows.map((window) => (
            <WindowRow key={window.id} window={window} date={override.date}
              onSave={(draft) => updateWindow(draft, true, override.id)}
              onDelete={() => removeWindow(window.id, true, override.id)} />
          ))}
        </div>
      ))}
      {error && <p className="journal-error">{error}</p>}
      {!config.weeklyWindows.length && !config.dateOverrides.length && <p className="mode-page-note">Not configured — daily capacity remains unknown.</p>}
    </div>
  )
}
