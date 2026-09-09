import { useState } from 'react'
import { Dumbbell, Trophy, Plus } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

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

export default function GymPage({
  gymExercises,
  gymLogs,
  saving,
  addGymExercise,
  deleteGymExercise,
  addGymLog,
  deleteGymLog,
  assistantContext,
  openChat,
}) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(gymExercises[0]?.id || null)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseCategory, setNewExerciseCategory] = useState('')
  const [logDate, setLogDate] = useState(todayKey())
  const [sets, setSets] = useState([{ reps: '', weight: '' }])

  const selectedExercise = gymExercises.find((e) => e.id === selectedExerciseId) || null
  const lastLog = selectedExercise ? lastLogForExercise(gymLogs, selectedExercise.id) : null
  const lastBest = lastLog ? bestSetForLog(lastLog) : null
  const exerciseLogs = selectedExercise
    ? sortLogsRecentFirst(gymLogs.filter((l) => l.exerciseId === selectedExercise.id))
    : []

  const totalWeekVolume = weekVolume(gymLogs)
  const workoutsThisWeek = new Set(
    gymLogs.filter((l) => l.date >= daysAgoKey(6) && l.date <= todayKey()).map((l) => l.date)
  ).size

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
    if (!selectedExercise) return
    const cleanSets = sets.filter((s) => s.reps !== '' || s.weight !== '')
    if (!cleanSets.length) return
    await addGymLog(selectedExercise.id, logDate, cleanSets)
    setSets([{ reps: '', weight: '' }])
  }

  function handleAddExercise() {
    if (!newExerciseName.trim()) return
    addGymExercise(newExerciseName, newExerciseCategory)
    setNewExerciseName('')
    setNewExerciseCategory('')
  }

  return (
    <div className="page gym-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">GYM MODE</span>
          <h1 className="serif">Gym</h1>
          <p>Log sets, see your last numbers before you lift, and get called out when you actually hit a new record.</p>
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
              {lastLog && lastBest && (
                <div className="gym-last-time">
                  <span className="gym-last-time-label">LAST TIME ({lastLog.date})</span>
                  <span className="gym-last-time-value">
                    Best set: {lastBest.weight} lbs &times; {lastBest.reps} (~{Math.round(lastBest.oneRM)} lbs est.
                    1RM)
                  </span>
                </div>
              )}

              <div className="form-card gym-log-form">
                <div className="gym-log-form-header">
                  <strong>{selectedExercise.name}</strong>
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

              <div className="items-list">
                {exerciseLogs.length ? (
                  exerciseLogs.map((log) => {
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
                        <button className="delete-button" onClick={() => deleteGymLog(log.id)}>
                          &times;
                        </button>
                      </div>
                    )
                  })
                ) : (
                  <div className="empty-state">
                    <div>&#128203;</div>
                    <h3>No logs yet</h3>
                    <p>Log your first set for {selectedExercise.name} above.</p>
                  </div>
                )}
              </div>
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
    </div>
  )
}
