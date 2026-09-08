export default function NotesPage({
  notes,
  noteInput,
  setNoteInput,
  saving,
  addNote,
  deleteNote,
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">KNOWLEDGE</span>

          <h1>Notes</h1>

          <p>Keep important thoughts and ideas in one place.</p>
        </div>
      </div>

      <div className="form-card note-form">
        <textarea
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          placeholder="Write a note..."
        />

        <button onClick={addNote} disabled={saving || !noteInput.trim()}>
          Save Note
        </button>
      </div>

      <div className="items-list">
        {notes.length ? (
          notes
            .slice()
            .reverse()
            .map((note) => (
              <div className="item-card note-card" key={note.id}>
                <div className="item-content">
                  <p>{note.content}</p>

                  <span className="item-meta">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <button className="delete-button" onClick={() => deleteNote(note.id)}>
                  ×
                </button>
              </div>
            ))
        ) : (
          <div className="empty-state">
            <div>▤</div>
            <h3>No notes yet</h3>
            <p>Save something important.</p>
          </div>
        )}
      </div>
    </div>
  )
}
