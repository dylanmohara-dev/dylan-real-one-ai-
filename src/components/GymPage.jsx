import { useState, useRef } from 'react'
import { Dumbbell, Trophy, Plus } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import ModeCalendarMonth, { RecurringEventsManager, formatTimeRange } from './ModeCalendarMonth.jsx'

// Epley estimated 1-rep-max: weight * (1 + reps/30). A standard, simple
// approximation used to compare strength across different rep ranges --
// not lab-accurate, just enough to see "am I actually getting stronger."
function epley1RM(weight, reps) {
  if (!weight || !reps) return 0
  return weight * (1 + reps / 30)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Date.getDay(): 0 = Sunday .. 6 = Saturday. Used only to find "today" in
// WEEKDAY_ORDER below -- display order is always Monday-first regardless.
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WEEKDAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

// A fixed Mon-Sun -> routine mapping assumes training repeats identically
// every calendar week, tied to weekday names -- wrong for a rotating
// split (Push/Pull/Legs/Rest, cycling regardless of weekday) or a one-off
// swap. A per-date override always wins; see routes/gym.js's comment.
function dateWeekdayKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_KEYS[new Date(y, m - 1, d).getDay()]
}

function effectiveRoutineId(weekPlan, overrides, dateKey) {
  if (overrides && dateKey in overrides) return overrides[dateKey] || null
  return weekPlan?.[dateWeekdayKey(dateKey)] || null
}

// Compares the last `days` days' effective plan against which exercises
// actually got logged -- the direct answer to "does my routine fit what
// I'm actually training," instead of the week plan and the real logs
// being two disconnected views.
function planAdherence(weekPlan, overrides, logs, routines, days) {
  const rows = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const dateKey = daysAgoKey(i)
    const routineId = effectiveRoutineId(weekPlan, overrides, dateKey)
    const routine = routineId ? routines.find((r) => r.id === routineId) : null
    const loggedToday = logs.filter((l) => l.date === dateKey)
    let status
    if (!routine) {
      status = loggedToday.length > 0 ? 'extra' : 'match'
    } else {
      const plannedExerciseIds = new Set(routine.exerciseIds)
      const hitAny = loggedToday.some((l) => plannedExerciseIds.has(l.exerciseId))
      if (loggedToday.length === 0) status = 'missed'
      else if (hitAny) status = 'match'
      else status = 'different'
    }
    rows.push({ dateKey, weekdayKey: dateWeekdayKey(dateKey), routine, loggedCount: loggedToday.length, status })
  }
  return rows
}

function bestSetForLog(log) {
  return (log.sets || []).reduce(
    (best, set) => {
      const weight = Number(set.weight) || 0
      const reps = Number(set.reps) || 0
      const oneRM = epley1RM(weight, reps)
      return oneRM > best.oneRM ? { weight, reps, oneRM } : best
    },
    { weight: 0, reps: 0, oneRM: 0 }
  )
}

function sortLogsRecentFirst(logs) {
  return logs
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))
}

function lastLogForExercise(logs, exerciseId) {
  const matches = logs.filter((l) => l.exerciseId === exerciseId)
  if (!matches.length) return null
  return sortLogsRecentFirst(matches)[0]
}

// A simple, honest progression suggestion -- not a rigid program. If an
// exercise has a target (targetSets/targetReps, set from the Exercises
// tab) this looks at the most recent log and suggests what to try today:
// the same weight again, or +progressionIncrement if every set of the
// last session met the target reps. No target on the exercise -> no
// suggestion, freeform logging exactly like before.
function suggestedProgram(exercise, gymLogs) {
  if (!exercise?.targetSets || !exercise?.targetReps) return null
  const lastLog = lastLogForExercise(gymLogs, exercise.id)
  const increment = Number(exercise.progressionIncrement) || 0

  if (!lastLog) {
    return { sets: exercise.targetSets, reps: exercise.targetReps, weight: null, isFirstTime: true }
  }

  const sets = lastLog.sets || []
  const hitTarget =
    sets.length >= exercise.targetSets && sets.every((s) => (Number(s.reps) || 0) >= exercise.targetReps)
  const lastWeight = sets.reduce((max, s) => Math.max(max, Number(s.weight) || 0), 0)
  const weight = hitTarget ? lastWeight + increment : lastWeight

  return { sets: exercise.targetSets, reps: exercise.targetReps, weight, isFirstTime: false, hitTarget }
}

