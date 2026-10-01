import { useEffect, useRef, useState } from 'react'
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
import HeroPhotoButton from './HeroPhotoButton.jsx'
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

function formatShortDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// history (from recordHistorySnapshot) is pushed in chronological order --
// finds the latest point at or before N days ago, so "vs 7 days ago" means
// something even on days no snapshot happened to land exactly on.
function netWorthDaysAgo(history, days) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  let candidate = null
  for (const point of history) {
    if (point.date <= cutoffKey) candidate = point
  }
  return candidate ? candidate.netWorth : null
}

function shiftMonthKey(monthKey, deltaMonths) {
  const [y, m] = monthKey.split('-').map(Number)
  const date = new Date(y, m - 1 + deltaMonths, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function totalSpentInMonth(transactions, monthKey) {
  return transactions
    .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === monthKey)
    .reduce((sum, t) => sum + t.amount, 0)
}

// Unlike BudgetTab's per-category bars (which only show a category once
// Dylan has manually set a limit for it), this shows EVERY category with
// real spend this month, sorted by size -- so "doesn't show spending
// trends well" doesn't depend on having already configured budgets first.
function spendingByCategory(transactions, monthKey) {
  const totals = {}
  transactions
    .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === monthKey)
    .forEach((t) => {
      totals[t.category] = (totals[t.category] || 0) + t.amount
    })
  return Object.entries(totals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

// Minimal RFC4180-ish CSV parser -- handles quoted fields (so a
// description like "Amazon, Inc" with a comma inside quotes doesn't split
// into two columns) and escaped "" quotes, which a naive text.split(',')
// would get wrong on real bank/brokerage exports.
function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((cell) => cell !== '')) rows.push(row)
  }
  return rows
}

// Finds the column whose header contains one of the given candidate words
// (checked in priority order) -- so a real export's actual column names
// ("Transaction Date", "Amount ($)", "Description") get matched without
// Dylan having to rename anything before pasting.
function guessColumnIndex(header, candidates) {
  const lower = header.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate))
    if (idx !== -1) return idx
  }
  return -1
}

// Most US bank/brokerage exports use M/D/YYYY, not ISO -- converts that to
// the YYYY-MM-DD every date field in this app actually uses. Anything
// already in that shape, or anything unrecognized, passes through
// unchanged (the backend's own validation rejects the latter rather than
// silently importing a wrong date).
function normalizeDate(raw) {
  const value = (raw || '').toString().trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    let [, m, d, y] = mdy
    if (y.length === 2) y = `20${y}`
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return value
}

// Dylan's own reference points for this redesign were Robinhood (a big,
// dominant, scrubbable chart is the whole screen) and YNAB (below) -- this
// is that for net worth. Time-range chips filter which slice of `history`
// gets drawn; if the selected range has fewer than 2 points (e.g. "1W" on
// an account that's only had 3 days of snapshots ever) it falls back to
// showing everything rather than rendering an empty/broken chart.
const NET_WORTH_RANGES = [
  { key: '1w', label: '1W', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'ALL', days: null },
]

function filterHistoryByDays(history, days) {
  if (!days) return history
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return history.filter((point) => new Date(point.date) >= cutoff)
}

