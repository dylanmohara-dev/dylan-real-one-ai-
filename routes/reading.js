import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

// Books: title/author/page-count plus current progress and a status.
// 'reading' is the only status that shows up in the daily pages goal below
// -- a finished or want-to-read book shouldn't count toward "did I read
// today," which is specifically about active reading.
router.get('/books', (req, res) => {
  res.json({ books: loadData('reading_books') })
})

// A book can be added straight into 'reading', but Dylan asked for the
// library to actually track what he wants to read next too -- so
// 'want-to-read' is a real third status, not just an absence of one.
const BOOK_STATUSES = ['want-to-read', 'reading', 'finished']

router.post('/books', (req, res) => {
  try {
    const { title, author, totalPages, genre, status } = req.body
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'A title is required' })
    }
    const books = loadData('reading_books')
    const book = {
      id: Date.now().toString(),
      title: title.trim(),
      author: (author || '').trim(),
      genre: (genre || '').trim(),
      totalPages: Number(totalPages) || 0,
      currentPage: 0,
      status: BOOK_STATUSES.includes(status) ? status : 'reading',
      rating: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }
    books.push(book)
    saveData('reading_books', books)
    res.json({ book })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save book' })
  }
})

router.put('/books/:id', (req, res) => {
  try {
    const books = loadData('reading_books')
    const index = books.findIndex((b) => b.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Book not found' })
    }
    const updated = { ...books[index], ...req.body, id: books[index].id }
    // Finishing a book (status flips to 'finished') stamps when, once --
    // re-saving an already-finished book doesn't keep moving the date.
    if (updated.status === 'finished' && !updated.finishedAt) {
      updated.finishedAt = new Date().toISOString()
    }
    if (updated.status !== 'finished') {
      updated.finishedAt = null
    }
    books[index] = updated
    saveData('reading_books', books)
    res.json({ book: books[index] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update book' })
  }
})

router.delete('/books/:id', (req, res) => {
  const books = loadData('reading_books')
  const remaining = books.filter((b) => b.id !== req.params.id)
  saveData('reading_books', remaining)
  // A book's own reading sessions are cleaned up too -- otherwise deleting
  // a book leaves orphaned session rows that reference an id nothing can
  // find or show again, quietly inflating "pages read" totals forever.
  const sessions = loadData('reading_sessions')
  const remainingSessions = sessions.filter((s) => s.bookId !== req.params.id)
  saveData('reading_sessions', remainingSessions)
  res.json({ success: true })
})

// Sessions: one entry per day pages were logged against a book. Multiple
// sessions can exist for the same book/date (log more pages later in the
// day) -- the daily total is always a sum, not a single overwritten value,
// so an evening top-up never has to know or guess what was logged this
// morning.
router.get('/sessions', (req, res) => {
  res.json({ sessions: loadData('reading_sessions') })
})

router.post('/sessions', (req, res) => {
  try {
    const { bookId, date, pagesRead } = req.body
    if (!bookId || !date) {
      return res.status(400).json({ error: 'A book and date are required' })
    }
    const pages = Number(pagesRead)
    if (!pages || pages <= 0) {
      return res.status(400).json({ error: 'Pages read must be a positive number' })
    }

    const books = loadData('reading_books')
    const bookIndex = books.findIndex((b) => b.id === bookId)
    if (bookIndex === -1) {
      return res.status(404).json({ error: 'Book not found' })
    }

    const sessions = loadData('reading_sessions')
    const session = {
      id: Date.now().toString(),
      bookId,
      date,
      pagesRead: pages,
      createdAt: new Date().toISOString(),
    }
    sessions.push(session)
    saveData('reading_sessions', sessions)

    // Advance the book's own progress marker too, capped at its total page
    // count if one was given -- keeps the Library tab's progress bar in
    // sync with logged sessions without Dylan having to update two places.
    const book = books[bookIndex]
    const nextPage = book.totalPages ? Math.min(book.currentPage + pages, book.totalPages) : book.currentPage + pages
    books[bookIndex] = { ...book, currentPage: nextPage }
    saveData('reading_books', books)

    res.json({ session, book: books[bookIndex] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save session' })
  }
})

router.delete('/sessions/:id', (req, res) => {
  const sessions = loadData('reading_sessions')
  const remaining = sessions.filter((s) => s.id !== req.params.id)
  saveData('reading_sessions', remaining)
  res.json({ success: true })
})

// Daily page goal: the page used to hardcode "/ 10 pages" with no way to
// change it -- Dylan's own complaint was that a goal he can't set for
// himself isn't motivating. Stored as an object (like health_goals) even
// though there's only one field today, so a per-book or weekly goal could
// be added later without another schema migration.
const DEFAULT_READING_GOALS = { dailyPageGoal: 10 }

router.get('/goals', (req, res) => {
  res.json({ goals: loadData('reading_goals', DEFAULT_READING_GOALS) })
})

router.post('/goals', (req, res) => {
  try {
    const { dailyPageGoal } = req.body
    const goal = Number(dailyPageGoal)
    if (!goal || goal <= 0) {
      return res.status(400).json({ error: 'dailyPageGoal must be a positive number' })
    }
    const goals = { ...loadData('reading_goals', DEFAULT_READING_GOALS), dailyPageGoal: goal }
    saveData('reading_goals', goals)
    res.json({ goals })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save reading goal' })
  }
})

export default router
