// Portfolio — allocation donut charts, holdings table with gain/loss per position
import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import rawHoldings from '../data/portfolio-holdings.json'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const fmtD = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#f472b6']

const ACCOUNT_LABELS = {
  rothIRA:   'Roth IRA',
  ira:       'IRA',
  brokerage: 'Brokerage',
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
}

const legendFormatter = (value) => (
  <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>
)

export default function Portfolio() {
  // Enrich each holding with calculated cost, value, and gain
  const holdings = useMemo(() =>
    rawHoldings.map((h) => {
      const totalCost     = h.shares * h.costBasis
      const currentValue  = h.shares * h.currentPrice
      const gain          = currentValue - totalCost
      const gainPct       = ((h.currentPrice - h.costBasis) / h.costBasis) * 100
      return { ...h, totalCost, currentValue, gain, gainPct }
    }),
    []
  )

  // Portfolio-wide totals
  const totalCost  = holdings.reduce((s, h) => s + h.totalCost, 0)
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0)
  const totalGain  = totalValue - totalCost
  const totalGainPct = (totalGain / totalCost) * 100

  // Aggregate current value by account for donut chart
  const byAccount = useMemo(() => {
    const agg = holdings.reduce((acc, h) => {
      acc[h.account] = (acc[h.account] || 0) + h.currentValue
      return acc
    }, {})
    return Object.entries(agg).map(([account, value]) => ({
      name: ACCOUNT_LABELS[account] || account,
      value,
    }))
  }, [holdings])

  // Aggregate current value by ticker for second donut chart
  const byTicker = useMemo(() => {
    const agg = holdings.reduce((acc, h) => {
      acc[h.ticker] = (acc[h.ticker] || 0) + h.currentValue
      return acc
    }, {})
    return Object.entries(agg).map(([name, value]) => ({ name, value }))
  }, [holdings])

  return (
    <div>
      <PageHeader title="Portfolio" subtitle="Investment allocation and performance" />

      {/* ── Summary Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

      {/* ── Allocation Donut Charts ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* By Account */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">By Account</h2>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={byAccount}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={88}
                dataKey="value"
                paddingAngle={3}
              >
                {byAccount.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [fmt(v)]}
                {...TOOLTIP_STYLE}
              />
              <Legend formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By Asset / Ticker */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">By Asset</h2>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={byTicker}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={88}
                dataKey="value"
                paddingAngle={3}
              >
                {byTicker.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [fmt(v)]}
                {...TOOLTIP_STYLE}
              />
              <Legend formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Holdings Table ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {[
                  'Account', 'Ticker', 'Shares',
                  'Cost / Share', 'Price Now',
                  'Total Cost', 'Current Value',
                  'Gain / Loss', 'Return %',
                ].map((h) => (
                  <th
                    key={h}
                    className={`pb-3 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                      ['Shares', 'Cost / Share', 'Price Now', 'Total Cost', 'Current Value', 'Gain / Loss', 'Return %'].includes(h)
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
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
                  <td
                    className={`py-3 pr-4 font-semibold text-right ${
                      h.gain >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {h.gain >= 0 ? '+' : ''}{fmt(h.gain)}
                  </td>
                  <td
                    className={`py-3 font-semibold text-right ${
                      h.gainPct >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td colSpan={5} className="pt-3 pb-1 text-sm font-bold text-white">
                  Total
                </td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-slate-300">
                  {fmt(totalCost)}
                </td>
                <td className="pt-3 pb-1 text-right text-sm font-bold text-white">
                  {fmt(totalValue)}
                </td>
                <td
                  className={`pt-3 pb-1 text-right text-sm font-bold ${
                    totalGain >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
                </td>
                <td
                  className={`pt-3 pb-1 text-right text-sm font-bold ${
                    totalGainPct >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