function NetWorthChart({ history }) {
  const [range, setRange] = useState('3m')
  const [hoverIndex, setHoverIndex] = useState(null)
  const svgRef = useRef(null)

  if (history.length < 2) {
    return <p className="finance-sparkline-empty">Add a second day of balances to see a trend line here.</p>
  }

  const selectedDays = NET_WORTH_RANGES.find((option) => option.key === range)?.days ?? null
  const filtered = filterHistoryByDays(history, selectedDays)
  const points = filtered.length >= 2 ? filtered : history

  const values = points.map((point) => point.netWorth)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const valueRange = max - min || 1
  const width = 560
  const height = 140
  const step = width / (points.length - 1)

  const coords = values.map((value, index) => ({
    x: index * step,
    y: height - ((value - min) / valueRange) * (height - 12) - 6,
  }))
  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

  function handlePointerMove(event) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (!rect.width) return
    const relX = ((event.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let nearestDist = Infinity
    coords.forEach((coord, index) => {
      const dist = Math.abs(coord.x - relX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = index
      }
    })
    setHoverIndex(nearest)
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="finance-networth-chart">
      <div className="finance-range-chips">
        {NET_WORTH_RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`finance-range-chip ${range === option.key ? 'active' : ''}`}
            onClick={() => setRange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="finance-sparkline finance-sparkline-hero"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgb(var(--mode-accent-rgb))"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hoverIndex !== null && (
          <>
            <line
              x1={coords[hoverIndex].x}
              x2={coords[hoverIndex].x}
              y1="0"
              y2={height}
              className="finance-scrub-line"
            />
            <circle cx={coords[hoverIndex].x} cy={coords[hoverIndex].y} r="4" className="finance-scrub-dot" />
          </>
        )}
      </svg>

      <div className="finance-sparkline-range">
        {hovered ? (
          <span className="finance-scrub-readout">
            {formatShortDate(hovered.date)}: {formatMoney(Math.round(hovered.netWorth))}
          </span>
        ) : (
          <>
            <span>{formatShortDate(points[0].date)}</span>
            <span>{formatShortDate(points[points.length - 1].date)}</span>
          </>
        )}
      </div>
    </div>
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

// Session 41: Dylan asked Finance to look like the HybridTrader reference
// he showed, which opens with a real-exchange-hours strip (London/New
// York/Sydney/Asia, open/closed/pre-market). This is genuine, publicly
// known, deterministic data -- real market hours computed against the
// actual current time in each timezone via Intl -- not an invented
// "AI Macro Desk" bullish/bearish call, which would need a live market
// data feed this app doesn't have. Closed markets show only the known
// fixed open time, not a cross-day/DST countdown, since getting that
// precisely right needs a timezone-arithmetic library this codebase
// doesn't have installed -- stating what's certain beats faking a
// plausible-looking "opens in Xh Ym" that could be wrong.
const MARKET_SESSIONS = [
  { key: 'london', label: 'LONDON', timeZone: 'Europe/London', openMin: 8 * 60, closeMin: 16 * 60 + 30 },
  { key: 'newyork', label: 'NEW YORK', timeZone: 'America/New_York', openMin: 9 * 60 + 30, closeMin: 16 * 60, preMarketMin: 4 * 60 },
  { key: 'sydney', label: 'SYDNEY', timeZone: 'Australia/Sydney', openMin: 10 * 60, closeMin: 16 * 60 },
  { key: 'tokyo', label: 'ASIA', timeZone: 'Asia/Tokyo', openMin: 9 * 60, closeMin: 15 * 60 },
]

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const map = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]))
  const hour = map.hour === '24' ? 0 : Number(map.hour)
  return { minutesSinceMidnight: hour * 60 + Number(map.minute), weekday: map.weekday }
}

function formatHM(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function marketStatus(market, now) {
  const { minutesSinceMidnight, weekday } = getZonedParts(now, market.timeZone)
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'

  if (!isWeekend && minutesSinceMidnight >= market.openMin && minutesSinceMidnight < market.closeMin) {
    return { status: 'OPEN', detail: `closes in ${formatHM(market.closeMin - minutesSinceMidnight)}` }
  }
  if (
    !isWeekend &&
    market.preMarketMin != null &&
    minutesSinceMidnight >= market.preMarketMin &&
    minutesSinceMidnight < market.openMin
  ) {
    return { status: 'PRE-MARKET', detail: `opens in ${formatHM(market.openMin - minutesSinceMidnight)}` }
  }
  if (!isWeekend && minutesSinceMidnight >= market.closeMin && minutesSinceMidnight < market.closeMin + 240) {
    return { status: 'AFTER HOURS', detail: `${formatHM(minutesSinceMidnight - market.closeMin)} since close` }
  }
  const openHour = Math.floor(market.openMin / 60)
  const openMinute = market.openMin % 60
  return {
    status: 'CLOSED',
    detail: `opens ${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')}`,
  }
}

function MarketSessionStrip() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="finance-market-strip">
      {MARKET_SESSIONS.map((market) => {
        const { status, detail } = marketStatus(market, now)
        return (
          <div
            key={market.key}
            className={`finance-market-pill status-${status.replace(/\s+/g, '-').toLowerCase()}`}
          >
            <span className="finance-market-dot" />
            <span className="finance-market-name">{market.label}</span>
            <span className="finance-market-status">{status}</span>
            <span className="finance-market-detail">{detail}</span>
          </div>
        )
      })}
    </div>
  )
}

