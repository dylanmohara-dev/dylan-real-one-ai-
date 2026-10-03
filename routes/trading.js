import { Router } from 'express'
import { loadData, saveData } from '../lib/dataStore.js'
import { fetchQuotes } from '../lib/marketData.js'
import { fetchTechnicals } from '../lib/technicals.js'
import { fetchIndices, INDEX_DEFS } from '../lib/indexData.js'
import { fetchMarketNews } from '../lib/marketNews.js'

const router = Router()

const STATUSES = ['open', 'closed']
// Beginner default from Dylan's own stated rule: no single position above
// this share of the trading book. Not enforced as a hard block (this is
// tracking software, not a broker) -- surfaced as a flag so the mentor
// persona in routes/chat.js, and the UI, can call it out the moment it's
// crossed instead of Dylan finding out from a real drawdown later. Dylan
// asked to be able to tighten this himself rather than have it fixed in
// code, so it's now a per-user setting (trading_settings.json) with this
// as the fallback when nothing's been saved yet.
export const DEFAULT_CONCENTRATION_LIMIT_PCT = 10
export const DEFAULT_TRADING_SETTINGS = { concentrationLimitPct: DEFAULT_CONCENTRATION_LIMIT_PCT }

function loadTradingSettings() {
  const settings = loadData('trading_settings', DEFAULT_TRADING_SETTINGS)
  const limit = Number(settings.concentrationLimitPct)
  return { concentrationLimitPct: limit > 0 && limit <= 100 ? limit : DEFAULT_CONCENTRATION_LIMIT_PCT }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

// What "capital" a position's size is measured against. Prefers real
// investment-account balances (Finance mode's own accounts) over overall
// net worth, since a beginner's checking/savings shouldn't inflate how
// small a trading position looks; falls back to net worth, then to the
// trading book's own total so percentages are never divided by zero.
function resolveCapitalBase(financeAccounts, netWorth, totalCostBasis) {
  const investmentTotal = round2(
    (financeAccounts || [])
      .filter((account) => account.type === 'investment')
      .reduce((sum, account) => sum + (Number(account.balance) || 0), 0)
  )
  if (investmentTotal > 0) return investmentTotal
  if (Number(netWorth) > 0) return Number(netWorth)
  return totalCostBasis > 0 ? totalCostBasis : 1
}

// Shared by GET / (so the frontend always sees fresh numbers) and
// routes/bootstrap.js (so the one-shot app load doesn't reimplement this).
export function computeTradingStats(positions, financeAccounts, netWorth, concentrationLimitPct = DEFAULT_CONCENTRATION_LIMIT_PCT) {
  const open = positions.filter((position) => position.status === 'open')
  const totalCostBasis = round2(
    open.reduce((sum, position) => sum + (Number(position.shares) || 0) * (Number(position.avgCost) || 0), 0)
  )
  const capitalBase = resolveCapitalBase(financeAccounts, netWorth, totalCostBasis)

  const positionsWithSizing = open.map((position) => {
    const costBasis = round2((Number(position.shares) || 0) * (Number(position.avgCost) || 0))
    const sizePct = capitalBase > 0 ? round2((costBasis / capitalBase) * 100) : 0
    return { id: position.id, costBasis, sizePct, overConcentrated: sizePct > concentrationLimitPct }
  })

  const closed = positions.filter((position) => position.status === 'closed')
  const realizedPL = round2(
    closed.reduce((sum, position) => {
      const shares = Number(position.shares) || 0
      const exit = Number(position.exitPrice) || 0
      const cost = Number(position.avgCost) || 0
      return sum + shares * (exit - cost)
    }, 0)
  )

  return {
    capitalBase,
    totalCostBasis,
    openCount: open.length,
    closedCount: closed.length,
    realizedPL,
    concentrationLimitPct,
    bySizing: Object.fromEntries(positionsWithSizing.map((p) => [p.id, p])),
    anyOverConcentrated: positionsWithSizing.some((p) => p.overConcentrated),
  }
}

router.get('/', (req, res) => {
  const positions = loadData('trading_positions')
  const watchlist = loadData('trading_watchlist')
  const financeAccounts = loadData('finance_accounts')
  const settings = loadTradingSettings()
  // netWorth isn't recomputed here to avoid a circular import on
  // routes/finance.js -- the frontend already has it (useAppData's
  // bootstrap load) and the concentration math only genuinely needs it as
  // a fallback when there are no investment-type accounts at all.
  const netWorth = Number(req.query.netWorth) || 0
  res.json({
    positions,
    watchlist,
    settings,
    stats: computeTradingStats(positions, financeAccounts, netWorth, settings.concentrationLimitPct),
  })
})

// Live prices for whatever tickers are on Dylan's book right now (open
// positions + watchlist) -- GET so the frontend can call it on a plain
// polling timer. Never fabricates a price: no key or a provider error just
// means that ticker comes back null and the UI shows no live price for it,
// per the house rule against making up market data.
router.get('/quotes', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '')
      .toString()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!symbols.length) return res.json({ ok: true, quotes: {} })

    const result = await fetchQuotes(symbols)
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, reason: 'Could not fetch quotes', quotes: {} })
  }
})

