import { useState } from 'react'
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  CreditCard,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  X,
} from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

const TYPE_META = {
  checking: { label: 'Checking', icon: Wallet, debt: false },
  savings: { label: 'Savings', icon: PiggyBank, debt: false },
  investment: { label: 'Investment', icon: TrendingUp, debt: false },
  credit: { label: 'Credit card', icon: CreditCard, debt: true },
  loan: { label: 'Loan', icon: Landmark, debt: true },
}

// Mirrors routes/finance.js's EXPENSE_CATEGORIES exactly -- same
// duplication-across-frontend/backend pattern ACCOUNT_TYPES/TYPE_META
// already use in this file, not a new inconsistency introduced here.
const EXPENSE_CATEGORIES = [
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

const CATEGORY_LABELS = {
  groceries: 'Groceries',
  dining: 'Dining',
  transport: 'Transport',
  housing: 'Housing',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  health: 'Health',
  subscriptions: 'Subscriptions',
  other: 'Other',
  income: 'Income',
}

function formatMoney(value) {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthKey() {
  return todayKey().slice(0, 7) // YYYY-MM
}

function Sparkline({ history }) {
  if (history.length < 2) {
    return <p className="finance-sparkline-empty">Add a second day of balances to see a trend line here.</p>
  }

  const values = history.map((point) => point.netWorth)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 280
  const height = 56
  const step = width / (history.length - 1)

  const points = values
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / range) * (height - 8) - 4
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="finance-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="rgb(var(--mode-accent-rgb))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function AccountRow({ account, onUpdateBalance, onDelete, saving }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(account.balance)
  const meta = TYPE_META[account.type]
  const Icon = meta.icon

  return (
    <div className="finance-row">
      <div className="finance-row-identity">
        <Icon size={15} strokeWidth={2} />
        <div>
          <strong>{account.name}</strong>
          <span>{meta.label}</span>
        </div>
      </div>

      {editing ? (
        <div className="finance-row-edit">
          <input
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onUpdateBalance(account.id, value)
                setEditing(false)
              }
            }}
            autoFocus
          />
          <button
            onClick={() => {
              onUpdateBalance(account.id, value)
              setEditing(false)
            }}
            disabled={saving}
          >
            Save
          </button>
        </div>
      ) : (
        <button className="finance-row-balance" onClick={() => setEditing(true)}>
          {formatMoney(meta.debt ? -Math.abs(account.balance) : account.balance)}
        </button>
      )}

      <button className="finance-row-delete" onClick={() => onDelete(account.id)} title="Remove account">
        <X size={13} strokeWidth={2.25} />
      </button>
    </div>
  )
}

function OverviewTab({ accounts, netWorth, history, saving, addAccount, updateBalance, deleteAccount }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('checking')
  const [balance, setBalance] = useState('')

  const assets = accounts.filter((account) => !TYPE_META[account.type]?.debt)
  const debts = accounts.filter((account) => TYPE_META[account.type]?.debt)

  const previousNetWorth = history.length > 1 ? history[history.length - 2].netWorth : null
  const delta = previousNetWorth === null ? null : netWorth - previousNetWorth

  return (
    <>
      <div className="finance-hero">
        <div className="finance-hero-figure">
          <span className="finance-hero-label">NET WORTH</span>
          <strong>{formatMoney(netWorth)}</strong>
          {delta !== null && (
            <span className={`finance-hero-delta ${delta >= 0 ? 'up' : 'down'}`}>
              {delta >= 0 ? <ArrowUpRight size={13} strokeWidth={2.5} /> : <ArrowDownRight size={13} strokeWidth={2.5} />}
              {formatMoney(Math.abs(delta))} since last update
            </span>
          )}
        </div>
        <Sparkline history={history} />
      </div>

      <div className="finance-add-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Account name (e.g. Chase Checking)"
        />
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
        <input
          type="number"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          placeholder={TYPE_META[type].debt ? 'Amount owed' : 'Balance'}
        />
        <button
          onClick={() => {
            addAccount(name, type, balance)
            setName('')
            setBalance('')
          }}
          disabled={saving || !name.trim() || balance === ''}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <div>$</div>
          <h3>No accounts yet</h3>
          <p>Add your first account above — checking, savings, a credit card, whatever's real.</p>
        </div>
      ) : (
        <div className="finance-ledger">
          <div className="finance-ledger-section">
            <span className="finance-ledger-heading">Assets</span>
            {assets.length ? (
              assets.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onUpdateBalance={updateBalance}
                  onDelete={deleteAccount}
                  saving={saving}
                />
              ))
            ) : (
              <p className="finance-ledger-empty">No asset accounts yet.</p>
            )}
          </div>

          <div className="finance-ledger-section">
            <span className="finance-ledger-heading">Debts</span>
            {debts.length ? (
              debts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  onUpdateBalance={updateBalance}
                  onDelete={deleteAccount}
                  saving={saving}
                />
              ))
            ) : (
              <p className="finance-ledger-empty">No debt tracked. Good.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function TransactionForm({ accounts, saving, addTransaction }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey())
  const [note, setNote] = useState('')

  function handleAdd() {
    if (!accountId || !amount) return
    addTransaction(accountId, type, category, amount, date, note)
    setAmount('')
    setNote('')
  }

  if (!accounts.length) {
    return (
      <div className="empty-state">
        <div>$</div>
        <h3>Add an account first</h3>
        <p>A transaction needs a real account to move money in or out of — add one in the Overview tab.</p>
      </div>
    )
  }

  return (
    <div className="form-card finance-transaction-form">
      <div className="finance-transaction-form-row">
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        {type === 'expense' && (
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        )}
      </div>
      <div className="finance-transaction-form-row">
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <input placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <button onClick={handleAdd} disabled={saving || !amount}>
        <Plus size={14} strokeWidth={2.5} /> Log {type === 'expense' ? 'expense' : 'income'}
      </button>
    </div>
  )
}