// Real-data answer to HybridTrader's "AI Macro Desk" / "Capital flow"
// panels Dylan asked to copy -- same visual energy (a small card grid of
// headline tickers, a compact bar-list of broader movers), but every
// number is a real fetched quote. No fabricated Bearish/Bullish call, no
// invented "confidence %" -- those would be made-up signal dressed as
// analysis, which has no place in a tool he's using to make real money
// decisions. UP/DOWN here is just the literal sign of the real move.
const MARKET_PULSE_SYMBOLS = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'GLD', label: 'Gold' },
  { symbol: 'BTCUSD', label: 'Bitcoin' },
  { symbol: 'EURUSD', label: 'EUR/USD' },
  { symbol: 'USDJPY', label: 'USD/JPY' },
]

function formatPulsePrice(symbol, price) {
  if (symbol === 'EURUSD' || symbol === 'USDJPY') return price.toFixed(4)
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: price >= 100 ? 0 : 2 })}`
}

function MarketPulsePanel() {
  const symbols = MARKET_PULSE_SYMBOLS.map((s) => s.symbol)
  const { quotes, status } = useLiveQuotes(symbols)
  const headline = MARKET_PULSE_SYMBOLS.slice(0, 4)

  return (
    <div className="market-pulse">
      <div className="market-pulse-header">
        <span className="eyebrow">Market pulse</span>
        <span className="market-pulse-sub">Real quotes only -- no AI sentiment, no confidence score</span>
      </div>

      {status === 'no_key' && (
        <div className="trading-live-price-hint">
          Live prices aren't wired up yet -- add a free Twelve Data API key to see real numbers here instead of "no live price".
        </div>
      )}

      <div className="market-pulse-grid">
        {headline.map(({ symbol, label }) => {
          const quote = quotes[symbol]
          const hasLive = quote && Number.isFinite(quote.price)
          const up = hasLive && quote.changePercent >= 0
          return (
            <div key={symbol} className="market-pulse-card">
              <div className="market-pulse-card-top">
                <strong>{label}</strong>
                {hasLive && <span className={`market-pulse-tag ${up ? 'up' : 'down'}`}>{up ? 'UP' : 'DOWN'}</span>}
              </div>
              {hasLive ? (
                <>
                  <span className="market-pulse-price">{formatPulsePrice(symbol, quote.price)}</span>
                  <span className={`market-pulse-change ${up ? 'up' : 'down'}`}>
                    {up ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
                    {Math.abs(quote.changePercent).toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="market-pulse-no-price">no live price</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="market-pulse-list">
        {MARKET_PULSE_SYMBOLS.map(({ symbol, label }) => {
          const quote = quotes[symbol]
          const hasLive = quote && Number.isFinite(quote.changePercent)
          const pct = hasLive ? quote.changePercent : 0
          const magnitude = Math.min(Math.abs(pct) / 3, 1) * 100
          const up = pct >= 0
          return (
            <div key={symbol} className="market-pulse-row">
              <span className="market-pulse-row-label">{label}</span>
              <div className="market-pulse-row-bar">
                <div className={`market-pulse-row-fill ${up ? 'up' : 'down'}`} style={{ width: `${hasLive ? magnitude : 0}%` }} />
              </div>
              <span className={`market-pulse-row-value ${hasLive ? (up ? 'up' : 'down') : 'muted'}`}>
                {hasLive ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '--'}
              </span>
            </div>
          )
        })}
      </div>
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
  // "Since last update" is ambiguous -- it could be yesterday or a month
  // ago depending on how often Dylan edits a balance. "vs 7 days ago" is a
  // real, fixed comparison window, which is what an actual trend needs.
  const weekAgoNetWorth = netWorthDaysAgo(history, 7)
  const weekDelta = weekAgoNetWorth === null ? null : netWorth - weekAgoNetWorth
  const displayedNetWorth = useCountUp(netWorth)

  return (
    <>
      <MarketSessionStrip />
      <MarketPulsePanel />
      <div className="finance-hero">
        <div className="finance-hero-figure">
          <span className="finance-hero-label">NET WORTH</span>
          <strong>{formatMoney(Math.round(displayedNetWorth))}</strong>
          <div className="finance-hero-deltas">
            {delta !== null && (
              <span className={`finance-hero-delta ${delta >= 0 ? 'up' : 'down'}`}>
                {delta >= 0 ? <ArrowUpRight size={13} strokeWidth={2.5} /> : <ArrowDownRight size={13} strokeWidth={2.5} />}
                {formatMoney(Math.abs(delta))} since last update
              </span>
            )}
            {weekDelta !== null && (
              <span className={`finance-hero-delta ${weekDelta >= 0 ? 'up' : 'down'}`}>
                {weekDelta >= 0 ? <ArrowUpRight size={13} strokeWidth={2.5} /> : <ArrowDownRight size={13} strokeWidth={2.5} />}
                {formatMoney(Math.abs(weekDelta))} vs 7 days ago
              </span>
            )}
          </div>
        </div>
        <NetWorthChart history={history} />
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

function SpendingTrendCard({ transactions }) {
  const month = currentMonthKey()
  const lastMonth = shiftMonthKey(month, -1)
  const thisMonthTotal = totalSpentInMonth(transactions, month)
  const lastMonthTotal = totalSpentInMonth(transactions, lastMonth)
  const breakdown = spendingByCategory(transactions, month)
  const delta = lastMonthTotal > 0 ? thisMonthTotal - lastMonthTotal : null

  if (breakdown.length === 0) return null

  return (
    <div className="finance-spending-trend">
      <div className="finance-spending-trend-header">
        <span className="eyebrow">SPENDING THIS MONTH</span>
        <strong>{formatMoney(thisMonthTotal)}</strong>
        {delta !== null && (
          <span className={`finance-hero-delta ${delta <= 0 ? 'up' : 'down'}`}>
            {delta <= 0 ? <ArrowDownRight size={13} strokeWidth={2.5} /> : <ArrowUpRight size={13} strokeWidth={2.5} />}
            {formatMoney(Math.abs(delta))} vs last month ({formatMoney(lastMonthTotal)})
          </span>
        )}
      </div>
      <div className="finance-spending-breakdown">
        {breakdown.map(({ category, amount }) => {
          const pct = Math.round((amount / thisMonthTotal) * 100)
          return (
            <div className="finance-spending-row" key={category}>
              <span className="finance-spending-category">{CATEGORY_LABELS[category] || category}</span>
              <div className="skill-xp-bar">
                <div className="skill-xp-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="finance-spending-amount">
                {formatMoney(amount)} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ImportTransactionsForm({ accounts, saving, importTransactions }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [csvText, setCsvText] = useState('')
  const [flipSign, setFlipSign] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)

  if (!accounts.length) return null

  function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsvText(reader.result?.toString() || '')
    reader.readAsText(file)
    event.target.value = ''
  }

  function handleParse() {
    const rows = parseCSV(csvText.trim())
    if (rows.length < 2) {
      setPreview(null)
      return
    }
    const header = rows[0]
    setPreview({
      header,
      dataRows: rows.slice(1),
      dateIdx: guessColumnIndex(header, ['date']),
      amountIdx: guessColumnIndex(header, ['amount', 'debit', 'credit']),
      descIdx: guessColumnIndex(header, ['description', 'memo', 'name', 'payee']),
    })
    setResult(null)
  }

  async function handleImport() {
    if (!preview || preview.dateIdx === -1 || preview.amountIdx === -1) return
    const rows = preview.dataRows
      .map((r) => {
        const rawAmount = Number((r[preview.amountIdx] || '').replace(/[$,]/g, ''))
        if (!Number.isFinite(rawAmount) || rawAmount === 0) return null
        const signedAmount = flipSign ? -rawAmount : rawAmount
        return {
          date: normalizeDate(r[preview.dateIdx]),
          type: signedAmount < 0 ? 'expense' : 'income',
          amount: Math.abs(signedAmount),
          note: preview.descIdx !== -1 ? r[preview.descIdx] : '',
        }
      })
      .filter(Boolean)
    const res = await importTransactions(accountId, rows)
    setResult(res)
    if (res.imported > 0) {
      setCsvText('')
      setPreview(null)
    }
  }

  return (
    <div className="form-card finance-import-form">
      <label htmlFor="finance-import-account-select">Import into account</label>
      <select id="finance-import-account-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      <label htmlFor="finance-import-file">Paste CSV or upload a file (a real Fidelity/bank export)</label>
      <input id="finance-import-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder="...or paste CSV rows here -- needs a Date column and an Amount column"
        rows={4}
      />
      <label className="finance-import-flip">
        <input type="checkbox" checked={flipSign} onChange={(e) => setFlipSign(e.target.checked)} />
        Flip sign (check this if expenses show as positive numbers in this export)
      </label>
      <button type="button" onClick={handleParse} disabled={!csvText.trim()}>
        Preview
      </button>

      {preview && (
        <div className="finance-import-preview">
          {preview.dateIdx === -1 || preview.amountIdx === -1 ? (
            <p className="finance-import-warning">
              Couldn't find a Date and Amount column automatically -- check the CSV has header names like "Date" and
              "Amount".
            </p>
          ) : (
            <>
              <p>
                Found {preview.dataRows.length} row{preview.dataRows.length === 1 ? '' : 's'}. Reading "
                {preview.header[preview.dateIdx]}" as the date and "{preview.header[preview.amountIdx]}" as the amount
                {preview.descIdx !== -1 ? `, "${preview.header[preview.descIdx]}" as the note` : ''}.
              </p>
              <button type="button" onClick={handleImport} disabled={saving}>
                Import {preview.dataRows.length} transaction{preview.dataRows.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <p className="finance-import-result">
          Imported {result.imported}
          {result.skipped?.length
            ? `, skipped ${result.skipped.length} row${result.skipped.length === 1 ? '' : 's'} that didn't parse.`
            : '.'}
        </p>
      )}
    </div>
  )
}