// Macro Desk bias cards -- real RSI(14) + moving-average trend computed
// from actual historical closes (lib/technicals.js), never an AI call. No
// key or a provider error just means that symbol comes back null and the
// UI shows "no signal yet", same honesty rule as /quotes above.
router.get('/technicals', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '')
      .toString()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!symbols.length) return res.json({ ok: true, technicals: {} })

    const result = await fetchTechnicals(symbols)
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, reason: 'Could not fetch technicals', technicals: {} })
  }
})

// Real index values (actual S&P 500 / Nasdaq numbers, not an ETF price) --
// see lib/indexData.js for why this is a separate source from /quotes.
// No `symbols` param needed since there are only 4 known indices; accepts
// an optional comma list to fetch a subset, defaults to all of them.
router.get('/indices', async (req, res) => {
  try {
    const requested = (req.query.symbols || '').toString().split(',').map((s) => s.trim()).filter(Boolean)
    const keys = requested.length ? requested.filter((k) => INDEX_DEFS[k]) : Object.keys(INDEX_DEFS)
    const result = await fetchIndices(keys)
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, reason: 'Could not fetch indices', indices: {} })
  }
})

// Daily Briefing tab -- real headlines via Finnhub, never AI-generated
// "news". No key or a provider error just means an honest empty state,
// same house rule as /quotes and /technicals above.
router.get('/news', async (req, res) => {
  try {
    const result = await fetchMarketNews()
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, reason: 'Could not fetch news', articles: [] })
  }
})

router.put('/settings', (req, res) => {
  try {
    const numericLimit = Number(req.body.concentrationLimitPct)
    if (!numericLimit || numericLimit <= 0 || numericLimit > 100) {
      return res.status(400).json({ error: 'concentrationLimitPct must be a number between 1 and 100' })
    }
    const settings = { concentrationLimitPct: numericLimit }
    saveData('trading_settings', settings)
    res.json({ settings })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update trading settings' })
  }
})

router.post('/positions', (req, res) => {
  try {
    const { ticker, shares, avgCost, thesis, invalidation, notes } = req.body

    const cleanTicker = (ticker || '').toString().trim().toUpperCase()
    if (!cleanTicker) return res.status(400).json({ error: 'ticker is required' })

    const numericShares = Number(shares)
    if (!numericShares || numericShares <= 0) return res.status(400).json({ error: 'shares must be a positive number' })

    const numericAvgCost = Number(avgCost)
    if (!numericAvgCost || numericAvgCost <= 0) return res.status(400).json({ error: 'avgCost must be a positive number' })

    // Thesis and invalidation are required, not optional -- the whole point
    // of this tracker (per the trading-investing-mentor rules) is that
    // every position states, up front, what it's for and what would prove
    // it wrong. A ticker and a share count with no thesis is exactly the
    // "it's going up" pattern the mentor is supposed to reject.
    if (!thesis?.toString().trim()) return res.status(400).json({ error: 'thesis is required' })
    if (!invalidation?.toString().trim()) return res.status(400).json({ error: 'invalidation is required' })

    const positions = loadData('trading_positions')
    const position = {
      id: Date.now().toString(),
      ticker: cleanTicker,
      shares: numericShares,
      avgCost: numericAvgCost,
      thesis: thesis.toString().trim(),
      invalidation: invalidation.toString().trim(),
      notes: (notes || '').toString().trim(),
      status: 'open',
      exitPrice: null,
      openedAt: new Date().toISOString(),
      closedAt: null,
      updatedAt: new Date().toISOString(),
    }
    positions.push(position)
    saveData('trading_positions', positions)

    res.json({ position, positions })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not add position' })
  }
})

