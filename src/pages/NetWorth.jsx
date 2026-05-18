// Net Worth — historical chart, account breakdown table, add-snapshot form
import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import seedSnapshots from '../data/net-worth-snapshots.json'
import PageHeader from '../components/PageHeader'

const STORAGE_KEY = 'finance_dashboard_snapshots'

const totalOf = (accounts) =>
  Object.values(accounts).reduce((sum, v) => sum + v, 0)

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

// Human-readable names for each account key
const ACCOUNT_LABELS = {
  rothIRA:  'Roth IRA (Fidelity)',
  ira:      'IRA',
  '401k':   '401(k)',
  brokerage:'Brokerage',
  checking: 'Checking / Savings',
  venmo:    'Venmo',
}

const ACCOUNT_TYPE = {
  rothIRA: 'investment', ira: 'investment', '401k': 'investment',
  brokerage: 'investment', checking: 'cash', venmo: 'cash',
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
}

// Default form values — same keys as our accounts
const emptyForm = () => ({
  rothIRA: '', ira: '', '401k': '', brokerage: '', checking: '', venmo: '',
})

export default function NetWorth() {
  // Snapshots the user has added manually, loaded from localStorage
  const [storedSnapshots, setStoredSnapshots] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  // Merge seed data with stored snapshots, sorted by date
  const allSnapshots = useMemo(
    () =>
      [...seedSnapshots, ...storedSnapshots].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    [storedSnapshots]
  )

  // Build chart data: one point per snapshot with total net worth
  const chartData = allSnapshots.map((s) => ({
    date: s.date,
    total: totalOf(s.accounts),
  }))

  // Most recent snapshot drives the breakdown table
  const latest = allSnapshots[allSnapshots.length - 1]

  // ── Add Snapshot form ─────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [formAccounts, setFormAccounts] = useState(emptyForm)

  const handleSubmit = (e) => {
    e.preventDefault()
    const newSnapshot = {
      date: formDate,
      accounts: Object.fromEntries(
        Object.entries(formAccounts).map(([k, v]) => [k, parseFloat(v) || 0])
      ),
    }
    const updated = [...storedSnapshots, newSnapshot]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setStoredSnapshots(updated)
    setFormOpen(false)
    setFormAccounts(emptyForm())
  }

  return (
    <div>
      <PageHeader title="Net Worth" subtitle="Track your wealth over time" />

      {/* ── Historical Area Chart ─────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">
          Net Worth Over Time
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={55}
            />
            <Tooltip
              formatter={(v) => [fmt(v), 'Net Worth']}
              {...TOOLTIP_STYLE}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#60a5fa"
              fill="url(#nwGrad)"
              strokeWidth={2}
              dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Account Breakdown Table ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Current Breakdown</h2>
          <span className="text-xs text-slate-400">As of {latest.date}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Account', 'Type', 'Balance', '% of Total'].map((h) => (
                  <th
                    key={h}
                    className={`pb-3 text-xs font-medium text-slate-400 uppercase tracking-wider ${
                      h === 'Balance' || h === '% of Total' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(latest.accounts).map(([key, value]) => {
                const total = totalOf(latest.accounts)
                const pct = ((value / total) * 100).toFixed(1)
                const isInvestment = ACCOUNT_TYPE[key] === 'investment'
                return (
                  <tr
                    key={key}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 text-white">
                      {ACCOUNT_LABELS[key] || key}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          isInvestment
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-green-900/40 text-green-300'
                        }`}
                      >
                        {isInvestment ? 'Investment' : 'Cash'}
                      </span>
                    </td>
                    <td className="py-3 text-right text-white font-medium">
                      {fmt(value)}
                    </td>
                    <td className="py-3 text-right text-slate-400">{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={2} className="pt-3 pb-1 text-sm font-bold text-white">
                  Total
                </td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-white">
                  {fmt(totalOf(latest.accounts))}
                </td>
                <td className="pt-3 pb-1 text-right text-sm text-slate-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Add Snapshot Form ─────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Add Snapshot</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Record a new monthly balance. History is never overwritten.
            </p>
          </div>
          <button
            onClick={() => setFormOpen((o) => !o)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {formOpen ? 'Cancel' : '+ Add Snapshot'}
          </button>
        </div>

        {formOpen && (
          <form
            onSubmit={handleSubmit}
            className="mt-5 pt-5 border-t border-slate-800 space-y-4"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">
                Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full sm:w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(formAccounts).map((key) => (
                <div key={key}>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">
                    {ACCOUNT_LABELS[key] || key}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={formAccounts[key]}
                    onChange={(e) =>
                      setFormAccounts((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Save Snapshot
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
