// StatCard — reusable card for displaying a single key metric
// change > 0 = shown in green, change < 0 = shown in red
export default function StatCard({ title, value, change, changeLabel, subtext, icon }) {
  const hasChange = change !== undefined && change !== null
  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
        {icon && <span className="text-lg opacity-60">{icon}</span>}
      </div>

      <p className="text-2xl font-bold text-white mb-1">{value}</p>

      {hasChange && (
        <p className={`text-sm font-medium ${isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-400'}`}>
          {isPositive ? '▲' : isNegative ? '▼' : '—'}{' '}
          {Math.abs(change).toFixed(1)}%
          {changeLabel && (
            <span className="text-slate-500 font-normal ml-1">{changeLabel}</span>
          )}
        </p>
      )}

      {subtext && (
        <p className="text-xs text-slate-500 mt-1">{subtext}</p>
      )}
    </div>
  )
}
