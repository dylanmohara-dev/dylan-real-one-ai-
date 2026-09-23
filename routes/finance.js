import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

const ACCOUNT_TYPES = ['checking', 'savings', 'investment', 'credit', 'loan']
const DEBT_TYPES = ['credit', 'loan']

// JS floating-point math drifts a fraction of a cent on ordinary
// addition/subtraction (confirmed live: add then reverse a $50 expense
// and a $20 income against a real account and the balance lands on
// 500.54999999999995, not 500.55). Round to the cent after every
// arithmetic step that touches a balance, not just at display time.
function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}
// Bare local YYYY-MM-DD -- NOT toISOString().slice(0, 10), which reads off
// UTC. This exact bug was already found and fixed in skills.js, mind.js,
// reading.js, and family.js this session (evening activity in any US
// timezone gets tagged as tomorrow's date under the UTC version) -- it was
// simply missed here, in the one place whose whole job is producing the
// net-worth/spending TREND data Dylan says isn't shown well. A wrong day
// on a history snapshot or an undated transaction silently corrupts every
// "this week" / "this month" rollup built on top of it.
function todayKeyLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const EXPENSE_CATEGORIES = [
  'groceries',
  'dining',
  'transport',
  'housing',
  'utilities',
  'entertainment',
  'shopping',
  'health',
  'subscriptions',
  'other',
]

export function computeNetWorth(accounts) {
  return round2(
    accounts.reduce((total, account) => {
      const balance = Number(account.balance) || 0
      return DEBT_TYPES.includes(account.type) ? total - balance : total + balance
    }, 0)
  )
}

function recordHistorySnapshot(accounts) {
  const history = loadData('finance_history')
  const today = todayKeyLocal()
  const netWorth = computeNetWorth(accounts)

  const existingIndex = history.findIndex((point) => point.date === today)
  if (existingIndex >= 0) {
    history[existingIndex] = { date: today, netWorth }
  } else {
    history.push({ date: today, netWorth })
  }

  saveData('finance_history', history)
  return history
}

router.get('/', (req, res) => {
  const accounts = loadData('finance_accounts')
  const history = loadData('finance_history')
  res.json({ accounts, netWorth: computeNetWorth(accounts), history })
})

router.post('/accounts', (req, res) => {
  try {
    const { name, type, balance } = req.body

    if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' })
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type must be one of: ' + ACCOUNT_TYPES.join(', ') })
    }
    const numericBalance = Number(balance)
    if (Number.isNaN(numericBalance)) return res.status(400).json({ error: 'balance must be a number' })

    const accounts = loadData('finance_accounts')
    const account = {
      id: Date.now().toString(),
      name: name.toString().trim(),
      type,
      balance: numericBalance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    accounts.push(account)
    saveData('finance_accounts', accounts)
    const history = recordHistorySnapshot(accounts)

    res.json({ account, netWorth: computeNetWorth(accounts), history })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not add account' })
  }
})

router.put('/accounts/:id', (req, res) => {
  try {
    const { balance } = req.body
    const numericBalance = Number(balance)
    if (Number.isNaN(numericBalance)) return res.status(400).json({ error: 'balance must be a number' })

    const accounts = loadData('finance_accounts')
    const account = accounts.find((item) => item.id === req.params.id)
    if (!account) return res.status(404).json({ error: 'Account not found' })

    account.balance = numericBalance
    account.updatedAt = new Date().toISOString()
    saveData('finance_accounts', accounts)
    const history = recordHistorySnapshot(accounts)

    res.json({ account, netWorth: computeNetWorth(accounts), history })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update account' })
  }
})

router.delete('/accounts/:id', (req, res) => {
  const accounts = loadData('finance_accounts')
  const remaining = accounts.filter((account) => account.id !== req.params.id)
  saveData('finance_accounts', remaining)
  const history = recordHistorySnapshot(remaining)
  res.json({ success: true, netWorth: computeNetWorth(remaining), history })
})

// Transactions: a dated, categorized in/out of one real account.
// Deliberately NOT a separate parallel ledger next to the accounts Dylan
// already tracks -- every transaction actually moves that account's real
// balance, the same way a manual balance edit already does, so net worth
// and the sparkline stay correct the instant one is logged. No PUT/edit
// route on purpose: editing a transaction would mean reversing then
// reapplying a balance delta, which is real complexity for a first pass --
// add and delete cover the common case (fix a mistake by deleting it and
// logging it again), and this is a known, deliberate gap, not an oversight.
router.get('/transactions', (req, res) => {
  res.json({ transactions: loadData('finance_transactions') })
})

router.post('/transactions', (req, res) => {
  try {
    const { accountId, type, category, amount, date, note } = req.body

    if (!accountId) return res.status(400).json({ error: 'accountId is required' })
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type must be "income" or "expense"' })
    }
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }
    if (type === 'expense' && !EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + EXPENSE_CATEGORIES.join(', ') })
    }

    const accounts = loadData('finance_accounts')
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return res.status(404).json({ error: 'Account not found' })

    // A debt account (credit card, loan) works in reverse: an "expense"
    // (a purchase) INCREASES what's owed, and "income" (a payment toward
    // it) DECREASES it -- the same asset/debt distinction computeNetWorth()
    // already makes, applied here to which direction the balance actually
    // moves.
    const isDebtAccount = DEBT_TYPES.includes(account.type)
    const direction = type === 'expense' ? -1 : 1
    const signedDelta = isDebtAccount ? -direction * numericAmount : direction * numericAmount
    account.balance = round2((Number(account.balance) || 0) + signedDelta)
    account.updatedAt = new Date().toISOString()
    saveData('finance_accounts', accounts)

    const transactions = loadData('finance_transactions')
    const transaction = {
      id: Date.now().toString(),
      accountId,
      type,
      category: type === 'expense' ? category : 'income',
      amount: numericAmount,
      date: date || todayKeyLocal(),
      note: (note || '').trim(),
      createdAt: new Date().toISOString(),
    }
    transactions.push(transaction)
    saveData('finance_transactions', transactions)

    const history = recordHistorySnapshot(accounts)

    res.json({ transaction, account, netWorth: computeNetWorth(accounts), history })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save transaction' })
  }
})

