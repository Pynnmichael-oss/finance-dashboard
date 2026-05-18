// Cash Flow — income vs spending vs invested stacked bars, savings rate trend line
import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import rawIncome from '../data/income.json'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: 12 },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
}

const legendFormatter = (value) => (
  <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>
)

export default function CashFlow() {
  // Enrich each month with savings rate and the leftover ("net" = income - spend - invested)
  const chartData = useMemo(
    () =>
      rawIncome.map((d) => ({
        ...d,
        savingsRate: +((d.invested / d.income) * 100).toFixed(1),
        net:         d.income - d.spend - d.invested,
      })),
    []
  )

  const latest = chartData[chartData.length - 1]

  // Average savings rate across all months
  const avgSavingsRate = (
    chartData.reduce((s, d) => s + d.savingsRate, 0) / chartData.length
  ).toFixed(1)

  const totalInvested = chartData.reduce((s, d) => s + d.invested, 0)
  const totalSpend    = chartData.reduce((s, d) => s + d.spend, 0)

  return (
    <div>
      <PageHeader
        title="Cash Flow"
        subtitle="Income, spending, and investing across months"
      />

      {/* ── Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Avg Savings Rate"
          value={`${avgSavingsRate}%`}
          subtext="Invested ÷ income (all months)"
          icon="💰"
        />
        <StatCard
          title="Total Invested (Period)"
          value={fmt(totalInvested)}
          subtext={`${fmt(latest.invested)} this month`}
          icon="📈"
        />
        <StatCard
          title="Total Spent (Period)"
          value={fmt(totalSpend)}
          subtext={`${fmt(latest.spend)} this month`}
          icon="💳"
        />
      </div>

      {/* ── Combined Chart ────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">
          Income vs. Spend vs. Invested
        </h2>

        {/* Left Y-axis = dollar amounts; right Y-axis = savings rate % */}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="month"
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 50]}
              stroke="#334155"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => {
                if (name === 'Savings Rate %') return [`${v}%`, name]
                return [fmt(v), name]
              }}
              {...TOOLTIP_STYLE}
            />
            <Legend formatter={legendFormatter} />

            {/* Bars stack visually side-by-side (not stacked) so you can compare them */}
            <Bar yAxisId="left" dataKey="income"   name="Income"   fill="#34d399" />
            <Bar yAxisId="left" dataKey="spend"    name="Spending" fill="#f87171" />
            <Bar yAxisId="left" dataKey="invested" name="Invested" fill="#60a5fa" />

            {/* Savings rate as an overlay line on the right axis */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="savingsRate"
              name="Savings Rate %"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={{ fill: '#fbbf24', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Monthly Breakdown Table ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Monthly Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Month', 'Income', 'Spending', 'Invested', 'Savings Rate', 'Net Left'].map(
                  (h) => (
                    <th
                      key={h}
                      className={`pb-3 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider ${
                        h === 'Month' ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => (
                <tr
                  key={d.month}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3 pr-4 text-white font-semibold">{d.month}</td>
                  <td className="py-3 pr-4 text-green-400 text-right">{fmt(d.income)}</td>
                  <td className="py-3 pr-4 text-red-400 text-right">{fmt(d.spend)}</td>
                  <td className="py-3 pr-4 text-blue-400 text-right">{fmt(d.invested)}</td>
                  <td className="py-3 pr-4 text-yellow-400 text-right">{d.savingsRate}%</td>
                  <td
                    className={`py-3 text-right font-semibold ${
                      d.net >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {d.net >= 0 ? '+' : ''}{fmt(d.net)}
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