// "This week" = the trailing 7 days including today, compared as bare
// YYYY-MM-DD strings -- same timezone-safe approach as School's deadline
// dashboard, never round-tripped through new Date(bareDateString).
function weekVolume(logs) {
  const from = daysAgoKey(6)
  const to = todayKey()
  return logs
    .filter((l) => l.date >= from && l.date <= to)
    .reduce(
      (total, log) =>
        total + (log.sets || []).reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0),
      0
    )
}

function SetRow({ index, set, onChange, onRemove, canRemove }) {
  return (
    <div className="gym-set-row">
      <span className="gym-set-index">{index + 1}</span>
      <input
        type="number"
        min="0"
        placeholder="Reps"
        value={set.reps}
        onChange={(event) => onChange(index, { ...set, reps: event.target.value })}
      />
      <span className="gym-set-x">&times;</span>
      <input
        type="number"
        min="0"
        placeholder="lbs"
        value={set.weight}
        onChange={(event) => onChange(index, { ...set, weight: event.target.value })}
      />
      {canRemove && (
        <button className="gym-set-remove" onClick={() => onRemove(index)} title="Remove set" type="button">
          &times;
        </button>
      )}
    </div>
  )
}

// Self-contained "log this exercise" widget -- last-time data, a multi-set
// form, optional history -- reused by the Today tab (one per exercise in
// today's routine, collapsible so a 5-exercise day isn't 5 full forms at
// once) and the Exercises tab (one exercise at a time, always expanded,
// with full history).
function ExerciseLogger({ exercise, gymLogs, saving, addGymLog, deleteGymLog, showHistory = true, collapsible = false }) {
  const [expanded, setExpanded] = useState(!collapsible)
  const [logDate, setLogDate] = useState(todayKey())
  const [sets, setSets] = useState([{ reps: '', weight: '' }])

  const lastLog = lastLogForExercise(gymLogs, exercise.id)
  const lastBest = lastLog ? bestSetForLog(lastLog) : null
  const history = showHistory ? sortLogsRecentFirst(gymLogs.filter((l) => l.exerciseId === exercise.id)) : []

  function updateSet(index, next) {
    setSets((prev) => prev.map((s, i) => (i === index ? next : s)))
  }

  function removeSet(index) {
    setSets((prev) => prev.filter((_, i) => i !== index))
  }

  function addSetRow() {
    setSets((prev) => [...prev, { reps: '', weight: '' }])
  }

  async function handleLogWorkout() {
    const cleanSets = sets.filter((s) => s.reps !== '' || s.weight !== '')
    if (!cleanSets.length) return
    await addGymLog(exercise.id, logDate, cleanSets)
    setSets([{ reps: '', weight: '' }])
  }

  const suggestion = suggestedProgram(exercise, gymLogs)
  const suggestionNote = !suggestion
    ? ''
    : suggestion.isFirstTime
    ? 'first time -- pick a weight you can hit for all sets'
    : suggestion.hitTarget
    ? exercise.progressionIncrement
      ? `+${exercise.progressionIncrement} lbs -- you hit target last time`
      : 'you hit target last time -- try adding weight'
    : "repeat -- didn't hit target last time"

  function fillSuggested() {
    if (!suggestion) return
    setSets(
      Array.from({ length: suggestion.sets }, () => ({
        reps: String(suggestion.reps),
        weight: suggestion.weight ? String(suggestion.weight) : '',
      }))
    )
  }

  return (
    <div className="gym-exercise-logger">
      <button
        type="button"
        className={`gym-exercise-logger-header ${collapsible ? 'collapsible' : ''}`}
        onClick={() => collapsible && setExpanded((v) => !v)}
      >
        <div className="gym-exercise-name">
          <Dumbbell size={14} strokeWidth={2.25} />
          {exercise.name}
        </div>
        {lastBest && lastBest.oneRM > 0 && (
          <span className="gym-exercise-logger-last">
            last: {lastBest.weight} lbs &times; {lastBest.reps}
          </span>
        )}
      </button>

      {expanded && (
        <div className="gym-exercise-logger-body">
          {lastLog && lastBest && lastBest.oneRM > 0 && (
            <div className="gym-last-time">
              <span className="gym-last-time-label">LAST TIME ({lastLog.date})</span>
              <span className="gym-last-time-value">
                Best set: {lastBest.weight} lbs &times; {lastBest.reps} (~{Math.round(lastBest.oneRM)} lbs est.
                1RM)
              </span>
            </div>
          )}

          {suggestion && (
            <div className="gym-suggested-box">
              <div className="gym-suggested-text">
                <span className="gym-suggested-label">TODAY'S TARGET</span>
                <span className="gym-suggested-value">
                  {suggestion.sets}&times;{suggestion.reps}
                  {suggestion.weight ? ` @ ${suggestion.weight} lbs` : ''} ({suggestionNote})
                </span>
              </div>
              <button type="button" className="gym-suggested-fill" onClick={fillSuggested}>
                Use this
              </button>
            </div>
          )}

          <div className="form-card gym-log-form">
            <div className="gym-log-form-header">
              <input type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} />
            </div>

            {sets.map((set, index) => (
              <SetRow
                key={index}
                index={index}
                set={set}
                onChange={updateSet}
                onRemove={removeSet}
                canRemove={sets.length > 1}
              />
            ))}

            <div className="gym-log-form-actions">
              <button className="gym-add-set" onClick={addSetRow} type="button">
                <Plus size={13} strokeWidth={2.25} /> Add set
              </button>
              <button onClick={handleLogWorkout} disabled={saving}>
                Log workout
              </button>
            </div>
          </div>

          {showHistory && (
            <div className="items-list">
              {history.length ? (
                history.map((log) => {
                  const best = bestSetForLog(log)
                  const setCount = (log.sets || []).length
                  return (
                    <div className="item-card" key={log.id}>
                      <div className="item-content">
                        <strong>
                          <Trophy size={13} strokeWidth={2.25} className="gym-log-icon" />
                          {log.date}: {setCount} set{setCount === 1 ? '' : 's'}
                        </strong>
                        <div className="item-meta">
                          <span>
                            {(log.sets || []).map((s) => `${s.weight}×${s.reps}`).join(', ')} &mdash; best est.
                            1RM ~{Math.round(best.oneRM)} lbs
                          </span>
                        </div>
                      </div>
                      {deleteGymLog && (
                        <button className="delete-button" onClick={() => deleteGymLog(log.id)}>
                          &times;
                        </button>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="empty-state">
                  <div>&#128203;</div>
                  <h3>No logs yet</h3>
                  <p>Log your first set for {exercise.name} above.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One freeform note per day -- "how'd it go" -- shown at the top of
// Today, with a short trailing-week history underneath so a note is
// actually worth writing (a note you can never look back at is useless).
function DayNoteBox({ gymDayNotes, saving, setGymDayNote }) {
  const today = todayKey()
  const existing = gymDayNotes.find((n) => n.date === today)
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef(null)

  function handleSave() {
    setGymDayNote(today, textareaRef.current?.value || '')
    setDirty(false)
  }

  const recentNotes = gymDayNotes
    .filter((n) => n.date !== today && n.date >= daysAgoKey(6))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <div className="form-card gym-day-note">
        <span className="eyebrow">TODAY'S NOTE</span>
        <textarea
          key={existing?.id || 'new'}
          ref={textareaRef}
          rows={2}
          placeholder="How'd it go? Sore shoulder, felt strong, skipped legs..."
          defaultValue={existing?.note || ''}
          onChange={() => setDirty(true)}
        />
        {dirty && (
          <button type="button" onClick={handleSave} disabled={saving}>
            Save note
          </button>
        )}
      </div>

      {recentNotes.length > 0 && (
        <div className="gym-day-note-history">
          {recentNotes.map((n) => (
            <div className="gym-day-note-row" key={n.id}>
              <span className="gym-day-note-date">{n.date}</span>
              <span className="gym-day-note-text">{n.note}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function TodayRoutineOverrideControl({ dateKey, routineId, routines, overrides, setGymWeekPlanOverride }) {
  const [editing, setEditing] = useState(false)
  const hasOverride = dateKey in (overrides || {})

  if (!editing) {
    return (
      <button type="button" className="reading-goal-edit-link" onClick={() => setEditing(true)}>
        {hasOverride ? 'Change (overridden today)' : "Swap today's routine"}
      </button>
    )
  }

  return (
    <div className="reading-goal-edit-form">
      <select
        value={routineId || ''}
        onChange={(event) => {
          setGymWeekPlanOverride(dateKey, event.target.value || null)
          setEditing(false)
        }}
      >
        <option value="">Rest day</option>
        {routines.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {hasOverride && (
        <button
          type="button"
          onClick={() => {
            setGymWeekPlanOverride(dateKey, null)
            setEditing(false)
          }}
        >
          Revert to normal
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  )
}

function TodayTab({ gymExercises, gymLogs, gymRoutines, gymWeekPlan, gymWeekPlanOverrides, gymDayNotes, saving, addGymLog, setGymDayNote, setGymWeekPlanOverride }) {
  const dateKey = todayKey()
  const todayWeekdayKey = WEEKDAY_KEYS[new Date().getDay()]
  const routineId = effectiveRoutineId(gymWeekPlan, gymWeekPlanOverrides, dateKey)
  const routine = gymRoutines.find((r) => r.id === routineId) || null
  const routineExercises = routine
    ? routine.exerciseIds.map((id) => gymExercises.find((e) => e.id === id)).filter(Boolean)
    : []

  return (
    <div className="gym-today">
      <div className="gym-today-header">
        <span className="eyebrow">{WEEKDAY_LABELS[todayWeekdayKey]}</span>
        <h2 className="serif">{routine ? routine.name : 'Rest day'}</h2>
        <TodayRoutineOverrideControl
          dateKey={dateKey}
          routineId={routineId}
          routines={gymRoutines}
          overrides={gymWeekPlanOverrides}
          setGymWeekPlanOverride={setGymWeekPlanOverride}
        />
      </div>

      <DayNoteBox gymDayNotes={gymDayNotes} saving={saving} setGymDayNote={setGymDayNote} />

      {routine ? (
        routineExercises.length ? (
          <div className="gym-today-list">
            {routineExercises.map((exercise) => (
              <ExerciseLogger
                key={exercise.id}
                exercise={exercise}
                gymLogs={gymLogs}
                saving={saving}
                addGymLog={addGymLog}
                showHistory={false}
                collapsible
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>&#128203;</div>
            <h3>{routine.name} has no exercises yet</h3>
            <p>Add exercises to this routine in the Routines tab.</p>
          </div>
        )
      ) : (
        <div className="empty-state">
          <div>&#128564;</div>
          <h3>No routine scheduled for today</h3>
          <p>Set one up in the Routines tab, or log an exercise directly from the Exercises tab.</p>
        </div>
      )}
    </div>
  )
}

// Sets or clears a simple linear-progression program on one exercise --
// target sets/reps, plus a weight bump to suggest once you hit them. Not
// prescriptive: leaving it unset keeps that exercise pure freeform
// logging, same as every exercise was before this existed.
function ProgramForm({ exercise, saving, updateGymExercise }) {
  const [editing, setEditing] = useState(false)
  const [targetSets, setTargetSets] = useState(exercise.targetSets || '')
  const [targetReps, setTargetReps] = useState(exercise.targetReps || '')
  const [increment, setIncrement] = useState(exercise.progressionIncrement || '')

  const hasProgram = Boolean(exercise.targetSets && exercise.targetReps)

  function handleSave() {
    if (!targetSets || !targetReps) return
    updateGymExercise(exercise.id, {
      targetSets: Number(targetSets),
      targetReps: Number(targetReps),
      progressionIncrement: Number(increment) || 0,
    })
    setEditing(false)
  }

  function handleClear() {
    setTargetSets('')
    setTargetReps('')
    setIncrement('')
    updateGymExercise(exercise.id, { targetSets: null, targetReps: null, progressionIncrement: 0 })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="gym-program-summary">
        <span>
          {hasProgram
            ? `Program: ${exercise.targetSets}×${exercise.targetReps}${
                exercise.progressionIncrement ? `, +${exercise.progressionIncrement} lbs on hitting target` : ''
              }`
            : 'No program set -- freeform logging.'}
        </span>
        <button type="button" className="gym-program-edit" onClick={() => setEditing(true)}>
          {hasProgram ? 'Edit program' : 'Set a program'}
        </button>
      </div>
    )
  }

  return (
    <div className="form-card gym-program-form">
      <div className="gym-program-form-row">
        <input
          type="number"
          min="1"
          placeholder="Target sets"
          value={targetSets}
          onChange={(event) => setTargetSets(event.target.value)}
        />
        <input
          type="number"
          min="1"
          placeholder="Target reps"
          value={targetReps}
          onChange={(event) => setTargetReps(event.target.value)}
        />
        <input
          type="number"
          min="0"
          placeholder="+lbs on hit"
          value={increment}
          onChange={(event) => setIncrement(event.target.value)}
        />
      </div>
      <div className="gym-program-form-actions">
        <button onClick={handleSave} disabled={saving || !targetSets || !targetReps}>
          Save program
        </button>
        {hasProgram && (
          <button type="button" className="gym-program-clear" onClick={handleClear}>
            Clear
          </button>
        )}
        <button type="button" className="gym-program-cancel" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ExercisesTab({ gymExercises, gymLogs, saving, addGymExercise, deleteGymExercise, updateGymExercise, addGymLog, deleteGymLog }) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(gymExercises[0]?.id || null)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseCategory, setNewExerciseCategory] = useState('')

  const selectedExercise = gymExercises.find((e) => e.id === selectedExerciseId) || null

  function handleAddExercise() {
    if (!newExerciseName.trim()) return
    addGymExercise(newExerciseName, newExerciseCategory)
    setNewExerciseName('')
    setNewExerciseCategory('')
  }

  return (
    <div className="gym-layout">
      <div className="gym-exercise-column">
        <div className="form-card">
          <input
            value={newExerciseName}
            onChange={(event) => setNewExerciseName(event.target.value)}
            placeholder="New exercise (e.g. Bench Press)"
            onKeyDown={(event) => event.key === 'Enter' && handleAddExercise()}
          />
          <input
            value={newExerciseCategory}
            onChange={(event) => setNewExerciseCategory(event.target.value)}
            placeholder="Category (optional)"
            onKeyDown={(event) => event.key === 'Enter' && handleAddExercise()}
          />
          <button onClick={handleAddExercise} disabled={saving || !newExerciseName.trim()}>
            <Plus size={14} strokeWidth={2.5} /> Add
          </button>
        </div>

        <div className="gym-exercise-list">
          {gymExercises.length ? (
            gymExercises.map((exercise) => (
              <div
                key={exercise.id}
                className={`gym-exercise-card ${exercise.id === selectedExerciseId ? 'active' : ''}`}
                onClick={() => setSelectedExerciseId(exercise.id)}
              >
                <div className="gym-exercise-name">
                  <Dumbbell size={14} strokeWidth={2.25} />
                  {exercise.name}
                </div>
                {exercise.category && <span className="gym-exercise-category">{exercise.category}</span>}
                <button
                  className="delete-button"
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteGymExercise(exercise.id)
                    if (selectedExerciseId === exercise.id) setSelectedExerciseId(null)
                  }}
                >
                  &times;
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div>&#127947;</div>
              <h3>No exercises yet</h3>
              <p>Add your first exercise above &mdash; Bench Press, Squat, whatever you actually do.</p>
            </div>
          )}
        </div>
      </div>

      <div className="gym-log-column">
        {selectedExercise ? (
          <>
            <ProgramForm key={selectedExercise.id} exercise={selectedExercise} saving={saving} updateGymExercise={updateGymExercise} />
            <ExerciseLogger
              key={selectedExercise.id}
              exercise={selectedExercise}
              gymLogs={gymLogs}
              saving={saving}
              addGymLog={addGymLog}
              deleteGymLog={deleteGymLog}
              showHistory
            />
          </>
        ) : (
          <div className="empty-state">
            <div>&#128072;</div>
            <h3>Pick an exercise</h3>
            <p>Choose or add an exercise on the left to start logging.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RoutinesTab({
  gymExercises,
  gymLogs,
  gymRoutines,
  gymWeekPlan,
  gymWeekPlanOverrides,
  saving,
  addGymRoutine,
  updateGymRoutine,
  deleteGymRoutine,
  setGymWeekPlanDay,
}) {
  const [newRoutineName, setNewRoutineName] = useState('')
  const [newRoutineExerciseIds, setNewRoutineExerciseIds] = useState([])
  const [editingRoutineId, setEditingRoutineId] = useState(null)

  function toggleNewRoutineExercise(id) {
    setNewRoutineExerciseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleRoutineExercise(routine, exerciseId) {
    const nextIds = routine.exerciseIds.includes(exerciseId)
      ? routine.exerciseIds.filter((id) => id !== exerciseId)
      : [...routine.exerciseIds, exerciseId]
    updateGymRoutine(routine.id, { exerciseIds: nextIds })
  }

  function handleCreateRoutine() {
    if (!newRoutineName.trim()) return
    addGymRoutine(newRoutineName, newRoutineExerciseIds)
    setNewRoutineName('')
    setNewRoutineExerciseIds([])
  }

  return (
    <div className="gym-routines">
      <div className="form-card gym-routine-form">
        <input
          value={newRoutineName}
          onChange={(event) => setNewRoutineName(event.target.value)}
          placeholder="Routine name (e.g. Push Day)"
          onKeyDown={(event) => event.key === 'Enter' && handleCreateRoutine()}
        />
        {gymExercises.length ? (
          <div className="gym-routine-exercise-picker">
            {gymExercises.map((exercise) => (
              <label key={exercise.id} className="gym-routine-exercise-option">
                <input
                  type="checkbox"
                  checked={newRoutineExerciseIds.includes(exercise.id)}
                  onChange={() => toggleNewRoutineExercise(exercise.id)}
                />
                {exercise.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="gym-routine-empty-hint">Add exercises in the Exercises tab first, then come back here.</p>
        )}
        <button onClick={handleCreateRoutine} disabled={saving || !newRoutineName.trim()}>
          <Plus size={14} strokeWidth={2.5} /> Create routine
        </button>
      </div>

      <div className="gym-routine-list">
        {gymRoutines.length ? (
          gymRoutines.map((routine) => (
            <div className="gym-routine-card" key={routine.id}>
              <div className="gym-routine-card-header">
                <strong>{routine.name}</strong>
                <div className="gym-routine-card-actions">
                  <button
                    type="button"
                    className="gym-routine-edit-toggle"
                    onClick={() => setEditingRoutineId((id) => (id === routine.id ? null : routine.id))}
                  >
                    {editingRoutineId === routine.id ? 'Done' : 'Edit'}
                  </button>
                  <button className="delete-button" onClick={() => deleteGymRoutine(routine.id)}>
                    &times;
                  </button>
                </div>
              </div>

              {editingRoutineId === routine.id ? (
                <div className="gym-routine-exercise-picker">
                  {gymExercises.map((exercise) => (
                    <label key={exercise.id} className="gym-routine-exercise-option">
                      <input
                        type="checkbox"
                        checked={routine.exerciseIds.includes(exercise.id)}
                        onChange={() => toggleRoutineExercise(routine, exercise.id)}
                      />
                      {exercise.name}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="gym-routine-card-exercises">
                  {routine.exerciseIds.length
                    ? routine.exerciseIds
                        .map((id) => gymExercises.find((e) => e.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                    : 'No exercises yet -- click Edit to add some.'}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>&#128203;</div>
            <h3>No routines yet</h3>
            <p>Create one above &mdash; give it a name and pick which exercises belong to it.</p>
          </div>
        )}
      </div>

      <div className="gym-week-plan">
        <span className="eyebrow">WEEKLY SCHEDULE</span>
        {WEEKDAY_ORDER.map((day) => (
          <div className="gym-week-plan-row" key={day}>
            <span className="gym-week-plan-day">{WEEKDAY_LABELS[day]}</span>
            <select
              value={gymWeekPlan?.[day] || ''}
              onChange={(event) => setGymWeekPlanDay(day, event.target.value || null)}
            >
              <option value="">Rest / none</option>
              {gymRoutines.map((routine) => (
                <option key={routine.id} value={routine.id}>
                  {routine.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <PlanRealityCheck
        gymWeekPlan={gymWeekPlan}
        gymWeekPlanOverrides={gymWeekPlanOverrides}
        gymLogs={gymLogs}
        gymRoutines={gymRoutines}
      />
    </div>
  )
}

const GYM_ADHERENCE_LABELS = {
  match: 'Trained on plan',
  different: "Trained, but not this routine's exercises",
  missed: 'Nothing logged',
  extra: 'Logged, unscheduled',
}

// Same "only show the last 7 days' mismatches" reasoning as Sports'
// ScheduleRealityCheck -- a wall of "Monday: Trained on plan" every day is
// noise. This is the direct answer to "routines/week plan don't fit your
// training": it shows exactly where the plan and the real logs diverge,
// which a rigid weekday->routine mapping has no way to surface on its own.
function PlanRealityCheck({ gymWeekPlan, gymWeekPlanOverrides, gymLogs, gymRoutines }) {
  const rows = planAdherence(gymWeekPlan, gymWeekPlanOverrides, gymLogs, gymRoutines, 7)
  const mismatches = rows.filter((row) => row.status !== 'match')

  return (
    <div className="reality-check">
      <span className="eyebrow">LAST 7 DAYS: PLAN VS. REALITY</span>
      {mismatches.length === 0 ? (
        <p className="reality-check-empty">Every day this week matched what was actually logged.</p>
      ) : (
        <div className="items-list">
          {mismatches.map((row) => (
            <div className="item-card" key={row.dateKey}>
              <div className="item-content">
                <strong>
                  {WEEKDAY_LABELS[row.weekdayKey]} ({row.dateKey})
                </strong>
                <div className="item-meta">
                  <span>
                    Planned: {row.routine ? row.routine.name : 'Rest day'} &middot; {GYM_ADHERENCE_LABELS[row.status]}
                    {row.loggedCount > 0 ? ` (${row.loggedCount} exercise${row.loggedCount === 1 ? '' : 's'} logged)` : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function sortSessionsRecentFirst(sessions) {
  return sessions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))
}

// A gym VISIT, not an exercise -- start/end time plus an optional note.
// Separate from ExerciseLogger above on purpose (see routes/gym.js): this
// is the one-event-per-gym-day record the Calendar tab and the real
// calendar sync both need, distinct from the several-per-day exercise logs.
function GymSessionForm({ saving, addGymSession }) {
  const [date, setDate] = useState(todayKey())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit() {
    await addGymSession({ date, startTime, endTime, notes })
    setStartTime('')
    setEndTime('')
    setNotes('')
  }

  return (
    <div className="form-card sports-session-form">
      <div className="sports-session-form-header">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      <div className="mode-time-range-fields mode-time-range-inline">
        <label>
          Start
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          End
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>
      <textarea
        placeholder="Notes -- how'd it go?"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
      />
      <button onClick={handleSubmit} disabled={saving}>
        Log gym session
      </button>
    </div>
  )
}

// Gym's own Calendar -- separate from Sports', and from the main app-wide
// Calendar page. "Planned" comes from the recurring-events list (Mon/Wed
// lift at 6:00-7:00am, etc.); "actual" comes from logged gym sessions.
function GymCalendarTab({ gymRecurringEvents, gymSessions, saving, addGymSession, deleteGymSession, addGymRecurringEvent, deleteGymRecurringEvent }) {
  function getDayData(dateKey) {
    const weekday = dateWeekdayKey(dateKey)
    const planned = gymRecurringEvents
      .filter((event) => event.weekdays.includes(weekday))
      .map((event) => ({
        id: event.id,
        label: `${event.label} (${formatTimeRange(event.startTime, event.endTime)})`,
        timeLabel: formatTimeRange(event.startTime, event.endTime),
      }))
    const actual = gymSessions
      .filter((session) => session.date === dateKey)
      .map((session) => ({
        id: session.id,
        label: session.notes || 'Gym session',
        timeLabel:
          session.startTime && session.endTime ? formatTimeRange(session.startTime, session.endTime) : 'Logged',
      }))
    return { planned, actual }
  }

  const sortedSessions = sortSessionsRecentFirst(gymSessions)

  return (
    <div className="gym-today">
      <ModeCalendarMonth
        getDayData={getDayData}
        legend={
          <>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-planned" /> Scheduled
            </span>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-actual" /> Logged
            </span>
            <span className="mode-cal-legend-item">
              <span className="mode-cal-swatch swatch-missed" /> Missed
            </span>
          </>
        }
      />

      <GymSessionForm saving={saving} addGymSession={addGymSession} />

      <div className="items-list">
        {sortedSessions.length ? (
          sortedSessions.map((session) => (
            <div className="item-card" key={session.id}>
              <div className="item-content">
                <strong>
                  {session.date}
                  {session.startTime && session.endTime ? `: ${formatTimeRange(session.startTime, session.endTime)}` : ''}
                </strong>
                {session.notes && (
                  <div className="item-meta">
                    <span>{session.notes}</span>
                  </div>
                )}
              </div>
              <button className="delete-button" onClick={() => deleteGymSession(session.id)}>
                &times;
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>&#127947;</div>
            <h3>No sessions logged yet</h3>
            <p>Log your first gym visit above.</p>
          </div>
        )}
      </div>

      <RecurringEventsManager
        title="RECURRING GYM SESSIONS"
        events={gymRecurringEvents}
        saving={saving}
        addEvent={addGymRecurringEvent}
        deleteEvent={deleteGymRecurringEvent}
      />
    </div>
  )
}

export default function GymPage({
  gymExercises,
  gymLogs,
  gymRoutines,
  gymWeekPlan,
  gymWeekPlanOverrides,
  gymDayNotes,
  gymSessions,
  gymRecurringEvents,
  saving,
  addGymExercise,
  deleteGymExercise,
  updateGymExercise,
  addGymLog,
  deleteGymLog,
  addGymRoutine,
  updateGymRoutine,
  deleteGymRoutine,
  setGymWeekPlanDay,
  setGymWeekPlanOverride,
  setGymDayNote,
  addGymSession,
  deleteGymSession,
  addGymRecurringEvent,
  deleteGymRecurringEvent,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')

  const totalWeekVolume = weekVolume(gymLogs)
  const workoutsThisWeek = new Set(
    gymLogs.filter((l) => l.date >= daysAgoKey(6) && l.date <= todayKey()).map((l) => l.date)
  ).size

  return (
    <div className="page gym-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">GYM MODE</span>
          <h1 className="serif">Gym</h1>
          <p>Plan your week once, then just show up and log &mdash; last numbers and PR detection built in.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="gym" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">THIS WEEK</span>
          <span className="gym-stat-value">
            {workoutsThisWeek} {workoutsThisWeek === 1 ? 'session' : 'sessions'}
          </span>
        </div>
        <div className="gym-stat-card">
          <span className="gym-stat-label">VOLUME (7 DAYS)</span>
          <span className="gym-stat-value">{Math.round(totalWeekVolume).toLocaleString()} lbs</span>
        </div>
      </div>

      <div className="gym-tabs">
        <button
          type="button"
          className={activeTab === 'today' ? 'active' : ''}
          onClick={() => setActiveTab('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={activeTab === 'exercises' ? 'active' : ''}
          onClick={() => setActiveTab('exercises')}
        >
          Exercises
        </button>
        <button
          type="button"
          className={activeTab === 'routines' ? 'active' : ''}
          onClick={() => setActiveTab('routines')}
        >
          Routines
        </button>
        <button
          type="button"
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
      </div>

      {activeTab === 'today' && (
        <TodayTab
          gymExercises={gymExercises}
          gymLogs={gymLogs}
          gymRoutines={gymRoutines}
          gymWeekPlan={gymWeekPlan}
          gymWeekPlanOverrides={gymWeekPlanOverrides}
          setGymWeekPlanOverride={setGymWeekPlanOverride}
          gymDayNotes={gymDayNotes}
          saving={saving}
          addGymLog={addGymLog}
          setGymDayNote={setGymDayNote}
        />
      )}

      {activeTab === 'exercises' && (
        <ExercisesTab
          gymExercises={gymExercises}
          gymLogs={gymLogs}
          saving={saving}
          addGymExercise={addGymExercise}
          deleteGymExercise={deleteGymExercise}
          updateGymExercise={updateGymExercise}
          addGymLog={addGymLog}
          deleteGymLog={deleteGymLog}
        />
      )}

      {activeTab === 'routines' && (
        <RoutinesTab
          gymExercises={gymExercises}
          gymLogs={gymLogs}
          gymRoutines={gymRoutines}
          gymWeekPlan={gymWeekPlan}
          gymWeekPlanOverrides={gymWeekPlanOverrides}
          saving={saving}
          addGymRoutine={addGymRoutine}
          updateGymRoutine={updateGymRoutine}
          deleteGymRoutine={deleteGymRoutine}
          setGymWeekPlanDay={setGymWeekPlanDay}
        />
      )}

      {activeTab === 'calendar' && (
        <GymCalendarTab
          gymRecurringEvents={gymRecurringEvents}
          gymSessions={gymSessions}
          saving={saving}
          addGymSession={addGymSession}
          deleteGymSession={deleteGymSession}
          addGymRecurringEvent={addGymRecurringEvent}
          deleteGymRecurringEvent={deleteGymRecurringEvent}
        />
      )}
    </div>
  )
}
