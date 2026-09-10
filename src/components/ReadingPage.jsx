import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pagesReadOn(sessions, date) {
  return sessions.filter((s) => s.date === date).reduce((sum, s) => sum + (Number(s.pagesRead) || 0), 0)
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

function AddBookForm({ saving, addReadingBook }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [totalPages, setTotalPages] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) return
    await addReadingBook({ title, author, totalPages })
    setTitle('')
    setAuthor('')
    setTotalPages('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="reading-title-input">Title</label>
      <input id="reading-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" />
      <label htmlFor="reading-author-input">Author</label>
      <input id="reading-author-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" />
      <label htmlFor="reading-pages-total-input">Total pages</label>
      <input
        id="reading-pages-total-input"
        type="number"
        min="0"
        value={totalPages}
        onChange={(e) => setTotalPages(e.target.value)}
        placeholder="Optional, for a progress bar"
      />
      <button type="submit" disabled={saving || !title.trim()}>
        Add book
      </button>
    </form>
  )
}

function BookCard({ book, saving, updateReadingBook, deleteReadingBook }) {
  const pct = book.totalPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : null
  return (
    <div className="item-card">
      <div className="item-content">
        <strong>
          {book.title}
          {book.author && ` — ${book.author}`}
        </strong>
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
        {book.status !== 'finished' ? (
          <button type="button" disabled={saving} onClick={() => updateReadingBook(book.id, { status: 'finished' })}>
            Mark finished
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={() => updateReadingBook(book.id, { status: 'reading' })}>
            Back to reading
          </button>
        )}
      </div>
      <button className="delete-button" onClick={() => deleteReadingBook(book.id)} aria-label={`Delete ${book.title}`}>
        &times;
      </button>
    </div>
  )
}

export default function ReadingPage({
  readingBooks,
  readingSessions,
  saving,
  addReadingBook,
  updateReadingBook,
  deleteReadingBook,
  addReadingSession,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')
  const pagesToday = pagesReadOn(readingSessions, todayKey())
  const currentlyReading = readingBooks.filter((b) => b.status === 'reading')
  const finished = readingBooks.filter((b) => b.status === 'finished')

  return (
    <div className="page reading-page">
      <div className="page-header">
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
          <span className="gym-stat-value">{pagesToday} / 10 pages</span>
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
          <div className="items-list">
            {readingBooks.length === 0 && (
              <div className="empty-state">
                <div>&#128218;</div>
                <h3>No books yet</h3>
                <p>Add your first book above.</p>
              </div>
            )}
            {readingBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
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
