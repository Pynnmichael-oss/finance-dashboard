// Sidebar — left navigation panel, collapsible on mobile
import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/overview',  label: 'Overview',   icon: '▦' },
  { path: '/net-worth', label: 'Net Worth',  icon: '◈' },
  { path: '/portfolio', label: 'Portfolio',  icon: '◉' },
  { path: '/spending',  label: 'Spending',   icon: '⬡' },
  { path: '/cash-flow', label: 'Cash Flow',  icon: '◎' },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Dark overlay behind sidebar on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-30 flex flex-col w-64
        bg-slate-900 border-r border-slate-800
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-auto lg:z-auto
      `}>
        {/* Brand */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-800 flex-shrink-0">
          <div>
            <span className="text-white font-bold text-base tracking-tight">Finance</span>
            <span className="text-blue-400 font-bold text-base"> Dashboard</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-600 text-center">All data stored locally</p>
        </div>
      </aside>
    </>
  )
}
