import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import HeroPhotoButton from './HeroPhotoButton.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pagesReadOn(sessions, date) {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + (Number(s.pagesRead) || 0), 0)
}

// Local bare-date keys sort correctly as plain strings (YYYY-MM-DD), so the
// "most recent session" for a book is just the max string, no Date parsing
// needed.
function sessionStatsForBook(sessions, bookId) {
  const bookSessions = sessions.filter((s) => s.bookId === bookId)
  if (bookSessions.length === 0) return { count: 0, lastDate: null }
  const lastDate = bookSessions.reduce((latest, s) => (s.date > latest ? s.date : latest), bookSessions[0].date)
  return { count: bookSessions.length, lastDate }
}

const STATUS_LABELS = {
  'want-to-read': 'Want to read',
  reading: 'Reading',
  finished: 'Finished',
}

function LogPagesForm({ books, saving, addReadingSession }) {
  const activeBooks = books.filter((b) => b.status === 'reading')
  const [bookId, setBookId] = useState(activeBooks[0]?.id || '')
  const [pagesRead, setPagesRead] = useState('')

  if (activeBooks.length === 0) {
    return (
      <div className="empty-state">
        <div>&#128214;</div>
        <h3>Nothing to log yet</h3>
        <p>Add a book below and mark it "Reading" to start logging pages.</p>
      </div>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!bookId || !pagesRead) return
    await addReadingSession({ bookId, date: todayKey(), pagesRead })
    setPagesRead('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="reading-book-select">Book</label>
      <select id="reading-book-select" value={bookId} onChange={(e) => setBookId(e.target.value)}>
        {activeBooks.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
      <label htmlFor="reading-pages-input">Pages read today</label>
      <input
        id="reading-pages-input"
        type="number"
        min="1"
        value={pagesRead}
        onChange={(e) => setPagesRead(e.target.value)}
        placeholder="e.g. 12"
      />
      <button type="submit" disabled={saving || !pagesRead}>
        Log pages
      </button>
    </form>
  )
}

// The daily page goal used to be a hardcoded "/ 10 pages" with no way to
// change it -- this makes it a real, saved setting instead, right where
// Dylan sees it every day.
function GoalEditor({ dailyPageGoal, saving, setReadingGoal }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dailyPageGoal)

  if (!editing) {
    return (
      <button
        type="button"
        className="reading-goal-edit-link"
        onClick={() => {
          setValue(dailyPageGoal)
          setEditing(true)
        }}
      >
        Change goal
      </button>
    )
  }

  async function handleSave() {
    const goal = Number(value)
    if (!goal || goal <= 0) return
    await setReadingGoal(goal)
    setEditing(false)
  }

  return (
    <div className="reading-goal-edit-form">
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="reading-goal-input"
        aria-label="Daily page goal"
      />
      <button type="button" disabled={saving} onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  )
}

function AddBookForm({ saving, addReadingBook }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [genre, setGenre] = useState('')
  const [totalPages, setTotalPages] = useState('')
  const [status, setStatus] = useState('reading')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) return
    await addReadingBook({ title, author, genre, totalPages, status })
    setTitle('')
    setAuthor('')
    setGenre('')
    setTotalPages('')
    setStatus('reading')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="reading-title-input">Title</label>
      <input id="reading-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" />
      <label htmlFor="reading-author-input">Author</label>
      <input id="reading-author-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" />
      <label htmlFor="reading-genre-input">Genre</label>
      <input
        id="reading-genre-input"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        placeholder="Optional, e.g. Sci-Fi"
      />
      <label htmlFor="reading-pages-total-input">Total pages</label>
      <input
        id="reading-pages-total-input"
        type="number"
        min="0"
        value={totalPages}
        onChange={(e) => setTotalPages(e.target.value)}
        placeholder="Optional, for a progress bar"
      />
      <label htmlFor="reading-status-select">Status</label>
      <select id="reading-status-select" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="want-to-read">Want to read</option>
        <option value="reading">Currently reading</option>
      </select>
      <button type="submit" disabled={saving || !title.trim()}>
        Add book
      </button>
    </form>
  )
}

function StarRating({ rating, saving, onRate }) {
  return (
    <div className="reading-star-rating" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={saving}
          className={`reading-star${n <= rating ? ' filled' : ''}`}
          onClick={() => onRate(n === rating ? 0 : n)}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n <= rating}
        >
          &#9733;
        </button>
      ))}
    </div>
  )
}

function BookNotes({ book, saving, updateReadingBook }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(book.notes || '')
  const dirty = notes !== (book.notes || '')

  return (
    <div className="reading-notes">
      <button type="button" className="reading-notes-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide notes' : book.notes ? 'View/edit notes' : 'Add notes'}
      </button>
      {open && (
        <div className="reading-notes-body">
          <textarea
            className="reading-notes-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thoughts, quotes, things to remember..."
            rows={3}
          />
          <button type="button" disabled={saving || !dirty} onClick={() => updateReadingBook(book.id, { notes })}>
            Save notes
          </button>
        </div>
      )}
    </div>
  )
}

