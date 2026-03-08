import './styles.css'
import { Navigate, NavLink, Route, Routes, BrowserRouter } from 'react-router-dom'
import { LayoutDashboard, Package, Folder, FileCheck2, Play, FileText } from 'lucide-react'

import { DashboardPage } from './pages/DashboardPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReportsPage } from './pages/ReportsPage'
import { RunsPage } from './pages/RunsPage'
import { SuitesPage } from './pages/SuitesPage'
import { TestsPage } from './pages/TestsPage'

export function App() {
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4 mr-2" /> },
    { to: "/products", label: "Products", icon: <Package className="w-4 h-4 mr-2" /> },
    { to: "/suites", label: "Suites", icon: <Folder className="w-4 h-4 mr-2" /> },
    { to: "/tests", label: "Tests", icon: <FileCheck2 className="w-4 h-4 mr-2" /> },
    { to: "/runs", label: "Runs", icon: <Play className="w-4 h-4 mr-2" /> },
    { to: "/reports", label: "Reports", icon: <FileText className="w-4 h-4 mr-2" /> },
  ]

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-50/50 dark:bg-neutral-950 font-sans text-foreground">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
          <div className="container mx-auto max-w-screen-xl flex h-16 items-center px-4 md:px-8">
            <div className="mr-8 flex items-center space-x-2">
              <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-zinc-800 to-zinc-500 bg-clip-text text-transparent dark:from-zinc-100 dark:to-zinc-400">
                QA Agent
              </span>
            </div>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `transition-all hover:text-foreground/80 flex items-center px-3 py-2 rounded-md ${isActive ? 'bg-primary/5 text-primary' : 'text-muted-foreground'}`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="container mx-auto max-w-screen-xl py-8 px-4 md:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/suites" element={<SuitesPage />} />
            <Route path="/tests" element={<TestsPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
