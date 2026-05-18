// App — root layout: sidebar on the left, page content on the right
import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import NetWorth from './pages/NetWorth'
import Portfolio from './pages/Portfolio'
import Spending from './pages/Spending'
import CashFlow from './pages/CashFlow'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <HashRouter>
      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">

        {/* Sidebar — always visible on desktop, slide-in drawer on mobile */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Right side: mobile top bar + scrollable page content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Mobile top bar with hamburger button */}
          <header className="lg:hidden flex items-center gap-4 h-14 px-4 bg-slate-900 border-b border-slate-800 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-400 hover:text-white transition-colors text-xl"
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-white font-semibold text-sm">Finance Dashboard</span>
          </header>

          {/* Page content — scrolls independently from the sidebar */}
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <Routes>
              <Route path="/"           element={<Navigate to="/overview" replace />} />
              <Route path="/overview"   element={<Overview />} />
              <Route path="/net-worth"  element={<NetWorth />} />
              <Route path="/portfolio"  element={<Portfolio />} />
              <Route path="/spending"   element={<Spending />} />
              <Route path="/cash-flow"  element={<CashFlow />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