function TransactionsTab({ accounts, transactions, saving, addTransaction, deleteTransaction }) {
  const accountById = Object.fromEntries(accounts.map((account) => [account.id, account]))
  const sorted = transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))

  return (
    <div className="finance-transactions">
      <TransactionForm accounts={accounts} saving={saving} addTransaction={addTransaction} />

      <div className="items-list">
        {sorted.length ? (
          sorted.map((transaction) => (
            <div className="item-card" key={transaction.id}>
              <div className="item-content">
                <strong>
                  {transaction.type === 'expense' ? (
                    <ArrowDownRight size={13} strokeWidth={2.5} className="finance-tx-icon" />
                  ) : (
                    <ArrowUpRight size={13} strokeWidth={2.5} className="finance-tx-icon income" />
                  )}
                  {CATEGORY_LABELS[transaction.category] || transaction.category}: {formatMoney(transaction.amount)}
                </strong>
                <div className="item-meta">
                  <span>
                    {transaction.date} &middot; {accountById[transaction.accountId]?.name || 'Unknown account'}
                    {transaction.note ? ` — ${transaction.note}` : ''}
                  </span>
                </div>
              </div>
              <button className="delete-button" onClick={() => deleteTransaction(transaction.id)}>
                &times;
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div>$</div>
            <h3>No transactions yet</h3>
            <p>Log your first expense or income above.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BudgetRow({ category, limit, spent, saving, setBudget }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(limit || '')

  const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0
  const over = limit ? spent > limit : false

  function handleSave() {
    setBudget(category, value)
    setEditing(false)
  }

  return (
    <div className="finance-budget-row">
      <div className="finance-budget-row-header">
        <span className="finance-budget-category">{CATEGORY_LABELS[category]}</span>
        {editing ? (
          <div className="finance-budget-edit">
            <input
              type="number"
              min="0"
              placeholder="Monthly limit"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
            <button onClick={handleSave} disabled={saving}>
              Save
            </button>
          </div>
        ) : (
          <button className="finance-budget-limit" onClick={() => setEditing(true)}>
            {limit ? `${formatMoney(spent)} / ${formatMoney(limit)}` : 'Set a limit'}
          </button>
        )}
      </div>
      {limit > 0 && (
        <div className="skill-xp-bar">
          <div
            className={`skill-xp-bar-fill finance-budget-bar-fill ${over ? 'over' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function BudgetTab({ transactions, budgets, saving, setBudget }) {
  const month = currentMonthKey()
  const spentByCategory = {}
  transactions
    .filter((transaction) => transaction.type === 'expense' && transaction.date.slice(0, 7) === month)
    .forEach((transaction) => {
      spentByCategory[transaction.category] = (spentByCategory[transaction.category] || 0) + transaction.amount
    })

  const totalBudgeted = Object.values(budgets).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const totalSpent = Object.values(spentByCategory).reduce((sum, v) => sum + v, 0)

  return (
    <div className="finance-budgets">
      {totalBudgeted > 0 && (
        <div className="finance-budget-summary">
          <span className="eyebrow">THIS MONTH</span>
          <strong>
            {formatMoney(totalSpent)} of {formatMoney(totalBudgeted)} budgeted
          </strong>
        </div>
      )}
      {EXPENSE_CATEGORIES.map((category) => (
        <BudgetRow
          key={category}
          category={category}
          limit={budgets[category] || 0}
          spent={spentByCategory[category] || 0}
          saving={saving}
          setBudget={setBudget}
        />
      ))}
    </div>
  )
}

export default function FinancePage({
  accounts,
  netWorth,
  history,
  transactions,
  budgets,
  saving,
  addAccount,
  updateBalance,
  deleteAccount,
  addTransaction,
  deleteTransaction,
  setBudget,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="page finance-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">FINANCE MODE</span>
          <h1 className="serif">The ledger</h1>
          <p>Every account, one number, tracked over time.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="finance" openChat={openChat} />

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button
          type="button"
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button type="button" className={activeTab === 'budget' ? 'active' : ''} onClick={() => setActiveTab('budget')}>
          Budget
        </button>
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          accounts={accounts}
          netWorth={netWorth}
          history={history}
          saving={saving}
          addAccount={addAccount}
          updateBalance={updateBalance}
          deleteAccount={deleteAccount}
        />
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab
          accounts={accounts}
          transactions={transactions}
          saving={saving}
          addTransaction={addTransaction}
          deleteTransaction={deleteTransaction}
        />
      )}

      {activeTab === 'budget' && (
        <BudgetTab transactions={transactions} budgets={budgets} saving={saving} setBudget={setBudget} />
      )}
    </div>
  )
}