function BookCard({ book, sessions, saving, updateReadingBook, deleteReadingBook }) {
  const pct = book.totalPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : null
  const { count: sessionCount, lastDate } = sessionStatsForBook(sessions, book.id)

  return (
    <div className="item-card reading-book-card">
      <div className="item-content">
        <strong>
          {book.title}
          {book.author && ` — ${book.author}`}
        </strong>
        {book.genre && <span className="reading-genre-chip">{book.genre}</span>}
        {book.totalPages > 0 && (
          <div className="item-meta">
            <div className="skill-xp-bar">
              <div className="skill-xp-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="skill-xp-label">
              {book.currentPage} / {book.totalPages} pages ({pct}%)
            </span>
          </div>
        )}
        {sessionCount > 0 && (
          <p className="reading-pace-note">
            {sessionCount} session{sessionCount === 1 ? '' : 's'} logged
            {lastDate ? ` — last read ${lastDate}` : ''}
          </p>
        )}
        <StarRating rating={book.rating || 0} saving={saving} onRate={(rating) => updateReadingBook(book.id, { rating })} />
        <BookNotes book={book} saving={saving} updateReadingBook={updateReadingBook} />
        <select
          className="category-select reading-status-select"
          value={book.status}
          disabled={saving}
          onChange={(e) => updateReadingBook(book.id, { status: e.target.value })}
          aria-label={`Status for ${book.title}`}
        >
          <option value="want-to-read">Want to read</option>
          <option value="reading">Reading</option>
          <option value="finished">Finished</option>
        </select>
      </div>
      <button className="delete-button" onClick={() => deleteReadingBook(book.id)} aria-label={`Delete ${book.title}`}>
        &times;
      </button>
    </div>
  )
}

const LIBRARY_FILTERS = ['all', 'reading', 'want-to-read', 'finished']

export default function ReadingPage({
  heroImages,
  updateHeroImage,
  resetHeroImage,
  readingBooks,
  readingSessions,
  readingGoals,
  saving,
  addReadingBook,
  updateReadingBook,
  deleteReadingBook,
  addReadingSession,
  setReadingGoal,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')
  const [libraryFilter, setLibraryFilter] = useState('all')
  const pagesToday = pagesReadOn(readingSessions, todayKey())
  const currentlyReading = readingBooks.filter((b) => b.status === 'reading')
  const finished = readingBooks.filter((b) => b.status === 'finished')
  const dailyPageGoal = readingGoals?.dailyPageGoal || 10
  const filteredBooks = libraryFilter === 'all' ? readingBooks : readingBooks.filter((b) => b.status === libraryFilter)

  return (
    <div className="page reading-page">
      <div
        className={`page-header${heroImages?.reading ? ' mode-hero' : ''}`}
        style={heroImages?.reading ? { '--hero-photo': `url(${heroImages.reading})` } : undefined}
      >
        <HeroPhotoButton
          modeKey="reading"
          heroUrl={heroImages?.reading}
          onChange={updateHeroImage}
          onReset={resetHeroImage}
        />
        <div>
          <span className="eyebrow">READING MODE</span>
          <h1 className="serif">Reading</h1>
          <p>Track what you're reading and hit your daily page goal.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="reading" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">TODAY</span>
          <span className="gym-stat-value">
            {pagesToday} / {dailyPageGoal} pages
          </span>
          <GoalEditor dailyPageGoal={dailyPageGoal} saving={saving} setReadingGoal={setReadingGoal} />
        </div>
        <div className="gym-stat-card">
          <span className="gym-stat-label">BOOKS FINISHED</span>
          <span className="gym-stat-value">{finished.length}</span>
        </div>
      </div>

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>
          Today
        </button>
        <button type="button" className={activeTab === 'library' ? 'active' : ''} onClick={() => setActiveTab('library')}>
          Library
        </button>
      </div>

      {activeTab === 'today' && (
        <>
          <LogPagesForm books={readingBooks} saving={saving} addReadingSession={addReadingSession} />
          {currentlyReading.length === 0 && (
            <div className="empty-state">
              <div>
                <BookOpen size={20} />
              </div>
              <h3>Nothing marked "Reading" yet</h3>
              <p>Add a book in the Library tab to get started.</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'library' && (
        <>
          <AddBookForm saving={saving} addReadingBook={addReadingBook} />
          {readingBooks.length > 0 && (
            <div className="library-filter-row">
              {LIBRARY_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`library-filter-chip${libraryFilter === key ? ' active' : ''}`}
                  onClick={() => setLibraryFilter(key)}
                >
                  {key === 'all' ? 'All' : STATUS_LABELS[key]}
                </button>
              ))}
            </div>
          )}
          <div className="items-list">
            {readingBooks.length === 0 && (
              <div className="empty-state">
                <div>&#128218;</div>
                <h3>No books yet</h3>
                <p>Add your first book above.</p>
              </div>
            )}
            {readingBooks.length > 0 && filteredBooks.length === 0 && (
              <div className="empty-state">
                <div>&#128218;</div>
                <h3>Nothing here</h3>
                <p>No books marked "{STATUS_LABELS[libraryFilter]}" yet.</p>
              </div>
            )}
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                sessions={readingSessions}
                saving={saving}
                updateReadingBook={updateReadingBook}
                deleteReadingBook={deleteReadingBook}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
