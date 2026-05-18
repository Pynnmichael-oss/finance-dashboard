// Portfolio — allocation charts, holdings table, Fidelity CSV import, Yahoo Finance stub, import history
import { useState, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import seedHoldings from '../data/portfolio-holdings.json'
import seedSnapshots from '../data/net-worth-snapshots.json'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

// ── localStorage keys ─────────────────────────────────────────────────────────
const HOLDINGS_KEY    = 'finance_dashboard_holdings'
const SNAPSHOT_KEY    = 'finance_dashboard_snapshots'
const IMPORT_LOG_KEY  = 'finance_dashboard_import_log'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n || 0)

const fmtD = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0)

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#f472b6']

const ACCOUNT_LABELS = {
  rothIRA: 'Roth IRA', ira: 'IRA', '401k': '401(k)', brokerage: 'Brokerage',
}

// Account options shown in the Fidelity import dropdown
const ACCOUNT_OPTIONS = [
  { key: 'rothIRA',    label: 'Roth IRA (Fidelity)' },
  { key: 'ira',        label: 'IRA (Fidelity)'       },
  { key: 'brokerage',  label: 'Brokerage'             },
  { key: '401k',       label: '401(k)'                },
]

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
}

const legendFormatter = (v) => (
  <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>
)

// ── CSV helpers ───────────────────────────────────────────────────────────────

// Parse one CSV line, correctly handling quoted fields that contain commas
const parseCSVLine = (line) => {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += ch }
  }
  result.push(current.trim())
  return result
}

// Strip dollar signs, commas, percent signs and parse as a float
const parseNum = (s) =>
  parseFloat((s || '0').replace(/[$,%]/g, '').replace(/,/g, '')) || 0