function TransactionsTab({ accounts, transactions, saving, addTransaction, deleteTransaction, importTransactions }) {
  const accountById = Object.fromEntries(accounts.map((account) => [account.id, account]))
  const sorted = transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))

  return (
    <div className="finance-transactions">
      <TransactionForm accounts={accounts} saving={saving} addTransaction={addTransaction} />
      <ImportTransactionsForm accounts={accounts} saving={saving} importTransactions={importTransactions} />
      <SpendingTrendCard transactions={transactions} />

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
  // A warning state -- real stakes before it's too late to matter, not
  // just a color change once the money's already gone.
  const warning = limit ? !over && spent / limit >= 0.8 : false

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
        <>
          <div className={`finance-budget-track ${warning ? 'warning' : ''} ${over ? 'over' : ''}`}>
            <div
              className={`finance-budget-track-fill ${warning ? 'warning' : ''} ${over ? 'over' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`finance-budget-left ${warning ? 'warning' : ''} ${over ? 'over' : ''}`}>
            {over ? `${formatMoney(spent - limit)} over` : `${formatMoney(limit - spent)} left`}
          </span>
        </>
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
          <span className={`finance-budget-left-total ${totalSpent > totalBudgeted ? 'over' : ''}`}>
            {totalSpent > totalBudgeted
              ? `${formatMoney(totalSpent - totalBudgeted)} over overall`
              : `${formatMoney(totalBudgeted - totalSpent)} left to spend overall`}
          </span>
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

function PositionRow({ position, sizing, quote, saving, closePosition, deletePosition }) {
  const [closing, setClosing] = useState(false)
  const [exitPrice, setExitPrice] = useState('')
  const [lesson, setLesson] = useState('')

  const costBasis = sizing?.costBasis ?? position.shares * position.avgCost
  const sizePct = sizing?.sizePct ?? 0
  const overConcentrated = sizing?.overConcentrated ?? false
  const stale = isStale(position.updatedAt || position.openedAt)

  // Unrealized P/L is plain math off a real fetched price (Twelve Data) --
  // never shown unless `quote` actually came back, so a missing key or a
  // provider hiccup shows "no live price" instead of a fabricated number.
  const hasLive = quote && Number.isFinite(quote.price)
  const unrealized = hasLive ? (quote.price - position.avgCost) * position.shares : null
  const unrealizedPct = hasLive && position.avgCost ? ((quote.price - position.avgCost) / position.avgCost) * 100 : null

  return (
    <div className="trading-card">
      <button className="delete-button" onClick={() => deletePosition(position.id)}>
        &times;
      </button>
      <div className="trading-card-top">
        <strong className="trading-card-ticker">
          {position.ticker}
          <span className="trading-card-long-tag">LONG</span>
        </strong>
        {hasLive ? (
          <div className="trading-card-price">
            <span className="trading-card-price-value">{formatMoney(quote.price)}</span>
            <span className={`trading-card-change ${quote.changePercent >= 0 ? 'up' : 'down'}`}>
              {quote.changePercent >= 0 ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
              {Math.abs(quote.changePercent).toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="trading-card-no-price">no live price</span>
        )}
      </div>
      <p className="trading-card-line">
        {position.shares} sh @ {formatMoney(position.avgCost)} ({formatMoney(costBasis)})
      </p>
      {unrealized !== null && (
        <p className={`trading-card-unrealized ${unrealized >= 0 ? 'up' : 'down'}`}>
          {unrealized >= 0 ? '+' : ''}
          {formatMoney(unrealized)} unrealized ({unrealizedPct >= 0 ? '+' : ''}
          {unrealizedPct.toFixed(1)}%)
        </p>
      )}
      <p className="trading-card-thesis">Thesis: {position.thesis}</p>
      <p className="trading-card-thesis">Invalidation: {position.invalidation}</p>
      <div className="trading-size-track">
        <div
          className={`trading-size-track-fill ${overConcentrated ? 'over' : ''}`}
          style={{ width: `${Math.min(100, sizePct)}%` }}
        />
      </div>
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

function WatchlistRow({ item, quote, saving, updateWatchlistItem, deleteWatchlistItem, onPromote }) {
  const stale = isStale(item.updatedAt || item.addedAt)
  const hasLive = quote && Number.isFinite(quote.price)
  return (
    <div className="trading-card">
      <button className="delete-button" onClick={() => deleteWatchlistItem(item.id)}>
        &times;
      </button>
      <div className="trading-card-top">
        <strong className="trading-card-ticker">{item.ticker}</strong>
        {hasLive ? (
          <div className="trading-card-price">
            <span className="trading-card-price-value">{formatMoney(quote.price)}</span>
            <span className={`trading-card-change ${quote.changePercent >= 0 ? 'up' : 'down'}`}>
              {quote.changePercent >= 0 ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
              {Math.abs(quote.changePercent).toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="trading-card-no-price">no live price</span>
        )}
      </div>
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
      <p className="trading-card-thesis">{item.thesis}</p>
      {item.catalyst && <p className="trading-card-line">Catalyst: {item.catalyst}</p>}
      {item.valuation && <p className="trading-card-line">Valuation: {item.valuation}</p>}
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
  )
}

// Polls GET /api/trading/quotes for whatever tickers are currently on the
// book (open positions + watchlist). Deliberately lives here rather than in
// useAppData's big bootstrap load -- this is cheap, self-contained polling
// for one tab, not app-wide state. 60s matches the 45s server-side cache in
// lib/marketData.js so a poll almost never pays the slow, uncached path.
function useLiveQuotes(symbols) {
  const [quotes, setQuotes] = useState({})
  const [status, setStatus] = useState('idle')
  const key = symbols.join(',')

  useEffect(() => {
    if (!key) {
      setQuotes({})
      setStatus('idle')
      return
    }

    let cancelled = false

    async function poll() {
      try {
        const response = await fetch(`/api/trading/quotes?symbols=${encodeURIComponent(key)}`)
        const data = await response.json()
        if (cancelled) return
        if (data.ok) {
          setQuotes(data.quotes || {})
          setStatus('ok')
        } else {
          setStatus(data.reason === 'no_key' ? 'no_key' : 'error')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    poll()
    const interval = setInterval(poll, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [key])

  return { quotes, status }
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

  // Real tickers only -- never a fabricated quote. If Dylan hasn't added a
  // Twelve Data key yet, `status` comes back 'no_key' and every card just
  // shows "no live price" instead of the app pretending it has one.
  const liveSymbols = [...new Set([...openPositions.map((p) => p.ticker), ...watchlist.map((w) => w.ticker)])]
  const { quotes, status: quoteStatus } = useLiveQuotes(liveSymbols)

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

      {quoteStatus === 'no_key' && liveSymbols.length > 0 && (
        <div className="trading-live-price-hint">
          Live prices aren't wired up yet -- add a free Twelve Data API key to see real quotes here instead of "no live price".
        </div>
      )}

      <span className="finance-ledger-heading">Open positions</span>
      <PositionForm key={draftKey} saving={saving} addPosition={addPosition} draft={draft} />

      <div className="trading-card-grid">
        {openPositions.length ? (
          openPositions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              sizing={stats?.bySizing?.[position.id]}
              quote={quotes[position.ticker]}
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
      <div className="trading-card-grid">
        {watchlist.length ? (
          watchlist.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              quote={quotes[item.ticker]}
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
  heroImages,
  updateHeroImage,
  resetHeroImage,
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
  importTransactions,
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
      <div
        className={`page-header${heroImages?.finance ? ' mode-hero' : ''}`}
        style={heroImages?.finance ? { '--hero-photo': `url(${heroImages.finance})` } : undefined}
      >
        <HeroPhotoButton
          modeKey="finance"
          heroUrl={heroImages?.finance}
          onChange={updateHeroImage}
          onReset={resetHeroImage}
        />
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
          importTransactions={importTransactions}
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
