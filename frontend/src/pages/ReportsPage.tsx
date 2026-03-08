import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, FileText, AlertCircle, CalendarDays, TrendingUp, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

import {
  getRunReport,
  listBrowserUseRuns,
  listProducts,
  listSuites,
  listTests,
  type BrowserUseRun,
  type BrowserUseRunStatus,
  type Product,
  type RunArtifact,
  type Suite,
  type TestCase,
} from '../lib/api'

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { RunDetailModal } from '../components/RunDetailModal'

type StatusFilter = 'all' | BrowserUseRunStatus
type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom range…' },
]

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date()
  const todayStart = startOfDay(now)
  switch (preset) {
    case 'today':
      return { from: todayStart, to: now }
    case 'yesterday': {
      const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1)
      return { from: yStart, to: todayStart }
    }
    case 'this_week': {
      const wStart = new Date(todayStart); wStart.setDate(wStart.getDate() - wStart.getDay())
      return { from: wStart, to: now }
    }
    case 'last_week': {
      const thisWeekStart = new Date(todayStart); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
      const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7)
      return { from: lastWeekStart, to: thisWeekStart }
    }
    case 'this_month': {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: mStart, to: now }
    }
    default:
      return { from: null, to: null }
  }
}

const SELECT_CLS =
  'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

function StatusBadge({ status }: { status: BrowserUseRunStatus }) {
  const variantMap: Record<BrowserUseRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    queued: 'secondary',
    running: 'default',
    passed: 'outline',
    failed: 'destructive',
    canceled: 'secondary',
  }
  const classNameMap: Record<BrowserUseRunStatus, string> = {
    queued: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent',
    running: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent',
    passed: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80',
    failed: '',
    canceled: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent',
  }
  return (
    <Badge variant={variantMap[status]} className={`capitalize ${classNameMap[status]}`}>
      {status}
    </Badge>
  )
}

