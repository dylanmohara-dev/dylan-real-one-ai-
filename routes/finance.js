import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'

const router = Router()

const ACCOUNT_TYPES = ['checking', 'savings', 'investment', 'credit', 'loan']
const DEBT_TYPES = ['credit', 'loan']

export function computeNetWorth(accounts) {
  return accounts.reduce((total, account) => {
    const balance = Number(account.balance) || 0
    return DEBT_TYPES.includes(account.type) ? total - balance : total + balance
  }, 0)
}

function recordHistorySnapshot(accounts) {
  const history = loadData('finance_history')
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
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

export default router
