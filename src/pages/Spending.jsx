// Spending — category/card charts, transaction table, CSV import from Amex + Chase
import { useState, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import seedTransactions from '../data/transactions.json'
import PageHeader from '../components/PageHeader'

const STORAGE_KEY   = 'finance_dashboard_transactions'
const IMPORT_LOG_KEY = 'finance_dashboard_import_log'

// Write one entry to the shared import log (also read by Portfolio page)
const writeImportLog = (entry) => {
  try {
    const raw = localStorage.getItem(IMPORT_LOG_KEY)
    const log = raw ? JSON.parse(raw) : []
    log.unshift({ ...entry, id: Date.now(), timestamp: new Date().toISOString() })
    localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(log.slice(0, 100)))
  } catch { /* log failures must not break the import */ }
}

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#94a3b8', '#fb923c', '#4ade80']

const CARDS = ['Amex Gold', 'Chase Sapphire', 'Chase Southwest']

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)

const fmtD = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n)

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
}

// ── CSV parsing helpers ──────────────────────────────────────────────────────

// Parse a single CSV line, handling quoted fields that may contain commas
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

// Convert M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD
const normalizeDate = (d) => {
  const parts = d.split('/')
  if (parts.length === 3) {
    const [m, day, y] = parts
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return d // already ISO or unknown — pass through
}

// Guess a category from the merchant name
const detectCategory = (desc) => {
  const d = desc.toUpperCase()
  if (/WHOLE FOODS|TRADER JOE|SAFEWAY|KROGER|SPROUTS|COSTCO|PUBLIX|MARKET/.test(d)) return 'Groceries'
  if (/SOUTHWEST|DELTA|UNITED|AMERICAN AIR|JETBLUE|SPIRIT|FRONTIER|AIRLINE|AIRWAYS/.test(d)) return 'Travel'
  if (/MARRIOTT|HILTON|HYATT|HOTEL|AIRBNB|RESORT/.test(d)) return 'Travel'
  if (/NETFLIX|SPOTIFY|HULU|DISNEY\+|HBO|AMAZON PRIME|APPLE\.COM|GOOGLE PLAY|PARAMOUNT/.test(d)) return 'Subscriptions'
  if (/SHELL|BP|EXXON|CHEVRON|MOBIL|SUNOCO|GAS|FUEL|SPEEDWAY/.test(d)) return 'Gas'
  if (/CVS|WALGREEN|PHARMACY|DOCTOR|MEDICAL|DENTAL|VISION|GYM|FITNESS/.test(d)) return 'Health'
  if (/ELECTRIC|INTERNET|AT&T|VERIZON|T-MOBILE|WATER|UTILITY/.test(d)) return 'Utilities'
  if (/MOVIE|THEATER|CONCERT|TICKETMASTER|AMC|REGAL|BROADWAY|LIVE NATION/.test(d)) return 'Entertainment'
  if (/NOBU|SUSHI|CHIPOTLE|SHAKE SHACK|SWEETGREEN|RESTAURANT|CAFE|GRILL|BISTRO|DINING|KITCHEN|DELI|TACO|PIZZA|BURGER/.test(d)) return 'Dining'
  return 'Shopping'
}

// Parse CSV text into normalized transaction objects
// Supports Amex format: Date, Description, Amount (positive = charge)
// Supports Chase format: Transaction Date, Post Date, Description, ..., Amount (negative = charge)
const parseCSV = (text, defaultCard) => {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase())
  const isChase = headers.some((h) => h.includes('transaction date'))

  // Find key column indices from the header row
  const dateIdx   = isChase ? headers.findIndex((h) => h.includes('transaction date')) : 0
  const descIdx   = isChase ? 2 : 1 // Chase has Post Date at col 1
  const amountIdx = headers.findIndex((h) => h === 'amount')

  if (amountIdx === -1) throw new Error('No "Amount" column found.')

  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line, idx) => {
      const cols = parseCSVLine(line)
      const rawAmount = parseFloat(cols[amountIdx]?.replace(/[$,]/g, '') || '0')

      // Skip payments / credits (Chase = positive, Amex = negative or zero)
      if (isChase && rawAmount >= 0) return null
      if (!isChase && rawAmount <= 0) return null

      return {
        id:          `imported-${Date.now()}-${idx}`,
        date:        normalizeDate(cols[dateIdx] || ''),
        description: cols[descIdx] || '',
        amount:      Math.abs(rawAmount),
        category:    detectCategory(cols[descIdx] || ''),
        card:        defaultCard,
      }
    })
    .filter(Boolean)
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Spending() {
  // Transactions imported via CSV and saved to localStorage
  const [storedTxns, setStoredTxns] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  const allTransactions = useMemo(
    () => [...seedTransactions, ...storedTxns],
    [storedTxns]
  )

  // ── Filters ───────────────────────────────────────────────────────────────
  const months = useMemo(
    () => [...new Set(allTransactions.map((t) => t.date.substring(0, 7)))].sort(),
    [allTransactions]
  )
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedCard,  setSelectedCard]  = useState('all')

  const filtered = useMemo(
    () =>
      allTransactions.filter((t) => {
        const monthOk = selectedMonth === 'all' || t.date.startsWith(selectedMonth)
        const cardOk  = selectedCard  === 'all' || t.card === selectedCard
        return monthOk && cardOk
      }),
    [allTransactions, selectedMonth, selectedCard]
  )

  const totalSpend = filtered.reduce((s, t) => s + t.amount, 0)

  // Category bar chart — sorted biggest first
  const categoryData = useMemo(() => {
    const agg = filtered.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})
    return Object.entries(agg)
      .map(([category, amount]) => ({ category, amount: +amount.toFixed(2) }))
      .sort((a, b) => b.amount - a.amount)
  }, [filtered])

  // Card donut chart
  const cardData = useMemo(() => {
    const agg = filtered.reduce((acc, t) => {
      acc[t.card] = (acc[t.card] || 0) + t.amount
      return acc
    }, {})
    return Object.entries(agg).map(([name, value]) => ({
      name,
      value: +value.toFixed(2),
    }))
  }, [filtered])

  // ── CSV Import state ──────────────────────────────────────────────────────
  const fileRef     = useRef()
  const [importCard, setImportCard] = useState('Amex Gold')
  const [preview,    setPreview]    = useState(null) // rows pending confirmation
  const [importErr,  setImportErr]  = useState('')

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportErr('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result, importCard)
        if (parsed.length === 0) {
          setImportErr('No charge transactions found. Check that the file matches Amex or Chase export format.')
          return
        }
        setPreview(parsed)
      } catch (err) {
        setImportErr(`Parse error: ${err.message}`)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-uploading the same file
  }

  const confirmImport = () => {
    if (!preview) return

    // Build a fingerprint for every transaction already in the list so we can
    // skip duplicates (same date + description + amount = same charge)
    const existing = new Set(
      allTransactions.map((t) => `${t.date}|${t.description}|${t.amount}`)
    )
    const newTxns  = preview.filter(
      (t) => !existing.has(`${t.date}|${t.description}|${t.amount}`)
    )
    const dupCount = preview.length - newTxns.length

    const updated = [...storedTxns, ...newTxns]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setStoredTxns(updated)

    // Log this import so it appears in the Import History on the Portfolio page
    writeImportLog({
      type:         'transactions',
      account:      importCard,
      rowsImported: newTxns.length,
      rowsSkipped:  dupCount,
      skippedDetails: dupCount > 0
        ? [`${dupCount} duplicate transaction${dupCount !== 1 ? 's' : ''} skipped (matched on date + description + amount)`]
        : [],
    })

    setPreview(null)
  }

  // How many rows in the current preview would be duplicates (computed before confirm)
  const previewDupCount = useMemo(() => {
    if (!preview) return 0
    const existing = new Set(
      allTransactions.map((t) => `${t.date}|${t.description}|${t.amount}`)
    )
    return preview.filter(
      (t) => existing.has(`${t.date}|${t.description}|${t.amount}`)
    ).length
  }, [preview, allTransactions])

  // Transactions sorted newest-first for the table
  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
    [filtered]
  )

  return (
    <div>
      <PageHeader title="Spending" subtitle="Credit card transactions and trends" />

      {/* ── Filter Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Months</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={selectedCard}
          onChange={(e) => setSelectedCard(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Cards</option>
          {CARDS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} transactions · {fmt(totalSpend)} total
        </span>
      </div>

      {/* ── Charts Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Category horizontal bar chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Spend by Category</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis
                type="number"
                stroke="#334155"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                type="category"
                dataKey="category"
                stroke="#334155"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={96}
              />
              <Tooltip
                formatter={(v) => [fmtD(v), 'Amount']}
                {...TOOLTIP_STYLE}
              />
              <Bar dataKey="amount" fill="#60a5fa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Card donut chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">By Card</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={cardData}
                cx="50%"
                cy="42%"
                innerRadius={55}
                outerRadius={82}
                dataKey="value"
                paddingAngle={3}
              >
                {cardData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [fmtD(v)]}
                {...TOOLTIP_STYLE}
              />
              <Legend
                formatter={(v) => (
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── CSV Import ───────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-1">Import Transactions</h2>
        <p className="text-xs text-slate-400 mb-4">
          Upload an Amex or Chase CSV export. Auto-detects format. Imported data is saved in your browser.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Which card this CSV belongs to */}
          <select
            value={importCard}
            onChange={(e) => setImportCard(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {CARDS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button
            onClick={() => fileRef.current.click()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Choose CSV File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {importErr && (
            <p className="text-red-400 text-xs">{importErr}</p>
          )}
        </div>

        {/* Preview table — shown after a file is selected, before confirming */}
        {preview && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-slate-300">
                  {preview.length} transaction{preview.length !== 1 ? 's' : ''} parsed
                  {' · '}
                  <span className="text-green-400">{preview.length - previewDupCount} new</span>
                  {previewDupCount > 0 && (
                    <span className="text-yellow-400 ml-1">
                      · {previewDupCount} duplicate{previewDupCount !== 1 ? 's' : ''} will be skipped
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreview(null)}
                  className="px-3 py-1.5 border border-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Confirm Import
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-56 rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800">
                  <tr>
                    {['Date', 'Description', 'Amount', 'Category', 'Card'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-slate-400 px-3 py-2 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800/60">
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{t.date}</td>
                      <td className="px-3 py-2 text-white max-w-xs truncate">{t.description}</td>
                      <td className="px-3 py-2 text-white whitespace-nowrap">{fmtD(t.amount)}</td>
                      <td className="px-3 py-2 text-slate-400">{t.category}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{t.card}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Transaction Table ────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Date', 'Description', 'Category', 'Card', 'Amount'].map((h) => (
                  <th
                    key={h}
                    className={`pb-3 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider ${
                      h === 'Amount' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{t.date}</td>
                  <td className="py-2.5 pr-4 text-white">{t.description}</td>
                  <td className="py-2.5 pr-4">
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs">
                      {t.category}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{t.card}</td>
                  <td className="py-2.5 text-white font-medium text-right whitespace-nowrap">
                    {fmtD(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