function fmt(dt: string | null | undefined) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export function ReportsPage() {
  const [runs, setRuns] = useState<BrowserUseRun[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [tests, setTests] = useState<TestCase[]>([])

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([])

  // filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [productFilter, setProductFilter] = useState<number | ''>('')
  const [suiteFilter, setSuiteFilter] = useState<number | ''>('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [dateFrom, setDateFrom] = useState('')   // YYYY-MM-DD (custom only)
  const [dateTo, setDateTo] = useState('')       // YYYY-MM-DD (custom only)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // lookup maps
  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products])
  const suiteMap = useMemo(() => Object.fromEntries(suites.map((s) => [s.id, s.name])), [suites])
  const testMap = useMemo(() => Object.fromEntries(tests.map((t) => [t.id, t.label])), [tests])

  // suites scoped to the selected product for the filter dropdown
  const filteredSuiteOptions = useMemo(
    () => (productFilter === '' ? suites : suites.filter((s) => s.product_id === productFilter)),
    [suites, productFilter],
  )

  async function refresh() {
    setLoading(true)
    try {
      const [nextRuns, nextProducts, nextSuites, nextTests] = await Promise.all([
        listBrowserUseRuns(),
        listProducts(),
        listSuites(),
        listTests(),
      ])
      setRuns(nextRuns)
      setProducts(nextProducts)
      setSuites(nextSuites)
      setTests(nextTests)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // auto-poll while any run is queued/running
  const hasActiveRuns = runs.some((r) => r.status === 'queued' || r.status === 'running')
  useEffect(() => {
    if (!hasActiveRuns) return
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [hasActiveRuns])

  // fetch artifacts whenever selected run changes OR its status transitions to finished
  const selectedRunStatus = runs.find((r) => r.id === selectedRunId)?.status
  useEffect(() => {
    if (!selectedRunId) { setArtifacts([]); return }
    getRunReport(selectedRunId)
      .then((r) => setArtifacts(r.artifacts))
      .catch(() => setArtifacts([]))
  }, [selectedRunId, selectedRunStatus])

  const visibleRuns = useMemo(() => {
    // resolve date boundaries once
    let rangeFrom: Date | null = null
    let rangeTo: Date | null = null
    if (datePreset === 'custom') {
      if (dateFrom) rangeFrom = new Date(dateFrom)
      if (dateTo) { rangeTo = new Date(dateTo); rangeTo.setHours(23, 59, 59, 999) }
    } else if (datePreset !== 'all') {
      ;({ from: rangeFrom, to: rangeTo } = getPresetRange(datePreset))
    }

    return runs.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (productFilter !== '' && r.product_id !== productFilter) return false
      if (suiteFilter !== '' && r.suite_id !== suiteFilter) return false
      if (rangeFrom || rangeTo) {
        const created = new Date(r.created_at)
        if (rangeFrom && created < rangeFrom) return false
        if (rangeTo && created > rangeTo) return false
      }
      return true
    })
  }, [runs, statusFilter, productFilter, suiteFilter, datePreset, dateFrom, dateTo])

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) ?? null, [runs, selectedRunId])

  // reset page when filters change
  useEffect(() => { setPage(1) }, [statusFilter, productFilter, suiteFilter, datePreset, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(visibleRuns.length / pageSize))
  const paginatedRuns = useMemo(
    () => visibleRuns.slice((page - 1) * pageSize, page * pageSize),
    [visibleRuns, page, pageSize],
  )

  const metrics = useMemo(() => {
    const total = visibleRuns.length
    const passed = visibleRuns.filter((r) => r.status === 'passed').length
    const failed = visibleRuns.filter((r) => r.status === 'failed').length
    const canceled = visibleRuns.filter((r) => r.status === 'canceled').length
    const active = visibleRuns.filter((r) => r.status === 'running' || r.status === 'queued').length
    const finished = passed + failed
    const passRate = finished > 0 ? Math.round((passed / finished) * 100) : null
    const durations = visibleRuns
      .filter((r) => r.started_at && r.finished_at)
      .map((r) => new Date(r.finished_at!).getTime() - new Date(r.started_at!).getTime())
    const avgDurationSec = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : null
    return { total, passed, failed, canceled, active, passRate, avgDurationSec }
  }, [visibleRuns])

  const STATUS_OPTIONS: StatusFilter[] = ['all', 'queued', 'running', 'passed', 'failed', 'canceled']

  return (
    <div className="flex flex-col gap-8 min-w-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports & History</h1>
          <p className="text-muted-foreground mt-2">All test run executions across every product, suite and test.</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select className={SELECT_CLS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Product</label>
          <select
            className={SELECT_CLS}
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value ? Number(e.target.value) : '')
              setSuiteFilter('')
            }}
          >
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Suite</label>
          <select
            className={SELECT_CLS}
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All suites</option>
            {filteredSuiteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* ── Date filter ── */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <CalendarDays className="w-3 h-3" /> Created
          </label>
          <select
            className={SELECT_CLS}
            value={datePreset}
            onChange={(e) => {
              setDatePreset(e.target.value as DatePreset)
              setDateFrom('')
              setDateTo('')
            }}
          >
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {datePreset === 'custom' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                className={SELECT_CLS + ' w-[148px]'}
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                className={SELECT_CLS + ' w-[148px]'}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </>
        )}

        {(statusFilter !== 'all' || productFilter !== '' || suiteFilter !== '' || datePreset !== 'all') && (
          <button
            className="mt-5 text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setStatusFilter('all'); setProductFilter(''); setSuiteFilter(''); setDatePreset('all'); setDateFrom(''); setDateTo('') }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Passed</CardTitle>
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-emerald-600">{metrics.passed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Failed</CardTitle>
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-destructive">{metrics.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pass Rate</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className={`text-2xl font-bold ${
              metrics.passRate === null ? 'text-muted-foreground' :
              metrics.passRate >= 80 ? 'text-emerald-600' :
              metrics.passRate >= 50 ? 'text-yellow-600' : 'text-destructive'
            }`}>
              {metrics.passRate === null ? '—' : `${metrics.passRate}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active</CardTitle>
            <Clock className="h-3.5 w-3.5 text-blue-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className={`text-2xl font-bold ${metrics.active > 0 ? 'text-blue-600' : ''}`}>{metrics.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Duration</CardTitle>
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold">
              {metrics.avgDurationSec === null ? '—' :
                metrics.avgDurationSec < 60 ? `${metrics.avgDurationSec}s` :
                `${Math.floor(metrics.avgDurationSec / 60)}m ${metrics.avgDurationSec % 60}s`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Table ── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">Run ID</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Suite</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="whitespace-nowrap">Created</TableHead>
                <TableHead className="whitespace-nowrap">Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRuns.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No runs found.
                  </TableCell>
                </TableRow>
              )}
              {paginatedRuns.map((run) => (
                <TableRow
                  key={run.id}
                  className={`cursor-pointer transition-colors ${selectedRunId === run.id ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <TableCell className="font-mono text-xs">{run.id.slice(0, 8)}</TableCell>
                  <TableCell><StatusBadge status={run.status} /></TableCell>
                  <TableCell className="text-sm">
                    {run.test_id ? (testMap[run.test_id] ?? `#${run.test_id}`) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.suite_id ? (suiteMap[run.suite_id] ?? `#${run.suite_id}`) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.product_id ? (productMap[run.product_id] ?? `#${run.product_id}`) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(run.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(run.finished_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <select
              className={SELECT_CLS + ' w-[70px]'}
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {visibleRuns.length === 0 ? '0 of 0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, visibleRuns.length)} of ${visibleRuns.length}`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Run detail modal ── */}
      {selectedRun && (
        <RunDetailModal
          run={selectedRun}
          artifacts={artifacts}
          onClose={() => setSelectedRunId(null)}
          testName={selectedRun.test_id ? (testMap[selectedRun.test_id] ?? `#${selectedRun.test_id}`) : undefined}
          suiteName={selectedRun.suite_id ? (suiteMap[selectedRun.suite_id] ?? `#${selectedRun.suite_id}`) : undefined}
          productName={selectedRun.product_id ? (productMap[selectedRun.product_id] ?? `#${selectedRun.product_id}`) : undefined}
        />
      )}
    </div>
  )
}
