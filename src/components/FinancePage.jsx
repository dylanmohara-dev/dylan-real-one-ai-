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

function formatMoney(value) {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
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

export default function FinancePage({ accounts, netWorth, history, saving, addAccount, updateBalance, deleteAccount, assistantContext, openChat }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('checking')
  const [balance, setBalance] = useState('')

  const assets = accounts.filter((account) => !TYPE_META[account.type]?.debt)
  const debts = accounts.filter((account) => TYPE_META[account.type]?.debt)

  const previousNetWorth = history.length > 1 ? history[history.length - 2].netWorth : null
  const delta = previousNetWorth === null ? null : netWorth - previousNetWorth

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
    </div>
  )
}