router.delete('/transactions/:id', (req, res) => {
  try {
    const transactions = loadData('finance_transactions')
    const transaction = transactions.find((t) => t.id === req.params.id)
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' })

    // Reverse exactly the balance effect this transaction applied when it
    // was created, so deleting a mistaken entry actually undoes it rather
    // than leaving the account's real balance permanently off.
    const accounts = loadData('finance_accounts')
    const account = accounts.find((a) => a.id === transaction.accountId)
    if (account) {
      const isDebtAccount = DEBT_TYPES.includes(account.type)
      const direction = transaction.type === 'expense' ? -1 : 1
      const signedDelta = isDebtAccount ? -direction * transaction.amount : direction * transaction.amount
      account.balance = round2((Number(account.balance) || 0) - signedDelta)
      account.updatedAt = new Date().toISOString()
      saveData('finance_accounts', accounts)
    }

    const remaining = transactions.filter((t) => t.id !== req.params.id)
    saveData('finance_transactions', remaining)
    const history = recordHistorySnapshot(accounts)

    res.json({ success: true, netWorth: computeNetWorth(accounts), history })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not delete transaction' })
  }
})

// Bulk import: Dylan's real ask was "connect to my fidelity account to see
// my real up to date number exactly." A genuine live sync needs Plaid (or
// similar) -- Dylan registering his own developer account, real API keys,
// an OAuth consent flow with Fidelity through Plaid's institution list,
// and Plaid's paid production tier (their free/sandbox tier only talks to
// fake test institutions, not real ones). None of that is buildable
// without Dylan personally doing that signup and handing over real
// credentials, so building a "Connect Fidelity" button that can't
// actually connect would just be lying to him with a UI. What IS honestly
// buildable right now: importing his real exported transaction history in
// bulk, instead of retyping each one -- this is also the most direct fix
// for "logging transactions feels like a chore" of anything in this pass.
// One combined balance delta + one history snapshot for the whole batch,
// not one write per row, so importing 200 rows doesn't do 200 separate
// file writes.
router.post('/transactions/import', (req, res) => {
  try {
    const { accountId, transactions: rows } = req.body
    if (!accountId) return res.status(400).json({ error: 'accountId is required' })
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'transactions must be a non-empty array' })

    const accounts = loadData('finance_accounts')
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return res.status(404).json({ error: 'Account not found' })

    const isDebtAccount = DEBT_TYPES.includes(account.type)
    const existing = loadData('finance_transactions')
    const imported = []
    const skipped = []

    for (const row of rows) {
      const type = row.type === 'income' ? 'income' : row.type === 'expense' ? 'expense' : null
      const amount = Number(row.amount)
      const date = (row.date || '').toString().trim()
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)

      if (!type || !Number.isFinite(amount) || amount <= 0 || !validDate) {
        skipped.push({ row, reason: 'missing/invalid type, amount, or date (expected YYYY-MM-DD)' })
        continue
      }

      const category = type === 'expense' && EXPENSE_CATEGORIES.includes(row.category) ? row.category : type === 'expense' ? 'other' : 'income'
      const direction = type === 'expense' ? -1 : 1
      const signedDelta = isDebtAccount ? -direction * amount : direction * amount
      account.balance = round2((Number(account.balance) || 0) + signedDelta)

      const transaction = {
        id: `${Date.now()}-${imported.length}`,
        accountId,
        type,
        category,
        amount,
        date,
        note: (row.note || '').toString().trim(),
        createdAt: new Date().toISOString(),
        importedAt: new Date().toISOString(),
      }
      existing.push(transaction)
      imported.push(transaction)
    }

    if (imported.length) {
      account.updatedAt = new Date().toISOString()
      saveData('finance_accounts', accounts)
      saveData('finance_transactions', existing)
    }
    const history = recordHistorySnapshot(accounts)

    res.json({
      imported: imported.length,
      skipped,
      account,
      netWorth: computeNetWorth(accounts),
      history,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not import transactions' })
  }
})

// Budgets: a monthly spending limit per category -- one settings object
// (category -> limit), same shape as gym's week plan, not a list. A
// category with no limit set just shows no budget bar; this is opt-in per
// category, not something Dylan has to fill in for all 10 before using
// any of them.
router.get('/budgets', (req, res) => {
  res.json({ budgets: loadData('finance_budgets', {}) })
})

router.post('/budgets', (req, res) => {
  try {
    const { category, monthlyLimit } = req.body
    if (!EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + EXPENSE_CATEGORIES.join(', ') })
    }
    const budgets = loadData('finance_budgets', {})
    const numericLimit = Number(monthlyLimit)

    if (!numericLimit || numericLimit <= 0) {
      delete budgets[category]
    } else {
      budgets[category] = numericLimit
    }
    saveData('finance_budgets', budgets)
    res.json({ budgets })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not save budget' })
  }
})

export default router