router.put('/positions/:id', (req, res) => {
  try {
    const positions = loadData('trading_positions')
    const position = positions.find((item) => item.id === req.params.id)
    if (!position) return res.status(404).json({ error: 'Position not found' })

    const { shares, avgCost, thesis, invalidation, notes, status, exitPrice } = req.body

    if (shares !== undefined) {
      const numericShares = Number(shares)
      if (!numericShares || numericShares <= 0) return res.status(400).json({ error: 'shares must be a positive number' })
      position.shares = numericShares
    }
    if (avgCost !== undefined) {
      const numericAvgCost = Number(avgCost)
      if (!numericAvgCost || numericAvgCost <= 0) return res.status(400).json({ error: 'avgCost must be a positive number' })
      position.avgCost = numericAvgCost
    }
    if (thesis !== undefined) position.thesis = thesis.toString().trim()
    if (invalidation !== undefined) position.invalidation = invalidation.toString().trim()
    if (notes !== undefined) position.notes = notes.toString().trim()

    // Closing a position requires the exit price -- realized P/L (see
    // computeTradingStats above) is meaningless without it, and a
    // beginner's discipline habit of actually recording how a trade ended
    // is worth enforcing here rather than leaving it optional.
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status must be one of: ' + STATUSES.join(', ') })
      if (status === 'closed') {
        const numericExit = Number(exitPrice)
        if (!numericExit || numericExit <= 0) {
          return res.status(400).json({ error: 'exitPrice is required to close a position' })
        }
        if (!req.body.lesson?.toString().trim()) {
          return res.status(400).json({ error: 'lesson is required to close a position -- one line on what you learned, win or lose' })
        }
        position.exitPrice = numericExit
        position.lesson = req.body.lesson.toString().trim()
        position.closedAt = new Date().toISOString()
      }
      position.status = status
    }

    position.updatedAt = new Date().toISOString()
    saveData('trading_positions', positions)

    res.json({ position, positions })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update position' })
  }
})

router.delete('/positions/:id', (req, res) => {
  const positions = loadData('trading_positions')
  const remaining = positions.filter((position) => position.id !== req.params.id)
  saveData('trading_positions', remaining)
  res.json({ success: true, positions: remaining })
})

// Watchlist: ideas being screened before they ever become a real position.
// Deliberately separate from positions -- an idea that fails screening
// should leave a record (verdict: "pass", and why) rather than just
// vanishing, so the same bad thesis doesn't get re-pitched from scratch
// in six months with no memory of having been rejected already.
router.post('/watchlist', (req, res) => {
  try {
    const { ticker, thesis, catalyst, valuation, verdict } = req.body

    const cleanTicker = (ticker || '').toString().trim().toUpperCase()
    if (!cleanTicker) return res.status(400).json({ error: 'ticker is required' })

    const watchlist = loadData('trading_watchlist')
    const item = {
      id: Date.now().toString(),
      ticker: cleanTicker,
      // Thesis is now optional -- Dylan asked for a quick "type a ticker,
      // see the real-time price" add (like TradingView's watchlist), not
      // a forced journal entry every time. The thesis-required discipline
      // still works when he DOES write one; this just stops blocking the
      // ticker-only case. Blank is a real state the UI shows honestly
      // ("No thesis logged"), never defaulted to a fake placeholder string.
      thesis: (thesis || '').toString().trim(),
      catalyst: (catalyst || '').toString().trim(),
      valuation: (valuation || '').toString().trim(),
      verdict: verdict && ['watching', 'pass', 'ready'].includes(verdict) ? verdict : 'watching',
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    watchlist.push(item)
    saveData('trading_watchlist', watchlist)

    res.json({ item, watchlist })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not add watchlist item' })
  }
})

router.put('/watchlist/:id', (req, res) => {
  try {
    const watchlist = loadData('trading_watchlist')
    const item = watchlist.find((entry) => entry.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Watchlist item not found' })

    const { thesis, catalyst, valuation, verdict } = req.body
    if (thesis !== undefined) item.thesis = thesis.toString().trim()
    if (catalyst !== undefined) item.catalyst = catalyst.toString().trim()
    if (valuation !== undefined) item.valuation = valuation.toString().trim()
    if (verdict !== undefined) {
      if (!['watching', 'pass', 'ready'].includes(verdict)) {
        return res.status(400).json({ error: 'verdict must be one of: watching, pass, ready' })
      }
      item.verdict = verdict
    }
    item.updatedAt = new Date().toISOString()
    saveData('trading_watchlist', watchlist)

    res.json({ item, watchlist })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not update watchlist item' })
  }
})

router.delete('/watchlist/:id', (req, res) => {
  const watchlist = loadData('trading_watchlist')
  const remaining = watchlist.filter((item) => item.id !== req.params.id)
  saveData('trading_watchlist', remaining)
  res.json({ success: true, watchlist: remaining })
})

export default router
