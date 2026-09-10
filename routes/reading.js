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

router.post('/books', (req, res) => {
  try {
    const { title, author, totalPages } = req.body
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'A title is required' })
    }
    const books = loadData('reading_books')
    const book = {
      id: Date.now().toString(),
      title: title.trim(),
      author: (author || '').trim(),
      totalPages: Number(totalPages) || 0,
      currentPage: 0,
      status: 'reading',
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

export default router
