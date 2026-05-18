// Portfolio — charts, holdings table, broker-agnostic CSV import, Yahoo Finance stub, import history
import { useState, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import seedHoldings from '../data/portfolio-holdings.json'
import seedSnapshots from '../data/net-worth-snapshots.json'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

// ── localStorage keys ─────────────────────────────────────────────────────────
const HOLDINGS_KEY       = 'finance_dashboard_holdings'
const SNAPSHOT_KEY       = 'finance_dashboard_snapshots'
const IMPORT_LOG_KEY     = 'finance_dashboard_import_log'
const CUSTOM_ACCTS_KEY   = 'finance_dashboard_custom_accounts'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
const fmtD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#f472b6']

// Built-in account keys and their display names
const BUILTIN_ACCOUNTS = {
  rothIRA: 'Roth IRA', ira: 'IRA', '401k': '401(k)', brokerage: 'Brokerage',
}

// Accounts available in the "assign to account" dropdown
const BUILTIN_ACCOUNT_OPTIONS = [
  { key: 'rothIRA',   label: 'Roth IRA'   },
  { key: 'ira',       label: 'IRA'        },
  { key: '401k',      label: '401(k)'     },
  { key: 'brokerage', label: 'Brokerage'  },
]

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
}
const legendFormatter = (v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>

// ── Broker format definitions ─────────────────────────────────────────────────
// Each entry describes how to parse that broker's CSV export.
// `fingerprint` is called with the lowercased joined header string to auto-detect the format.
// `cols` maps our internal field names to the column header text in that broker's export.
// `costBasisMode`: 'perShare' = the column already shows cost per share (Fidelity avg cost);
//                 'total'    = the column shows total cost basis, must divide by shares (Schwab).
// `manual: true` = skip auto-parsing; always go to the manual column mapper instead.
const BROKERS = [
  {
    key: 'fidelity',
    label: 'Fidelity',
    fingerprint: (h) => h.includes('average cost basis'),
    cols: { symbol: 'symbol', quantity: 'quantity', price: 'last price', costBasis: 'average cost basis', value: 'current value' },
    costBasisMode: 'perShare',
    skipSymbols: ['--', 'pending activity'],
    hint: 'Accounts & Trade → Portfolio → Positions → Download CSV',
  },
  {
    key: 'schwab',
    label: 'Schwab',
    // "Day's Gain" is unique to Schwab exports
    fingerprint: (h) => h.includes("day's gain") || h.includes('days gain'),
    cols: { symbol: 'symbol', quantity: 'quantity', price: 'price', costBasis: 'cost basis', value: 'market value' },
    costBasisMode: 'total',   // Schwab exports total cost basis — we divide by shares
    skipSymbols: ['--', 'cash & cash investments'],
    hint: 'Accounts → Positions → Export',
  },
  {
    key: 'vanguard',
    label: 'Vanguard',
    // "Investment Name" and "Share Price" are Vanguard-specific
    fingerprint: (h) => h.includes('investment name') || (h.includes('share price') && !h.includes('last price')),
    cols: { symbol: 'symbol', quantity: 'shares', price: 'share price', costBasis: null, value: 'total value' },
    costBasisMode: 'perShare',
    skipSymbols: ['--'],
    hint: 'My Accounts → Holdings → Download (CSV)',
  },
  {
    key: 'etrade',
    label: 'E*Trade',
    // E*Trade uses "Shares" not "Quantity", and has no "Market Value" / "Average Cost Basis"
    fingerprint: (h) => h.includes('shares') && h.includes('last price') && !h.includes('quantity') && !h.includes('average cost basis'),
    cols: { symbol: 'symbol', quantity: 'shares', price: 'last price', costBasis: null, value: 'value' },
    costBasisMode: 'perShare',
    skipSymbols: ['--'],
    hint: 'Accounts → Holdings → Download Spreadsheet',
  },
  {
    key: 'ubs',
    label: 'UBS',
    fingerprint: () => false,  // UBS format varies — always use manual mapping
    manual: true,
    hint: 'UBS export format varies by account type. Use the column mapper below.',
  },
  {
    key: 'other',
    label: 'Other',
    fingerprint: () => false,
    manual: true,
    hint: 'Map your CSV columns manually.',
  },
]

// The fields a user must (or can optionally) map in the manual mapper
const MAPPING_FIELDS = [
  { key: 'symbol',    label: 'Ticker / Symbol',        required: true  },
  { key: 'quantity',  label: 'Shares / Quantity',       required: true  },
  { key: 'price',     label: 'Current Price per Share', required: true  },
  { key: 'costBasis', label: 'Cost Basis per Share',    required: false },
  { key: 'value',     label: 'Total Current Value',     required: false },
]

// ── CSV helpers ───────────────────────────────────────────────────────────────

// Parse one CSV line, correctly handling quoted fields (e.g. "$1,234.00" stays whole)
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

// Strip $, commas, % signs then parse as a float. Returns 0 if unparseable.
const parseNum = (s) => parseFloat((s || '0').replace(/[$,%]/g, '').replace(/,/g, '')) || 0

// Auto-detect which broker a CSV belongs to by checking its header row text.
// Returns a broker key or 'other' if unrecognised.
const detectBroker = (headers) => {
  const h = headers.join(',').toLowerCase()
  for (const broker of BROKERS) {
    if (!broker.manual && broker.fingerprint(h)) return broker.key
  }
  return 'other'
}

// Generic holdings CSV parser — works for any broker with a known column config.
// Returns { holdings: [...], skipped: [...] }.
const parseHoldingsCSV = (text, brokerConfig) => {
  const lines = text.trim().split(/\r?\n/)

  // Find the header row. Some brokers (Fidelity) put summary text before the actual headers,
  // so we search for the first row that contains both the symbol and quantity column names.
  const symTarget = (brokerConfig.cols.symbol || 'symbol').toLowerCase()
  const qtyTarget = (brokerConfig.cols.quantity || 'quantity').toLowerCase()

  let headerIdx = lines.findIndex((l) => {
    const lower = l.toLowerCase()
    return lower.includes(symTarget) && lower.includes(qtyTarget)
  })
  // Fallback: find any row with "symbol" or "ticker"
  if (headerIdx === -1) {
    headerIdx = lines.findIndex((l) => {
      const lower = l.toLowerCase()
      return lower.includes('symbol') || lower.includes('ticker')
    })
  }
  if (headerIdx === -1)
    throw new Error(
      `Could not find a header row. Expected a column named "${brokerConfig.cols.symbol}".`
    )

  const headers = parseCSVLine(lines[headerIdx]).map((h) =>
    h.toLowerCase().trim().replace(/['"]/g, '')
  )

  // Find column positions by partial-substring match against the expected names
  const findCol = (target) => {
    if (!target) return -1
    const t = target.toLowerCase()
    // Exact match first, then "includes" in either direction
    let i = headers.findIndex((h) => h === t)
    if (i === -1) i = headers.findIndex((h) => h.includes(t) || t.includes(h))
    return i
  }

  const colIdx = {
    symbol:    findCol(brokerConfig.cols.symbol),
    quantity:  findCol(brokerConfig.cols.quantity),
    price:     findCol(brokerConfig.cols.price),
    costBasis: brokerConfig.cols.costBasis ? findCol(brokerConfig.cols.costBasis) : -1,
    value:     brokerConfig.cols.value     ? findCol(brokerConfig.cols.value)     : -1,
  }

  if (colIdx.symbol   < 0) throw new Error(`No "${brokerConfig.cols.symbol}" column found. Headers found: ${headers.join(', ')}`)
  if (colIdx.quantity < 0) throw new Error(`No "${brokerConfig.cols.quantity}" column found.`)
  if (colIdx.price    < 0) throw new Error(`No "${brokerConfig.cols.price}" column found.`)

  const skipSet = new Set((brokerConfig.skipSymbols || []).map((s) => s.toLowerCase()))

  const holdings = []
  const skipped  = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols      = parseCSVLine(line)
    const rawSymbol = (cols[colIdx.symbol] || '').replace(/['"]/g, '').trim()
    const symbol    = rawSymbol.toUpperCase()

    // Skip blank symbols, dashes, and rows explicitly listed as skip targets
    if (!rawSymbol || rawSymbol === '--' || rawSymbol === '***' || skipSet.has(rawSymbol.toLowerCase())) {
      if (line.replace(/,/g, '').trim().length > 2) {
        skipped.push({ row: i + 1, symbol: rawSymbol || '(blank)', reason: 'Cash or summary row — skipped' })
      }
      continue
    }

    // Parse quantity
    const rawQty = cols[colIdx.quantity] || ''
    const quantity = parseNum(rawQty)
    if (!quantity || quantity <= 0) {
      skipped.push({ row: i + 1, symbol, reason: `Row ${i + 1} skipped — could not parse quantity "${rawQty}"` })
      continue
    }

    // Parse price — skip if missing or placeholder
    const rawPrice = cols[colIdx.price] || ''
    if (!rawPrice || rawPrice.trim() === '--') {
      skipped.push({ row: i + 1, symbol, reason: `Row ${i + 1} skipped — price is "${rawPrice}"` })
      continue
    }
    const currentPrice = parseNum(rawPrice)
    if (currentPrice <= 0) {
      skipped.push({ row: i + 1, symbol, reason: `Row ${i + 1} skipped — could not parse price "$${rawPrice}"` })
      continue
    }

    // Parse cost basis (optional — leave as 0 if not available)
    let costBasis = 0
    if (colIdx.costBasis >= 0) {
      const raw = cols[colIdx.costBasis] || '0'
      const parsed = parseNum(raw)
      // Schwab exports total cost basis; divide by shares to get per-share cost
      costBasis = brokerConfig.costBasisMode === 'total' && quantity > 0
        ? parsed / quantity
        : parsed
    }

    // Parse total current value; fall back to price × shares if missing
    let currentValue = quantity * currentPrice
    if (colIdx.value >= 0) {
      const parsed = parseNum(cols[colIdx.value] || '0')
      if (parsed > 0) currentValue = parsed
    }

    holdings.push({ ticker: symbol, shares: quantity, currentPrice, costBasis, currentValue, description: '' })
  }

  return { holdings, skipped }
}

// ── Custom account helpers ────────────────────────────────────────────────────
const readCustomAccounts = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_ACCTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
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
const readHoldings = () => {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const persistHoldings = (accountKey, newHoldings, existingHoldings) => {
  const kept    = existingHoldings.filter((h) => h.account !== accountKey)
  const updated = [...kept, ...newHoldings.map((h) => ({ ...h, account: accountKey }))]
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(updated))
  return updated
}

// Punch the imported account total into today's net worth snapshot so the
// Net Worth page reflects fresh data without requiring a manual entry.
const updateSnapshotForAccount = (accountKey, totalValue) => {
  try {
    const storedRaw = localStorage.getItem(SNAPSHOT_KEY)
    const stored    = storedRaw ? JSON.parse(storedRaw) : []
    const allSnaps  = [...seedSnapshots, ...stored].sort((a, b) => a.date.localeCompare(b.date))
    const latest    = allSnaps[allSnaps.length - 1]
    const today     = new Date().toISOString().split('T')[0]
    const todayIdx  = stored.findIndex((s) => s.date === today)
    const updatedStored = todayIdx >= 0
      ? stored.map((s, i) =>
          i === todayIdx ? { ...s, accounts: { ...s.accounts, [accountKey]: totalValue } } : s
        )
      : [...stored, { date: today, accounts: { ...latest.accounts, [accountKey]: totalValue } }]
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updatedStored))
  } catch { /* best-effort — never break the import */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Portfolio() {
  // ── Holdings & supporting data ─────────────────────────────────────────────
  const [rawHoldings,    setRawHoldings]    = useState(() => readHoldings() ?? seedHoldings)
  const [customAccounts, setCustomAccounts] = useState(readCustomAccounts)
  const [importLog,      setImportLog]      = useState(readImportLog)

  // Look up a display label for any account key (built-in or custom)
  const accountLabel = (key) => BUILTIN_ACCOUNTS[key] || customAccounts[key] || key

  // Enrich each raw holding with computed gain / loss fields
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

  const byAccount = useMemo(() => {
    const agg = holdings.reduce((acc, h) => { acc[h.account] = (acc[h.account] || 0) + h.currentValue; return acc }, {})
    return Object.entries(agg).map(([account, value]) => ({ name: accountLabel(account), value }))
  }, [holdings, customAccounts])

  const byTicker = useMemo(() => {
    const agg = holdings.reduce((acc, h) => { acc[h.ticker] = (acc[h.ticker] || 0) + h.currentValue; return acc }, {})
    return Object.entries(agg).map(([name, value]) => ({ name, value }))
  }, [holdings])

  // ── Import wizard state ────────────────────────────────────────────────────
  const fileRef = useRef()

  const [importOpen,      setImportOpen]      = useState(false)   // is the whole panel open
  const [selectedBroker,  setSelectedBroker]  = useState(null)    // which broker the user picked
  const [rawCsvText,      setRawCsvText]       = useState(null)    // raw file text after upload
  const [csvHeaders,      setCsvHeaders]       = useState([])      // header row for manual mapper
  const [detectedBroker,  setDetectedBroker]   = useState(null)    // auto-detected broker key
  const [showMapping,     setShowMapping]      = useState(false)   // show manual column mapper
  const [columnMap,       setColumnMap]        = useState({})      // user's manual field→column choices
  const [preview,         setPreview]          = useState(null)    // parsed holdings pending confirm
  const [skippedRows,     setSkippedRows]      = useState([])      // rows that were skipped + why
  const [importErr,       setImportErr]        = useState('')

  // Account assignment state (step shown inside the preview)
  const [assignAccount,   setAssignAccount]    = useState('rothIRA')
  const [newAccountName,  setNewAccountName]   = useState('')

  // Yahoo Finance tooltip
  const [showPriceTooltip, setShowPriceTooltip] = useState(false)

  // Reset all import wizard state
  const resetImport = () => {
    setSelectedBroker(null); setRawCsvText(null); setCsvHeaders([])
    setDetectedBroker(null); setShowMapping(false); setColumnMap({})
    setPreview(null); setSkippedRows([]); setImportErr('')
    setAssignAccount('rothIRA'); setNewAccountName('')
  }

  // ── File upload handler ────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportErr('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target.result
        const firstLine = text.trim().split(/\r?\n/).find((l) => l.trim())
        const headers   = firstLine ? parseCSVLine(firstLine).map((h) => h.toLowerCase().replace(/['"]/g, '').trim()) : []

        // Auto-detect format even if user already picked a broker
        const detected = detectBroker(headers)
        setDetectedBroker(detected)
        setRawCsvText(text)
        setCsvHeaders(headers)

        const brokerConfig = BROKERS.find((b) => b.key === selectedBroker)

        // UBS and Other always go to manual mapping
        if (!brokerConfig || brokerConfig.manual) {
          // Pre-fill the column map with best-guess matches
          const guesses = {}
          MAPPING_FIELDS.forEach(({ key }) => {
            // Try to find a header that looks related to this field
            const candidates = { symbol: ['symbol', 'ticker'], quantity: ['quantity', 'shares'], price: ['price', 'last price', 'share price'], costBasis: ['cost basis', 'average cost'], value: ['value', 'market value', 'current value', 'total value'] }
            const match = (candidates[key] || []).find((c) => headers.some((h) => h.includes(c)))
            guesses[key] = match ? headers.find((h) => h.includes(match)) || '' : ''
          })
          setColumnMap(guesses)
          setShowMapping(true)
          return
        }

        // Try to parse with the selected broker's known format
        try {
          const { holdings: parsed, skipped } = parseHoldingsCSV(text, brokerConfig)
          if (parsed.length === 0) {
            setImportErr('No valid holdings found. The file may not match the expected format — try "Other" to map columns manually.')
            return
          }
          setPreview(parsed)
          setSkippedRows(skipped)
        } catch (err) {
          setImportErr(`Parse error: ${err.message}`)
        }
      } catch (err) {
        setImportErr(`Could not read file: ${err.message}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Manual mapper parse ────────────────────────────────────────────────────
  const parseWithManualMap = () => {
    if (!rawCsvText) return
    setImportErr('')
    // Validate required fields are mapped
    const missing = MAPPING_FIELDS.filter((f) => f.required && !columnMap[f.key])
    if (missing.length > 0) {
      setImportErr(`Please map these required fields: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    // Build a synthetic broker config from the user's column choices
    const manualConfig = {
      cols: {
        symbol:    columnMap.symbol    || '',
        quantity:  columnMap.quantity  || '',
        price:     columnMap.price     || '',
        costBasis: columnMap.costBasis || null,
        value:     columnMap.value     || null,
      },
      costBasisMode: 'perShare',  // manual imports assume per-share cost basis
      skipSymbols:   ['--'],
    }
    try {
      const { holdings: parsed, skipped } = parseHoldingsCSV(rawCsvText, manualConfig)
      if (parsed.length === 0) {
        setImportErr('No valid holdings found. Check that your column mappings are correct.')
        return
      }
      setPreview(parsed)
      setSkippedRows(skipped)
      setShowMapping(false)
    } catch (err) {
      setImportErr(`Parse error: ${err.message}`)
    }
  }

  // ── Confirm import ─────────────────────────────────────────────────────────
  const confirmImport = () => {
    if (!preview) return

    // Resolve the account key — either a built-in or a freshly created custom one
    let accountKey = assignAccount
    if (assignAccount === '__new__') {
      const name = newAccountName.trim()
      if (!name) { setImportErr('Please enter a name for the new account.'); return }
      // Generate a stable key from the name so it survives across sessions
      accountKey = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      const updatedCustom = { ...customAccounts, [accountKey]: name }
      localStorage.setItem(CUSTOM_ACCTS_KEY, JSON.stringify(updatedCustom))
      setCustomAccounts(updatedCustom)
    }

    const totalValue = preview.reduce((s, h) => s + h.currentValue, 0)
    const updated    = persistHoldings(accountKey, preview, rawHoldings)
    updateSnapshotForAccount(accountKey, totalValue)

    const brokerLabel = BROKERS.find((b) => b.key === selectedBroker)?.label || selectedBroker || 'Unknown'
    writeImportLog({
      type:         'holdings',
      broker:       brokerLabel,
      account:      accountLabel(accountKey),
      rowsImported: preview.length,
      rowsSkipped:  skippedRows.length,
      skippedDetails: skippedRows.map((r) => `Row ${r.row} (${r.symbol}): ${r.reason}`),
    })

    setRawHoldings(updated)
    setImportLog(readImportLog())
    resetImport()
    setImportOpen(false)
  }

  // ── Derived: mismatch between selected and detected broker ─────────────────
  const brokerMismatch =
    detectedBroker &&
    selectedBroker &&
    detectedBroker !== selectedBroker &&
    detectedBroker !== 'other' &&
    !BROKERS.find((b) => b.key === selectedBroker)?.manual

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Portfolio" subtitle="Investment allocation and performance" />

      {/* ── Summary stats + Refresh Prices ──────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Cost Basis" value={fmt(totalCost)} subtext="Amount originally invested" icon="💵" />
          <StatCard title="Current Value" value={fmt(totalValue)} subtext="At current market prices" icon="📊" />
          <StatCard
            title="Total Gain / Loss"
            value={`${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}`}
            subtext={`${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}% overall return`}
            icon={totalGain >= 0 ? '✅' : '❌'}
          />
        </div>

        {/* Refresh Prices stub — wired up once the backend proxy exists */}
        {/* TODO: Connect to Yahoo Finance API via backend proxy              */}
        {/* Endpoint will be: GET /api/prices?tickers=VTI,VXUS,BND           */}
        {/* Response: { ticker: currentPrice }                                */}
        {/* Update portfolio holdings currentPrice values on success          */}
        <div className="relative flex-shrink-0">
          <button
            disabled
            onMouseEnter={() => setShowPriceTooltip(true)}
            onMouseLeave={() => setShowPriceTooltip(false)}
            onFocus={() => setShowPriceTooltip(true)}
            onBlur={() => setShowPriceTooltip(false)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-500 text-sm rounded-lg cursor-not-allowed flex items-center gap-2"
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

      {/* ── Allocation Charts ────────────────────────────────────────────── */}
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

      {/* ── Holdings Table ───────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Account','Ticker','Shares','Cost / Share','Price Now','Total Cost','Current Value','Gain / Loss','Return %'].map((h) => (
                  <th key={h} className={`pb-3 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap ${['Shares','Cost / Share','Price Now','Total Cost','Current Value','Gain / Loss','Return %'].includes(h) ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4 text-white whitespace-nowrap">{accountLabel(h.account)}</td>
                  <td className="py-3 pr-4"><span className="bg-slate-800 text-blue-300 px-2 py-0.5 rounded text-xs font-mono font-semibold">{h.ticker}</span></td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{h.shares}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmtD(h.costBasis)}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmtD(h.currentPrice)}</td>
                  <td className="py-3 pr-4 text-slate-300 text-right">{fmt(h.totalCost)}</td>
                  <td className="py-3 pr-4 text-white font-semibold text-right">{fmt(h.currentValue)}</td>
                  <td className={`py-3 pr-4 font-semibold text-right ${h.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{h.gain >= 0 ? '+' : ''}{fmt(h.gain)}</td>
                  <td className={`py-3 font-semibold text-right ${h.gainPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={5} className="pt-3 pb-1 text-sm font-bold text-white">Total</td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-slate-300">{fmt(totalCost)}</td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-white">{fmt(totalValue)}</td>
                <td className={`pt-3 pb-1 text-right text-sm font-bold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalGain >= 0 ? '+' : ''}{fmt(totalGain)}</td>
                <td className={`pt-3 pb-1 text-right text-sm font-bold ${totalGainPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── Import Wizard ────────────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Import Holdings</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a positions CSV from any broker. Holdings for the assigned account are replaced — other accounts are untouched.
            </p>
          </div>
          <button
            onClick={() => { setImportOpen((o) => !o); if (importOpen) resetImport() }}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importOpen ? 'Close' : '+ Import CSV'}
          </button>
        </div>

        {importOpen && (
          <div className="mt-5 pt-5 border-t border-slate-800 space-y-5">

            {/* ── Step 1: Broker selection ──────────────────────────────── */}
            {!preview && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Step 1 — Which broker is this file from?
                </p>
                {/* 3-column button grid — large tap targets for mobile */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                  {BROKERS.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => { setSelectedBroker(b.key); setImportErr(''); setPreview(null); setShowMapping(false) }}
                      className={`py-3 px-2 rounded-lg text-sm font-medium border transition-colors text-center ${
                        selectedBroker === b.key
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                {/* Hint text for the selected broker */}
                {selectedBroker && (
                  <p className="text-xs text-slate-500 mb-4">
                    {BROKERS.find((b) => b.key === selectedBroker)?.hint}
                  </p>
                )}
              </div>
            )}

            {/* ── Step 2: File upload (shown once broker is selected) ───── */}
            {selectedBroker && !preview && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Step 2 — Upload your CSV file
                </p>
                <button
                  onClick={() => fileRef.current.click()}
                  disabled={!selectedBroker}
                  className="w-full sm:w-auto px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  ↑ Choose CSV File
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              </div>
            )}

            {/* ── Broker mismatch warning ───────────────────────────────── */}
            {brokerMismatch && !showMapping && !preview && (
              <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3">
                <p className="text-sm text-yellow-300 font-medium mb-2">
                  This looks like a {BROKERS.find((b) => b.key === detectedBroker)?.label} file
                </p>
                <p className="text-xs text-yellow-400/80 mb-3">
                  The column headers don't match {BROKERS.find((b) => b.key === selectedBroker)?.label}.
                  Do you want to switch, or keep parsing as {BROKERS.find((b) => b.key === selectedBroker)?.label}?
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setSelectedBroker(detectedBroker); setImportErr(''); /* re-trigger parse */ }}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-medium rounded-lg"
                  >
                    Switch to {BROKERS.find((b) => b.key === detectedBroker)?.label}
                  </button>
                  <button
                    onClick={() => setDetectedBroker(selectedBroker)}
                    className="px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg hover:bg-slate-800"
                  >
                    Keep {BROKERS.find((b) => b.key === selectedBroker)?.label}
                  </button>
                </div>
              </div>
            )}

            {/* ── Manual column mapper (Other / UBS) ───────────────────── */}
            {showMapping && !preview && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Map your columns
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Tell us which column in your CSV corresponds to each field.
                  Fields marked * are required.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {MAPPING_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-slate-400 mb-1 font-medium">
                        {field.label}{field.required ? ' *' : ' (optional)'}
                      </label>
                      <select
                        value={columnMap[field.key] || ''}
                        onChange={(e) => setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">— not in this file —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview of detected headers */}
                <p className="text-xs text-slate-500 mb-4">
                  Columns found in your file: {csvHeaders.join(', ')}
                </p>

                <button
                  onClick={parseWithManualMap}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Parse with these mappings
                </button>
              </div>
            )}

            {/* ── Error message ─────────────────────────────────────────── */}
            {importErr && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-400">
                {importErr}
              </div>
            )}

            {/* ── Step 3: Preview + account assignment ─────────────────── */}
            {preview && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">
                  Step 3 — Review and assign to an account
                </p>

                {/* Parsed holdings preview table */}
                <div className="overflow-auto max-h-64 rounded-lg border border-slate-800 mb-5">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr>
                        {['Ticker','Shares','Avg Cost / Share','Price Now','Current Value'].map((h) => (
                          <th key={h} className={`px-3 py-2 text-slate-400 font-medium ${['Shares','Avg Cost / Share','Price Now','Current Value'].includes(h) ? 'text-right' : 'text-left'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((h, i) => (
                        <tr key={i} className="border-t border-slate-800/60">
                          <td className="px-3 py-2 text-blue-300 font-mono font-semibold">{h.ticker}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{h.shares}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{h.costBasis > 0 ? fmtD(h.costBasis) : <span className="text-slate-600">n/a</span>}</td>
                          <td className="px-3 py-2 text-slate-300 text-right">{fmtD(h.currentPrice)}</td>
                          <td className="px-3 py-2 text-white text-right font-medium">{fmt(h.currentValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Skipped row summary */}
                {skippedRows.length > 0 && (
                  <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg px-4 py-3 mb-5">
                    <p className="text-xs text-yellow-400 font-medium mb-1">{skippedRows.length} row{skippedRows.length !== 1 ? 's' : ''} skipped</p>
                    <ul className="space-y-0.5">
                      {skippedRows.map((r, i) => (
                        <li key={i} className="text-xs text-slate-500">{r.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Account assignment */}
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 mb-5">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                    Which account do these holdings belong to?
                  </p>
                  <div className="flex flex-wrap gap-3 items-start">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Account</label>
                      <select
                        value={assignAccount}
                        onChange={(e) => setAssignAccount(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                      >
                        {BUILTIN_ACCOUNT_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.label}</option>
                        ))}
                        {/* Show any previously created custom accounts */}
                        {Object.entries(customAccounts).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                        <option value="__new__">+ Add new account…</option>
                      </select>
                    </div>

                    {/* Inline new account name input */}
                    {assignAccount === '__new__' && (
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">New account name</label>
                        <input
                          type="text"
                          placeholder="e.g. Roth IRA 2"
                          value={newAccountName}
                          onChange={(e) => setNewAccountName(e.target.value)}
                          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 w-48 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Existing holdings for this account will be replaced. Other accounts are untouched.
                  </p>
                </div>

                {/* Confirm / Cancel */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setPreview(null); setSkippedRows([]); setImportErr('') }}
                    className="px-4 py-2.5 border border-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={confirmImport}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Confirm Import — {preview.length} holding{preview.length !== 1 ? 's' : ''} into {assignAccount === '__new__' ? (newAccountName || 'new account') : accountLabel(assignAccount)}
                  </button>
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
            No imports yet. Import a holdings CSV above, or credit card transactions on the Spending page — both appear here.
          </p>
        ) : (
          <div className="space-y-3">
            {importLog.map((entry) => (
              <div key={entry.id} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {entry.type === 'transactions' ? '💳' : '📊'}{' '}
                      {entry.account}
                      {entry.broker && entry.type !== 'transactions' && (
                        <span className="text-slate-500 font-normal ml-1">via {entry.broker}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                      {' · '}
                      <span className="text-green-400">{entry.rowsImported} imported</span>
                      {entry.rowsSkipped > 0 && <span className="text-yellow-400 ml-2">{entry.rowsSkipped} skipped</span>}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded ${entry.type === 'transactions' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'}`}>
                    {entry.type === 'transactions' ? 'Transactions' : (entry.broker || 'Holdings')}
                  </span>
                </div>
                {entry.skippedDetails?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-yellow-400 cursor-pointer select-none">
                      Show {entry.skippedDetails.length} skipped row{entry.skippedDetails.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 pl-2 border-l border-slate-700">
                      {entry.skippedDetails.map((d, i) => <li key={i} className="text-xs text-slate-500">{d}</li>)}
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
