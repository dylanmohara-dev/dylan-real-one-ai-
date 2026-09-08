import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'

export default function JournalPage({ journal }) {
  const {
    hasPasscode,
    unlocked,
    entries,
    error,
    loading,
    checkStatus,
    setupPasscode,
    unlock,
    lock,
    addEntry,
    deleteEntry,
  } = journal

  const [passcodeInput, setPasscodeInput] = useState('')
  const [confirmInput, setConfirmInput] = useState('')
  const [entryInput, setEntryInput] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    checkStatus()

    // Locking on unmount means leaving the Journal page always re-locks it,
    // even within the same session — every visit needs the passcode again.
    return () => {
      lock()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (hasPasscode === null) {
    return (
      <div className="page journal-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">PRIVATE</span>
            <h1 className="serif">Journal</h1>
          </div>
        </div>
        <p className="mode-page-note">Checking...</p>
      </div>
    )
  }

  if (!hasPasscode) {
    return (
      <div className="page journal-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">PRIVATE</span>
            <h1 className="serif">Set up your Journal</h1>
            <p>
              Choose a passcode. Entries are encrypted with it — if you forget
              it, there is no way to recover what you've written, ever. Use
              something only you know, not a 4-digit PIN.
            </p>
          </div>
        </div>

        <div className="form-card journal-setup">
          <input
            type="password"
            value={passcodeInput}
            onChange={(event) => setPasscodeInput(event.target.value)}
            placeholder="Choose a passcode (6+ characters)"
          />
          <input
            type="password"
            value={confirmInput}
            onChange={(event) => setConfirmInput(event.target.value)}
            placeholder="Confirm passcode"
          />

          {(formError || error) && <p className="journal-error">{formError || error}</p>}

          <button
            onClick={() => {
              if (passcodeInput.length < 6) {
                setFormError('Passcode must be at least 6 characters.')
                return
              }
              if (passcodeInput !== confirmInput) {
                setFormError('Passcodes do not match.')
                return
              }
              setFormError('')
              setupPasscode(passcodeInput)
            }}
            disabled={loading || !passcodeInput || !confirmInput}
          >
            Create Journal
          </button>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="page journal-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">PRIVATE</span>
            <h1 className="serif">Journal locked</h1>
            <p>Enter your passcode to open it.</p>
          </div>
        </div>

        <div className="form-card journal-setup">
          <input
            type="password"
            value={passcodeInput}
            onChange={(event) => setPasscodeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && passcodeInput) {
                unlock(passcodeInput)
                setPasscodeInput('')
              }
            }}
            placeholder="Passcode"
          />

          {error && <p className="journal-error">{error}</p>}

          <button
            onClick={() => {
              unlock(passcodeInput)
              setPasscodeInput('')
            }}
            disabled={loading || !passcodeInput}
          >
            <Lock size={14} strokeWidth={2.25} />
            Unlock
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page journal-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">PRIVATE</span>
          <h1 className="serif">Journal</h1>
          <p>Write whatever's on your mind.</p>
        </div>

        <button onClick={lock}>
          <Lock size={14} strokeWidth={2.25} />
          Lock now
        </button>
      </div>

      <div className="form-card note-form">
        <textarea
          value={entryInput}
          onChange={(event) => setEntryInput(event.target.value)}
          placeholder="What's on your mind..."
        />

        <button
          onClick={() => {
            addEntry(entryInput)
            setEntryInput('')
          }}
          disabled={loading || !entryInput.trim()}
        >
          Save Entry
        </button>
      </div>

      <div className="items-list">
        {entries.length ? (
          entries.map((entry) => (
            <div className="item-card note-card" key={entry.id}>
              <div className="item-content">
                <p>{entry.content}</p>

                <span className="item-meta">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              <button className="delete-button" onClick={() => deleteEntry(entry.id)}>
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>✦</div>
            <h3>Nothing written yet</h3>
            <p>Your first entry is private the moment you save it.</p>
          </div>
        )}
      </div>
    </div>
  )
}