// ── Fidelity CSV parser ───────────────────────────────────────────────────────
// Fidelity positions export columns (may have extra header rows before the column row):
//   Account Name, Account Number, Symbol, Description, Quantity, Last Price,
//   Last Price Change, Current Value, Today's Gain/Loss Dollar,
//   Today's Gain/Loss Percent, Total Gain/Loss Dollar, Total Gain/Loss Percent,
//   Percent Of Account, Cost Basis Total, Average Cost Basis, Type
const parseFidelityCSV = (text) => {
  const lines = text.trim().split(/\r?\n/)

  // Find the actual header row — Fidelity sometimes puts summary text above it
  const headerIdx = lines.findIndex((l) => {
    const lower = l.toLowerCase()
    return lower.includes('symbol') && lower.includes('quantity')
  })
  if (headerIdx === -1)
    throw new Error(
      'Could not find column headers. Is this a Fidelity positions CSV? ' +
      'Expected columns named "Symbol" and "Quantity".'
    )

  const headers = parseCSVLine(lines[headerIdx]).map((h) =>
    h.toLowerCase().trim().replace(/['"]/g, '')
  )

  // Find each column's position by matching against header text
  const col = (name) => headers.findIndex((h) => h.includes(name))

  const symbolIdx     = col('symbol')
  const quantityIdx   = col('quantity')
  const priceIdx      = col('last price')
  const avgCostIdx    = col('average cost basis')
  const currentValIdx = col('current value')
  const descIdx       = col('description')

  if (symbolIdx   === -1) throw new Error('Missing "Symbol" column.')
  if (quantityIdx === -1) throw new Error('Missing "Quantity" column.')
  if (priceIdx    === -1) throw new Error('Missing "Last Price" column.')

  const holdings = []
  const skipped  = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols   = parseCSVLine(line)
    const symbol = cols[symbolIdx]?.replace(/['"]/g, '').trim()

    // Skip rows with no real ticker (totals row, pending activity, blank)
    const isBadSymbol =
      !symbol ||
      symbol === '--' ||
      symbol.toLowerCase() === 'pending activity' ||
      symbol === ''

    if (isBadSymbol) {
      // Only log the skip if this line actually has some content (not just commas)
      if (line.replace(/,/g, '').trim().length > 2) {
        skipped.push({ row: i + 1, symbol: symbol || '(blank)', reason: 'No valid ticker symbol' })
      }
      continue
    }

    const quantity = parseNum(cols[quantityIdx])
    if (quantity === 0) {
      skipped.push({ row: i + 1, symbol, reason: 'Quantity is 0 — skipped' })
      continue
    }

    const currentPrice = parseNum(cols[priceIdx])
    const costBasis    = avgCostIdx >= 0 ? parseNum(cols[avgCostIdx])    : 0
    const currentValue = currentValIdx >= 0 ? parseNum(cols[currentValIdx]) : quantity * currentPrice
    const description  = descIdx >= 0 ? cols[descIdx]?.replace(/['"]/g, '').trim() : ''

    holdings.push({ ticker: symbol, shares: quantity, currentPrice, costBasis, currentValue, description })
  }

  return { holdings, skipped }
}

// ── Import log helpers ────────────────────────────────────────────────────────
const readImportLog = () => {
  try {
    const raw = localStorage.getItem(IMPORT_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

const writeImportLog = (entry) => {
  const log = readImportLog()
  log.unshift({ ...entry, id: Date.now(), timestamp: new Date().toISOString() })
  localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(log.slice(0, 100)))
}

// ── Holdings persistence ──────────────────────────────────────────────────────

// Load from localStorage; fall back to seed JSON if nothing imported yet
const readHoldings = () => {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Replace all holdings for one account, leave other accounts untouched
const persistHoldings = (accountKey, newHoldings, existingHoldings) => {
  const kept    = existingHoldings.filter((h) => h.account !== accountKey)
  const updated = [...kept, ...newHoldings.map((h) => ({ ...h, account: accountKey }))]
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(updated))
  return updated
}

// After a Fidelity import, punch the new account total into the net worth snapshot
// so the Net Worth page reflects the fresh data immediately
const updateSnapshotForAccount = (accountKey, totalValue) => {
  try {
    const storedRaw = localStorage.getItem(SNAPSHOT_KEY)
    const stored    = storedRaw ? JSON.parse(storedRaw) : []
    const allSnaps  = [...seedSnapshots, ...stored].sort((a, b) => a.date.localeCompare(b.date))
    const latest    = allSnaps[allSnaps.length - 1]
    const today     = new Date().toISOString().split('T')[0]

    // If a snapshot for today already exists in stored, update it in-place
    const todayIdx = stored.findIndex((s) => s.date === today)
    let updatedStored
    if (todayIdx >= 0) {
      updatedStored = stored.map((s, i) =>
        i === todayIdx
          ? { ...s, accounts: { ...s.accounts, [accountKey]: totalValue } }
          : s
      )
    } else {
      // No snapshot for today yet — create one carrying all latest values forward
      updatedStored = [
        ...stored,
        { date: today, accounts: { ...latest.accounts, [accountKey]: totalValue } },
      ]
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updatedStored))
  } catch { /* snapshot update is best-effort; don't break the import flow */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Portfolio() {
  // Load holdings: localStorage wins over seed so imported data persists
  const [rawHoldings, setRawHoldings] = useState(() => readHoldings() ?? seedHoldings)
  const [importLog,   setImportLog]   = useState(readImportLog)

  // Enrich each holding with calculated gain / loss numbers
  const holdings = useMemo(() =>
    rawHoldings.map((h) => {
      const totalCost    = h.shares * h.costBasis
      const currentValue = h.currentValue ?? h.shares * h.currentPrice
      const gain         = currentValue - totalCost
      const gainPct      = totalCost > 0 ? (gain / totalCost) * 100 : 0
      return { ...h, totalCost, currentValue, gain, gainPct }
    }),
    [rawHoldings]
  )

  const totalCost    = holdings.reduce((s, h) => s + h.totalCost, 0)
  const totalValue   = holdings.reduce((s, h) => s + h.currentValue, 0)
  const totalGain    = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  // Aggregate for the two donut charts
  const byAccount = useMemo(() => {
    const agg = holdings.reduce((acc, h) => {
      acc[h.account] = (acc[h.account] || 0) + h.currentValue
      return acc
    }, {})
    return Object.entries(agg).map(([account, value]) => ({
      name: ACCOUNT_LABELS[account] || account, value,
    }))
  }, [holdings])

  const byTicker = useMemo(() => {
    const agg = holdings.reduce((acc, h) => {
      acc[h.ticker] = (acc[h.ticker] || 0) + h.currentValue
      return acc
    }, {})
    return Object.entries(agg).map(([name, value]) => ({ name, value }))
  }, [holdings])

  // ── Fidelity import state ─────────────────────────────────────────────────
  const fileRef       = useRef()
  const [importAccount, setImportAccount] = useState('rothIRA')
  const [preview,       setPreview]       = useState(null)   // parsed rows awaiting confirmation
  const [skippedRows,   setSkippedRows]   = useState([])
  const [importErr,     setImportErr]     = useState('')
  const [importOpen,    setImportOpen]    = useState(false)

  const handleFidelityFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportErr('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const { holdings: parsed, skipped } = parseFidelityCSV(ev.target.result)
        if (parsed.length === 0) {
          setImportErr(
            'No valid holdings found. Check that this is a Fidelity positions CSV ' +
            '(Accounts → Positions → Download).'
          )
          return
        }
        setPreview(parsed)
        setSkippedRows(skipped)
      } catch (err) {
        setImportErr(`Parse error: ${err.message}`)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-uploading the same file
  }

  const confirmFidelityImport = () => {
    if (!preview) return
    // Total current value for this account — used to update the net worth snapshot
    const totalValue = preview.reduce((s, h) => s + h.currentValue, 0)

    const updated = persistHoldings(importAccount, preview, rawHoldings)
    updateSnapshotForAccount(importAccount, totalValue)

    writeImportLog({
      type:         'fidelity',
      account:      ACCOUNT_LABELS[importAccount] || importAccount,
      rowsImported: preview.length,
      rowsSkipped:  skippedRows.length,
      skippedDetails: skippedRows.map((r) => `Row ${r.row} (${r.symbol}): ${r.reason}`),
    })

    setRawHoldings(updated)
    setImportLog(readImportLog())
    setPreview(null)
    setSkippedRows([])
    setImportOpen(false)
  }

  // ── Yahoo Finance stub ────────────────────────────────────────────────────
  // TODO: Connect to Yahoo Finance API via backend proxy
  // Endpoint will be: GET /api/prices?tickers=VTI,VXUS,BND
  // Response: { ticker: currentPrice }
  // Update portfolio-holdings.json currentPrice values on success
  const [showPriceTooltip, setShowPriceTooltip] = useState(false)

  return (
    <div>
      <PageHeader title="Portfolio" subtitle="Investment allocation and performance" />

      {/* ── Summary stats + Refresh Prices stub ───────────────────────────── */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Cost Basis"
            value={fmt(totalCost)}
            subtext="Amount originally invested"
            icon="💵"
          />
          <StatCard
            title="Current Value"
            value={fmt(totalValue)}
            subtext="At current market prices"
            icon="📊"
          />
          <StatCard
            title="Total Gain / Loss"
            value={`${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}`}
            subtext={`${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}% overall return`}
            icon={totalGain >= 0 ? '✅' : '❌'}
          />
        </div>

        {/* Refresh Prices — disabled until backend proxy is wired up */}
        <div className="relative flex-shrink-0">
          <button
            disabled
            onMouseEnter={() => setShowPriceTooltip(true)}
            onMouseLeave={() => setShowPriceTooltip(false)}
            onFocus={() => setShowPriceTooltip(true)}
            onBlur={() => setShowPriceTooltip(false)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-500 text-sm rounded-lg cursor-not-allowed flex items-center gap-2"
            aria-label="Refresh prices — coming soon"
          >
            ↻ Refresh Prices
          </button>
          {showPriceTooltip && (
            <div className="absolute right-0 top-11 z-10 w-64 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 shadow-xl">
              <p className="font-medium text-slate-300 mb-1">Coming soon</p>
              <p>Live pricing via Yahoo Finance will be connected here once the backend proxy is set up.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Allocation Donut Charts ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">By Account</h2>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byAccount} cx="50%" cy="45%" innerRadius={60} outerRadius={88} dataKey="value" paddingAngle={3}>
                {byAccount.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [fmt(v)]} {...TOOLTIP_STYLE} />
              <Legend formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">By Asset</h2>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byTicker} cx="50%" cy="45%" innerRadius={60} outerRadius={88} dataKey="value" paddingAngle={3}>
                {byTicker.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [fmt(v)]} {...TOOLTIP_STYLE} />
              <Legend formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Holdings Table ────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {[
                  'Account', 'Ticker', 'Shares', 'Cost / Share', 'Price Now',
                  'Total Cost', 'Current Value', 'Gain / Loss', 'Return %',
                ].map((h) => (
                  <th
                    key={h}
                    className={`pb-3 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                      ['Shares','Cost / Share','Price Now','Total Cost','Current Value','Gain / Loss','Return %'].includes(h)
                        ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4 text-white whitespace-nowrap">
                    {ACCOUNT_LABELS[h.account] || h.account}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="bg-slate-800 text-blue-300 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                      {h.ticker}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{h.shares}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmtD(h.costBasis)}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmtD(h.currentPrice)}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmt(h.totalCost)}</td>
                  <td className="py-3 pr-4 text-white font-semibold text-right">{fmt(h.currentValue)}</td>
                  <td className={`py-3 pr-4 font-semibold text-right ${h.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {h.gain >= 0 ? '+' : ''}{fmt(h.gain)}
                  </td>
                  <td className={`py-3 font-semibold text-right ${h.gainPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={5} className="pt-3 pb-1 text-sm font-bold text-white">Total</td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-slate-300">{fmt(totalCost)}</td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-white">{fmt(totalValue)}</td>
                <td className={`pt-3 pb-1 text-right text-sm font-bold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
                </td>
                <td className={`pt-3 pb-1 text-right text-sm font-bold ${totalGainPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Fidelity CSV Import ───────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Import Fidelity Positions</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a positions CSV exported from Fidelity. Existing holdings for the selected
              account are replaced — other accounts are untouched.
            </p>
          </div>
          <button
            onClick={() => { setImportOpen((o) => !o); setPreview(null); setImportErr('') }}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importOpen ? 'Close' : '+ Import CSV'}
          </button>
        </div>

        {importOpen && (
          <div className="mt-5 pt-5 border-t border-slate-800">

            {/* Account selector + file button */}
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Account</label>
                <select
                  value={importAccount}
                  onChange={(e) => setImportAccount(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                >
                  {ACCOUNT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => fileRef.current.click()}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Choose CSV File
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFidelityFile}
                className="hidden"
              />
            </div>

            {/* Format hint */}
            <div className="bg-slate-800/40 rounded-lg px-4 py-3 text-xs text-slate-500 mb-4">
              <strong className="text-slate-400">How to export from Fidelity:</strong> Log in →
              Accounts &amp; Trade → Portfolio → Positions → Download CSV. The file should
              include columns for Symbol, Quantity, Last Price, Average Cost Basis, and Current Value.
            </div>

            {/* Error */}
            {importErr && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
                {importErr}
              </div>
            )}

            {/* Preview table — shown after parsing, before confirming */}
            {preview && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-slate-300">
                      {preview.length} holding{preview.length !== 1 ? 's' : ''} ready to import
                      into <span className="text-white">{ACCOUNT_LABELS[importAccount] || importAccount}</span>
                    </p>
                    {skippedRows.length > 0 && (
                      <p className="text-xs text-yellow-400 mt-0.5">
                        {skippedRows.length} row{skippedRows.length !== 1 ? 's' : ''} skipped
                        (see Import History below)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPreview(null); setSkippedRows([]) }}
                      className="px-3 py-1.5 border border-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmFidelityImport}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Confirm Import
                    </button>
                  </div>
                </div>

                <div className="overflow-auto max-h-64 rounded-lg border border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr>
                        {['Ticker', 'Description', 'Shares', 'Avg Cost', 'Price Now', 'Current Value'].map((h) => (
                          <th
                            key={h}
                            className={`px-3 py-2 text-slate-400 font-medium ${
                              ['Shares','Avg Cost','Price Now','Current Value'].includes(h) ? 'text-right' : 'text-left'
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((h, i) => (
                        <tr key={i} className="border-t border-slate-800/60">
                          <td className="px-3 py-2 text-blue-300 font-mono font-semibold">{h.ticker}</td>
                          <td className="px-3 py-2 text-white max-w-xs truncate">{h.description}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{h.shares}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{fmtD(h.costBasis)}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{fmtD(h.currentPrice)}</td>
                          <td className="px-3 py-2 text-white text-right font-medium">{fmt(h.currentValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Import History ────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Import History</h2>

        {importLog.length === 0 ? (
          <p className="text-sm text-slate-500">
            No imports yet. Import a Fidelity CSV above, or import credit card
            transactions on the Spending page — both show up here.
          </p>
        ) : (
          <div className="space-y-3">
            {importLog.map((entry) => (
              <div key={entry.id} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {entry.type === 'fidelity' ? '📊' : '💳'}{' '}
                      {entry.account}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                      {' · '}
                      <span className="text-green-400">{entry.rowsImported} imported</span>
                      {entry.rowsSkipped > 0 && (
                        <span className="text-yellow-400 ml-2">{entry.rowsSkipped} skipped</span>
                      )}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded ${
                    entry.type === 'fidelity'
                      ? 'bg-blue-900/40 text-blue-300'
                      : 'bg-purple-900/40 text-purple-300'
                  }`}>
                    {entry.type === 'fidelity' ? 'Fidelity' : 'Transactions'}
                  </span>
                </div>

                {/* Expandable list of skipped rows */}
                {entry.skippedDetails?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-yellow-400 cursor-pointer select-none">
                      Show {entry.skippedDetails.length} skipped row{entry.skippedDetails.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 pl-2 border-l border-slate-700">
                      {entry.skippedDetails.map((d, i) => (
                        <li key={i} className="text-xs text-slate-500">{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
