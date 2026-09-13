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
  AlertTriangle,
  Target,
  Eye,
  Ban,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import useCountUp from '../hooks/useCountUp.js'

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

// 30 days is Dylan's own choice (see the trading-investing-mentor rules) --
// a position or watchlist idea that's gone untouched that long is flagged
// so it doesn't just quietly fall out of view.
const STALE_MS = 30 * 24 * 60 * 60 * 1000
function isStale(dateString) {
  if (!dateString) return false
  return Date.now() - new Date(dateString).getTime() > STALE_MS
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
  const displayedNetWorth = useCountUp(netWorth)

  return (
    <>
      <div className="finance-hero">
        <div className="finance-hero-figure">
          <span className="finance-hero-label">NET WORTH</span>
          <strong>{formatMoney(Math.round(displayedNetWorth))}</strong>
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

// Beginner-default concentration limit lives server-side (see
// routes/trading.js's CONCENTRATION_LIMIT_PCT) -- stats.concentrationLimitPct
// mirrors it here so the UI never hardcodes a number that could drift out of
// sync with what the backend actually flags.
function RiskLimitEditor({ limitPct, saving, updateTradingSettings }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(limitPct)

  if (!editing) {
    return (
      <button className="trading-risk-limit-edit" onClick={() => { setValue(limitPct); setEditing(true) }}>
        Limit: {limitPct}%
      </button>
    )
  }

  return (
    <div className="finance-row-edit trading-risk-limit-form">
      <input
        type="number"
        min="1"
        max="100"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
      />
      <button
        onClick={() => {
          updateTradingSettings(value)
          setEditing(false)
        }}
        disabled={saving || !value}
      >
        Save
      </button>
    </div>
  )
}

function RiskBanner({ stats }) {
  if (!stats || !stats.openCount) return null

  const deployedPct = stats.capitalBase > 0 ? Math.round((stats.totalCostBasis / stats.capitalBase) * 100) : 0

  return (
    <div className={`trading-risk-banner ${stats.anyOverConcentrated ? 'warning' : ''}`}>
      {stats.anyOverConcentrated ? <AlertTriangle size={15} strokeWidth={2.25} /> : <Target size={15} strokeWidth={2.25} />}
      <div>
        <strong>
          {formatMoney(stats.totalCostBasis)} deployed of {formatMoney(stats.capitalBase)} ({deployedPct}%)
        </strong>
        <span>
          {stats.anyOverConcentrated
            ? `At least one position is sized above ${stats.concentrationLimitPct}% of capital -- too concentrated for a beginner book.`
            : `Every open position is under the ${stats.concentrationLimitPct}% concentration limit. Keep it that way.`}
        </span>
      </div>
    </div>
  )
}

function PositionForm({ saving, addPosition, draft }) {
  const [ticker, setTicker] = useState(draft?.ticker || '')
  const [shares, setShares] = useState('')
  const [avgCost, setAvgCost] = useState('')
  const [thesis, setThesis] = useState(draft?.thesis || '')
  const [invalidation, setInvalidation] = useState('')

  const canSave = ticker.trim() && shares && avgCost && thesis.trim() && invalidation.trim()

  function handleAdd() {
    addPosition(ticker, shares, avgCost, thesis, invalidation)
    setTicker('')
    setShares('')
    setAvgCost('')
    setThesis('')
    setInvalidation('')
  }

  return (
    <div className="form-card">
      <div className="finance-transaction-form-row">
        <input
          placeholder="Ticker (e.g. VOO)"
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
          style={{ textTransform: 'uppercase' }}
        />
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Shares"
          value={shares}
          onChange={(event) => setShares(event.target.value)}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Avg cost / share"
          value={avgCost}
          onChange={(event) => setAvgCost(event.target.value)}
        />
      </div>
      <textarea
        placeholder="Thesis -- why does this position exist? What's the actual case?"
        value={thesis}
        onChange={(event) => setThesis(event.target.value)}
        rows={2}
      />
      <textarea
        placeholder="Invalidation -- what would prove this thesis wrong, or your stop?"
        value={invalidation}
        onChange={(event) => setInvalidation(event.target.value)}
        rows={2}
      />
      <button onClick={handleAdd} disabled={saving || !canSave}>
        <Plus size={14} strokeWidth={2.5} /> Open position
      </button>
    </div>
  )
}

function PositionRow({ position, sizing, saving, closePosition, deletePosition }) {
  const [closing, setClosing] = useState(false)
  const [exitPrice, setExitPrice] = useState('')
  const [lesson, setLesson] = useState('')

  const costBasis = sizing?.costBasis ?? position.shares * position.avgCost
  const sizePct = sizing?.sizePct ?? 0
  const overConcentrated = sizing?.overConcentrated ?? false
  const stale = isStale(position.updatedAt || position.openedAt)

  return (
    <div className="item-card">
      <div className="item-content">
        <strong>
          {position.ticker} &middot; {position.shares} sh @ {formatMoney(position.avgCost)} ({formatMoney(costBasis)})
        </strong>
        <p>Thesis: {position.thesis}</p>
        <p>Invalidation: {position.invalidation}</p>
        <div className="item-meta">
          <span className={`trading-position-sizing ${overConcentrated ? 'over' : ''}`}>
            {overConcentrated ? <AlertTriangle size={12} strokeWidth={2.5} /> : null}
            {sizePct}% of capital
          </span>
          {stale && (
            <span className="trading-stale-badge">
              <Clock size={12} strokeWidth={2.5} /> Untouched 30+ days -- still the thesis?
            </span>
          )}
        </div>
        {closing ? (
          <div className="finance-row-edit trading-close-form" style={{ marginTop: 8 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Exit price"
              value={exitPrice}
              onChange={(event) => setExitPrice(event.target.value)}
              autoFocus
            />
            <textarea
              placeholder="What did you learn? (required -- win or lose, be honest)"
              value={lesson}
              onChange={(event) => setLesson(event.target.value)}
              rows={2}
            />
            <button
              onClick={() => {
                closePosition(position.id, exitPrice, lesson)
                setClosing(false)
                setExitPrice('')
                setLesson('')
              }}
              disabled={saving || !exitPrice || !lesson.trim()}
            >
              Confirm close
            </button>
            <button onClick={() => setClosing(false)}>Cancel</button>
          </div>
        ) : (
          <button className="trading-close-button" onClick={() => setClosing(true)}>
            Close position
          </button>
        )}
      </div>
      <button className="delete-button" onClick={() => deletePosition(position.id)}>
        &times;
      </button>
    </div>
  )
}

function ClosedPositionRow({ position, deletePosition }) {
  const pl = (Number(position.exitPrice) - Number(position.avgCost)) * Number(position.shares)
  return (
    <div className="item-card">
      <div className="item-content">
        <strong>
          {position.ticker} &middot; {position.shares} sh: {formatMoney(position.avgCost)} &rarr; {formatMoney(position.exitPrice)}
        </strong>
        <p className={pl >= 0 ? 'trading-realized up' : 'trading-realized down'}>
          {pl >= 0 ? '+' : ''}
          {formatMoney(pl)} realized
        </p>
        {position.lesson && <p>Lesson: {position.lesson}</p>}
      </div>
      <button className="delete-button" onClick={() => deletePosition(position.id)}>
        &times;
      </button>
    </div>
  )
}

const VERDICT_META = {
  watching: { label: 'Watching', icon: Eye },
  ready: { label: 'Ready', icon: CheckCircle2 },
  pass: { label: 'Pass', icon: Ban },
}

function WatchlistForm({ saving, addWatchlistItem }) {
  const [ticker, setTicker] = useState('')
  const [thesis, setThesis] = useState('')
  const [catalyst, setCatalyst] = useState('')
  const [valuation, setValuation] = useState('')

  function handleAdd() {
    addWatchlistItem(ticker, thesis, catalyst, valuation)
    setTicker('')
    setThesis('')
    setCatalyst('')
    setValuation('')
  }

  return (
    <div className="form-card">
      <input
        placeholder="Ticker (e.g. AAPL)"
        value={ticker}
        onChange={(event) => setTicker(event.target.value)}
        style={{ textTransform: 'uppercase' }}
      />
      <textarea
        placeholder="Thesis -- the real case, not 'it's going up'"
        value={thesis}
        onChange={(event) => setThesis(event.target.value)}
        rows={2}
      />
      <div className="finance-transaction-form-row">
        <input
          placeholder="Catalyst (optional)"
          value={catalyst}
          onChange={(event) => setCatalyst(event.target.value)}
        />
        <input
          placeholder="Valuation note (optional)"
          value={valuation}
          onChange={(event) => setValuation(event.target.value)}
        />
      </div>
      <button onClick={handleAdd} disabled={saving || !ticker.trim() || !thesis.trim()}>
        <Plus size={14} strokeWidth={2.5} /> Add to watchlist
      </button>
    </div>
  )
}

function WatchlistRow({ item, saving, updateWatchlistItem, deleteWatchlistItem, onPromote }) {
  const stale = isStale(item.updatedAt || item.addedAt)
  return (
    <div className="item-card">
      <div className="item-content">
        <strong>
          {item.ticker}{' '}
          <select
            className={`trading-verdict-select ${item.verdict}`}
            value={item.verdict}
            disabled={saving}
            onChange={(event) => updateWatchlistItem(item.id, { verdict: event.target.value })}
          >
            {Object.entries(VERDICT_META).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        </strong>
        <p>{item.thesis}</p>
        {item.catalyst && <p>Catalyst: {item.catalyst}</p>}
        {item.valuation && <p>Valuation: {item.valuation}</p>}
        <div className="item-meta">
          {stale && (
            <span className="trading-stale-badge">
              <Clock size={12} strokeWidth={2.5} /> Untouched 30+ days
            </span>
          )}
          <button className="trading-promote-button" onClick={() => onPromote(item)}>
            Promote to position <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <button className="delete-button" onClick={() => deleteWatchlistItem(item.id)}>
        &times;
      </button>
    </div>
  )
}

function TradingTab({
  positions,
  watchlist,
  stats,
  saving,
  addPosition,
  closePosition,
  deletePosition,
  addWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  tradingSettings,
  updateTradingSettings,
}) {
  // Set by a watchlist "Promote to position" click; the incrementing key
  // forces PositionForm to remount with the new draft instead of fighting
  // whatever Dylan may have already been typing into it.
  const [draft, setDraft] = useState(null)
  const [draftKey, setDraftKey] = useState(0)

  function handlePromote(item) {
    setDraft({ ticker: item.ticker, thesis: item.thesis })
    setDraftKey((key) => key + 1)
  }

  const openPositions = positions.filter((p) => p.status === 'open')
  const closedPositions = positions
    .filter((p) => p.status === 'closed')
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))

  return (
    <div className="finance-transactions">
      <div className="trading-settings-row">
        <RiskLimitEditor
          limitPct={tradingSettings?.concentrationLimitPct || 10}
          saving={saving}
          updateTradingSettings={updateTradingSettings}
        />
      </div>
      <RiskBanner stats={stats} />

      <span className="finance-ledger-heading">Open positions</span>
      <PositionForm key={draftKey} saving={saving} addPosition={addPosition} draft={draft} />

      <div className="items-list">
        {openPositions.length ? (
          openPositions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              sizing={stats?.bySizing?.[position.id]}
              saving={saving}
              closePosition={closePosition}
              deletePosition={deletePosition}
            />
          ))
        ) : (
          <div className="empty-state">
            <div>$</div>
            <h3>No positions yet</h3>
            <p>Open your first position above -- ticker, size, and a real thesis with an invalidation point.</p>
          </div>
        )}
      </div>

      {closedPositions.length > 0 && (
        <>
          <span className="finance-ledger-heading">
            Closed ({stats?.realizedPL >= 0 ? '+' : ''}{formatMoney(stats?.realizedPL || 0)} realized)
          </span>
          <div className="items-list">
            {closedPositions.map((position) => (
              <ClosedPositionRow key={position.id} position={position} deletePosition={deletePosition} />
            ))}
          </div>
        </>
      )}

      <span className="finance-ledger-heading">Watchlist</span>
      <WatchlistForm saving={saving} addWatchlistItem={addWatchlistItem} />
      <div className="items-list">
        {watchlist.length ? (
          watchlist.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              saving={saving}
              updateWatchlistItem={updateWatchlistItem}
              deleteWatchlistItem={deleteWatchlistItem}
              onPromote={handlePromote}
            />
          ))
        ) : (
          <div className="empty-state">
            <div>$</div>
            <h3>Nothing on the watchlist</h3>
            <p>Screen an idea above before it ever becomes a real position.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FinancePage({
  accounts,
  netWorth,
  history,
  transactions,
  budgets,
  positions,
  watchlist,
  tradingStats,
  tradingSettings,
  saving,
  addAccount,
  updateBalance,
  deleteAccount,
  addTransaction,
  deleteTransaction,
  setBudget,
  addPosition,
  closePosition,
  deletePosition,
  addWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  updateTradingSettings,
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
        <button type="button" className={activeTab === 'trading' ? 'active' : ''} onClick={() => setActiveTab('trading')}>
          Trading
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

      {activeTab === 'trading' && (
        <TradingTab
          positions={positions}
          watchlist={watchlist}
          stats={tradingStats}
          tradingSettings={tradingSettings}
          saving={saving}
          addPosition={addPosition}
          closePosition={closePosition}
          deletePosition={deletePosition}
          addWatchlistItem={addWatchlistItem}
          updateWatchlistItem={updateWatchlistItem}
          deleteWatchlistItem={deleteWatchlistItem}
          updateTradingSettings={updateTradingSettings}
        />
      )}
    </div>
  )
}
