import { useEffect, useState } from 'react'
import { Package, Folder, FileCheck2, Play, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react'

import { listBrowserUseRuns, listProducts, listSuites, listTests, type BrowserUseRun } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

type Summary = {
  products: number
  suites: number
  tests: number
  totalRuns: number
}

type TodayMetrics = {
  runsToday: number
  failuresToday: number
  passedToday: number
  activeRuns: number
  passRate: number | null
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function computeTodayMetrics(runs: BrowserUseRun[]): TodayMetrics {
  const todayRuns = runs.filter((r) => isToday(r.created_at))
  const failuresToday = todayRuns.filter((r) => r.status === 'failed').length
  const passedToday = todayRuns.filter((r) => r.status === 'passed').length
  const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'queued').length
  const finished = failuresToday + passedToday
  const passRate = finished > 0 ? Math.round((passedToday / finished) * 100) : null
  return { runsToday: todayRuns.length, failuresToday, passedToday, activeRuns, passRate }
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ products: 0, suites: 0, tests: 0, totalRuns: 0 })
  const [today, setToday] = useState<TodayMetrics>({ runsToday: 0, failuresToday: 0, passedToday: 0, activeRuns: 0, passRate: null })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const [products, suites, tests, runs] = await Promise.allSettled([
        listProducts(),
        listSuites(),
        listTests(),
        listBrowserUseRuns(),
      ])

      const allRuns: BrowserUseRun[] = runs.status === 'fulfilled' ? runs.value : []

      setSummary({
        products: products.status === 'fulfilled' ? products.value.length : 0,
        suites: suites.status === 'fulfilled' ? suites.value.length : 0,
        tests: tests.status === 'fulfilled' ? tests.value.length : 0,
        totalRuns: allRuns.length,
      })

      setToday(computeTodayMetrics(allRuns))

      if ([products, suites, tests, runs].some((r) => r.status === 'rejected')) {
        setError('Some endpoints are unavailable. Data may be incomplete.')
      }
    }

    loadData()
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Test execution overview and metrics.</p>
      </div>

      {/* Catalog totals */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Catalog</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.products}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suites</CardTitle>
              <Folder className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.suites}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Test Cases</CardTitle>
              <FileCheck2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.tests}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">All-time Runs</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRuns}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Today's run metrics */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Runs Today</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{today.runsToday}</div>
              <p className="text-xs text-muted-foreground mt-1">{today.passedToday} passed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failures Today</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{today.failuresToday}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {today.runsToday > 0 ? `${Math.round((today.failuresToday / today.runsToday) * 100)}% of today's runs` : 'No runs today'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${today.passRate === null ? 'text-muted-foreground' : today.passRate >= 80 ? 'text-green-600' : today.passRate >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                {today.passRate === null ? '—' : `${today.passRate}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {today.passRate === null ? 'No completed runs' : 'of completed runs today'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${today.activeRuns > 0 ? 'text-blue-600' : ''}`}>
                {today.activeRuns}
              </div>
              <p className="text-xs text-muted-foreground mt-1">running or queued</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {error}
        </div>
      )}
    </div>
  )
}
