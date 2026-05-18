// Net Worth — historical chart, account breakdown, bank balance update form
// Investment account balances are updated via Fidelity CSV import on the Portfolio page.
// Bank balances (checking, savings, Venmo) are entered manually here.
import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import seedSnapshots from '../data/net-worth-snapshots.json'
import PageHeader from '../components/PageHeader'

const SNAPSHOT_KEY = 'finance_dashboard_snapshots'

// Sum every value in an accounts object (treats missing keys as 0)
const totalOf = (accounts) =>
  Object.values(accounts).reduce((sum, v) => sum + (v || 0), 0)

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n || 0)

const ACCOUNT_LABELS = {
  rothIRA:   'Roth IRA (Fidelity)',
  ira:       'IRA',
  '401k':    '401(k)',
  brokerage: 'Brokerage',
  checking:  'Checking',
  savings:   'Savings',
  venmo:     'Venmo',
}

const ACCOUNT_TYPE = {
  rothIRA: 'investment', ira: 'investment', '401k': 'investment', brokerage: 'investment',
  checking: 'cash', savings: 'cash', venmo: 'cash',
}

// The three bank fields the user enters manually
const BANK_ACCOUNTS = ['checking', 'savings', 'venmo']
// Investment accounts — values are carried from the last snapshot (or Fidelity import)
const INVESTMENT_ACCOUNTS = ['rothIRA', 'ira', '401k', 'brokerage']

// Display order for the breakdown table
const DISPLAY_ORDER = [...INVESTMENT_ACCOUNTS, ...BANK_ACCOUNTS]

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
}

export default function NetWorth() {
  // Any snapshots the user has added via this form, stored in localStorage
  const [storedSnapshots, setStoredSnapshots] = useState(() => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  // Merge seed data + stored additions, sorted oldest → newest
  const allSnapshots = useMemo(
    () =>
      [...seedSnapshots, ...storedSnapshots].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    [storedSnapshots]
  )

  // One chart point per snapshot
  const chartData = allSnapshots.map((s) => ({
    date: s.date,
    total: totalOf(s.accounts),
  }))

  // Latest snapshot drives the breakdown table and the auto-fill for investment values
  const latest = allSnapshots[allSnapshots.length - 1]

  // ── Bank Balance Update Form ──────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [bankFields, setBankFields] = useState({ checking: '', savings: '', venmo: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    // Carry the latest investment account values forward automatically
    const investmentValues = Object.fromEntries(
      INVESTMENT_ACCOUNTS.map((key) => [key, latest.accounts[key] ?? 0])
    )
    const newSnapshot = {
      date: formDate,
      accounts: {
        ...investmentValues,
        checking: parseFloat(bankFields.checking) || 0,
        savings:  parseFloat(bankFields.savings)  || 0,
        venmo:    parseFloat(bankFields.venmo)    || 0,
      },
    }
    const updated = [...storedSnapshots, newSnapshot]
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(updated))
    setStoredSnapshots(updated)
    setFormOpen(false)
    setBankFields({ checking: '', savings: '', venmo: '' })
  }

  return (
    <div>
      <PageHeader title="Net Worth" subtitle="Track your wealth over time" />

      {/* ── Historical Area Chart ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Net Worth Over Time</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#334155" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={55}
            />
            <Tooltip formatter={(v) => [fmt(v), 'Net Worth']} {...TOOLTIP_STYLE} />
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

      {/* ── Account Breakdown Table ───────────────────────────────────────── */}
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
              {DISPLAY_ORDER.map((key) => {
                const value = latest.accounts[key] ?? 0
                const total = totalOf(latest.accounts)
                const pct   = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
                const isInvestment = ACCOUNT_TYPE[key] === 'investment'
                return (
                  <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 text-white">{ACCOUNT_LABELS[key]}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        isInvestment
                          ? 'bg-blue-900/40 text-blue-300'
                          : 'bg-green-900/40 text-green-300'
                      }`}>
                        {isInvestment ? 'Investment' : 'Cash'}
                      </span>
                    </td>
                    <td className="py-3 text-right text-white font-medium">{fmt(value)}</td>
                    <td className="py-3 text-right text-slate-400">{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={2} className="pt-3 pb-1 text-sm font-bold text-white">Total</td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-white">
                  {fmt(totalOf(latest.accounts))}
                </td>
                <td className="pt-3 pb-1 text-right text-sm text-slate-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Update Bank Balances Form ─────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Update Bank Balances</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your current checking, savings, and Venmo balances. Investment
              account values are carried forward automatically from the last snapshot.
              History is never overwritten.
            </p>
          </div>
          <button
            onClick={() => setFormOpen((o) => !o)}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {formOpen ? 'Cancel' : '+ Update'}
          </button>
        </div>

        {formOpen && (
          <form onSubmit={handleSubmit} className="mt-5 pt-5 border-t border-slate-800 space-y-5">

            {/* Date picker */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full sm:w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* The three editable bank fields */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">
                Bank Accounts — enter current balances
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {BANK_ACCOUNTS.map((key) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">
                      {ACCOUNT_LABELS[key]}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={bankFields[key]}
                        onChange={(e) =>
                          setBankFields((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Show investment values that will be auto-carried — read-only info */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">
                Investment values auto-carried from last snapshot ({latest.date})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {INVESTMENT_ACCOUNTS.map((key) => (
                  <div key={key}>
                    <p className="text-xs text-slate-500">{ACCOUNT_LABELS[key]}</p>
                    <p className="text-sm font-semibold text-slate-300">
                      {fmt(latest.accounts[key] ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                To update investment values, import a Fidelity CSV on the Portfolio page.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Save Snapshot
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
