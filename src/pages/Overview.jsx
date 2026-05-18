// Overview — high-level snapshot: net worth hero, sparkline trend, top metrics
import { useMemo } from 'react'
import {
  AreaChart, Area, Tooltip, ResponsiveContainer,
} from 'recharts'
import seedSnapshots from '../data/net-worth-snapshots.json'
import incomeData from '../data/income.json'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

// Sum all account balances in a single snapshot object
const totalOf = (accounts) =>
  Object.values(accounts).reduce((sum, v) => sum + v, 0)

// Format as $150,000 (no cents)
const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

// Format as +3.2% or -1.4%
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    fontSize: 12,
  },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
}

export default function Overview() {
  // Merge seed data with any snapshots the user added on the Net Worth page
  const allSnapshots = useMemo(() => {
    try {
      const stored = localStorage.getItem('finance_dashboard_snapshots')
      const extra = stored ? JSON.parse(stored) : []
      return [...seedSnapshots, ...extra].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    } catch {
      return seedSnapshots
    }
  }, [])

  // Current and previous snapshot for month-over-month comparison
  const current = allSnapshots[allSnapshots.length - 1]
  const prior = allSnapshots[allSnapshots.length - 2]

  const currentNW = totalOf(current.accounts)
  const priorNW = prior ? totalOf(prior.accounts) : currentNW
  const nwDelta = currentNW - priorNW
  const nwChangePct = prior ? (nwDelta / priorNW) * 100 : 0

  // Data points for the sparkline chart
  const chartData = allSnapshots.map((s) => ({
    date: s.date,
    total: totalOf(s.accounts),
  }))

  // Latest month from income.json for spend / savings rate
  const latestIncome = incomeData[incomeData.length - 1]
  const priorIncome = incomeData[incomeData.length - 2]

  const spendChangePct = priorIncome
    ? ((latestIncome.spend - priorIncome.spend) / priorIncome.spend) * 100
    : 0

  const savingsRate = ((latestIncome.invested / latestIncome.income) * 100).toFixed(1)

  // Investment accounts only (excludes cash)
  const investedTotal =
    currentNW - current.accounts.checking - (current.accounts.venmo || 0)

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Your financial snapshot at a glance"
      />

      {/* ── Net Worth Hero Card ───────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          {/* Left: number + change */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Total Net Worth
            </p>
            <p className="text-4xl font-bold text-white">{fmt(currentNW)}</p>
            <p
              className={`mt-2 text-sm font-medium ${
                nwDelta >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {nwDelta >= 0 ? '▲' : '▼'} {fmt(Math.abs(nwDelta))} (
              {fmtPct(nwChangePct)}) vs last month
            </p>
          </div>

          {/* Right: sparkline trend */}
          <div className="w-full md:w-72 h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#60a5fa"
                  fill="url(#sparkGrad)"
                  strokeWidth={2}
                  dot={false}
                />
                <Tooltip
                  formatter={(v) => [fmt(v), 'Net Worth']}
                  {...TOOLTIP_STYLE}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Top-level Metric Cards ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Invested"
          value={fmt(investedTotal)}
          subtext="Roth IRA · IRA · Brokerage"
          icon="📈"
        />
        <StatCard
          title="Monthly Spend"
          value={fmt(latestIncome.spend)}
          // Negative change = spending more = red; positive = green
          change={-spendChangePct}
          changeLabel="vs last month"
          subtext={`Prior month: ${fmt(priorIncome?.spend)}`}
          icon="💳"
        />
        <StatCard
          title="Savings Rate"
          value={`${savingsRate}%`}
          subtext={`${fmt(latestIncome.invested)} invested of ${fmt(latestIncome.income)} income`}
          icon="🎯"
        />
      </div>
    </div>
  )
}
