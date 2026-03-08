import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Trash2, Edit, Download, Upload, Play, Loader2, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'

import { createSuite, deleteSuite, exportSuite, listProducts, listSuites, runSuite, type Product, type Suite, type SuiteRunWithRuns, updateSuite } from '../lib/api'
import { ImportExcelDialog, type ExcelRow } from '../components/ImportExcelDialog'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const SELECT_CLS = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
const TEXTAREA_CLS = 'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const AI_MODELS = [
  { group: 'OpenAI', models: [
    { value: 'gpt-5.4', label: 'GPT-5.4 (most capable)' },
    { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro (smarter / more precise)' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini (fast, cost-efficient)' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano (fastest, cheapest)' },

  ]},
  { group: 'Azure OpenAI', models: [
    { value: 'gpt-5.4', label: 'GPT-5.4 (Azure deployment)' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini (Azure deployment)' },

  ]},
  { group: 'Anthropic', models: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (most intelligent)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (speed + intelligence)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  ]},
  { group: 'Google Gemini', models: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (advanced reasoning)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (frontier performance)' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview (fast & cheap)' },
  ]},
] as const

type ModalMode = 'create' | 'edit'

export function SuitesPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [searchParams] = useSearchParams()
  const [productFilter, setProductFilter] = useState<number | ''>(() => {
    const fromUrl = searchParams.get('product_id')
    return fromUrl ? Number(fromUrl) : ''
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [runTarget, setRunTarget] = useState<{ suiteId: number; name: string } | null>(null)
  const [runModel, setRunModel] = useState('gpt-5.4')
  const [runPending, setRunPending] = useState(false)
  const [runResult, setRunResult] = useState<SuiteRunWithRuns | null>(null)

  const [excelDialogOpen, setExcelDialogOpen] = useState(false)
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([])
  const [importProductId, setImportProductId] = useState<number | ''>('')
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingSuite, setEditingSuite] = useState<Suite | null>(null)
  const [mProductId, setMProductId] = useState<number | ''>('')
  const [mName, setMName] = useState('')
  const [mDescription, setMDescription] = useState('')

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products])

  const visibleSuites = useMemo(
    () => (productFilter === '' ? suites : suites.filter((s) => s.product_id === productFilter)),
    [suites, productFilter],
  )

  async function refresh() {
    setLoading(true)
    try {
      const [nextProducts, nextSuites] = await Promise.all([listProducts(), listSuites()])
      setProducts(nextProducts)
      setSuites(nextSuites)
      setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load suites') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  function openCreate() {
    setModalMode('create'); setEditingSuite(null)
    setMProductId(productFilter !== '' ? productFilter : '')
    setMName(''); setMDescription('')
    setModalOpen(true)
  }

  function openEdit(suite: Suite) {
    setModalMode('edit'); setEditingSuite(suite)
    setMProductId(suite.product_id); setMName(suite.name); setMDescription(suite.description ?? '')
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditingSuite(null) }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mProductId === '') { setError('Select a product.'); return }
    try {
      if (modalMode === 'create')
        await createSuite({ product_id: mProductId as number, name: mName, description: mDescription || undefined })
      else if (editingSuite)
        await updateSuite(editingSuite.id, { name: mName, description: mDescription || undefined })
      closeModal(); await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save suite') }
  }

  async function onDelete(suiteId: number) {
    if (!window.confirm('Delete this suite and all associated tests?')) return
    try { await deleteSuite(suiteId); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete suite') }
  }

  async function onExport(suite: Suite) {
    try {
      const data = await exportSuite(suite.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${suite.name.replace(/\s+/g, '-')}.json`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to export suite') }
  }

  function onImportClick() {
    if (productFilter !== '') {
      setImportProductId(productFilter as number)
      fileInputRef.current?.click()
    } else {
      setImportProductId('')
      setImportPickerOpen(true)
    }
  }

  function onImportProductConfirm() {
    if (importProductId === '') return
    setImportPickerOpen(false)
    fileInputRef.current?.click()
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || importProductId === '') return
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, cellNF: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '', raw: false })
      if (rawRows.length === 0) { setError('The Excel file appears to be empty.'); return }
      setExcelHeaders(Object.keys(rawRows[0])); setExcelRows(rawRows); setExcelDialogOpen(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to read Excel file') }
    finally { e.target.value = '' }
  }

  async function onRunSuite(suite: Suite) {
    setRunTarget({ suiteId: suite.id, name: suite.name }); setRunResult(null)
  }

  async function onStartRun() {
    if (!runTarget) return
    setRunPending(true); setRunResult(null)
    try {
      const result = await runSuite(runTarget.suiteId, { task: '', model: runModel })
      setRunResult(result)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to start suite run') }
    finally { setRunPending(false) }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Test Suites</h1>
          <p className="text-muted-foreground mt-2">Manage groups of tests efficiently.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onImportClick}>
            <Upload className="w-4 h-4 mr-2" />
            Import Excel
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileSelected} />
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Suite
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {runTarget && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Run suite: <span className="text-primary">{runTarget.name}</span></p>
            <button className="text-muted-foreground hover:text-foreground text-xs" onClick={() => { setRunTarget(null); setRunResult(null) }}>✕ Close</button>
          </div>
          {!runResult ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-muted-foreground">Model</label>
                <select className={SELECT_CLS} value={runModel} onChange={(e) => setRunModel(e.target.value)}>
                  {AI_MODELS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.models.map((m) => (
                        <option key={`${group.group}-${m.value}`} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                onClick={onStartRun}
                disabled={runPending || !runModel.trim()}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              >
                {runPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {runPending ? 'Starting…' : 'Start Run'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Suite run #{runResult.id} started — {runResult.runs.length} test(s) queued.
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Product</label>
          <select
            className={SELECT_CLS}
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base">
            {visibleSuites.length} suite{visibleSuites.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSuites.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No suites found.'}
                    </TableCell>
                  </TableRow>
                )}
                {visibleSuites.map((suite) => (
                  <TableRow key={suite.id}>
                    <TableCell className="text-muted-foreground">{suite.id}</TableCell>
                    <TableCell>
                      <button
                        className="font-semibold text-primary hover:underline flex items-center gap-1 text-left"
                        onClick={() => navigate(`/tests?suite_id=${suite.id}&product_id=${suite.product_id}`)}
                      >
                        {suite.name}
                        <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{productMap[suite.product_id] ?? suite.product_id}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[300px] truncate" title={suite.description ?? ''}>
                      {suite.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => onRunSuite(suite)} title="Run Suite">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(suite)} title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onExport(suite)} title="Export">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => onDelete(suite.id)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md bg-background rounded-xl shadow-2xl border p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold">{modalMode === 'create' ? 'Create Suite' : 'Edit Suite'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {modalMode === 'create' ? 'Add a new test suite.' : 'Update the suite details.'}
              </p>
            </div>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              {modalMode === 'create' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Product <span className="text-destructive">*</span></label>
                  <select
                    className={`${SELECT_CLS} w-full`}
                    value={mProductId}
                    onChange={(e) => setMProductId(e.target.value ? Number(e.target.value) : '')}
                    required
                  >
                    <option value="">Select a product…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                <Input placeholder="Suite name" value={mName} onChange={(e) => setMName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Description <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <textarea
                  className={TEXTAREA_CLS}
                  placeholder="Short description"
                  rows={3}
                  value={mDescription}
                  onChange={(e) => setMDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                <Button type="submit">
                  {modalMode === 'create' ? <><Plus className="w-4 h-4 mr-2" />Create Suite</> : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setImportPickerOpen(false)}>
          <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Choose Product for Import</h3>
            <p className="text-sm text-muted-foreground">Select which product the imported suites belong to.</p>
            <select
              className={SELECT_CLS + ' w-full'}
              value={importProductId}
              onChange={(e) => setImportProductId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportPickerOpen(false)}>Cancel</Button>
              <Button onClick={onImportProductConfirm} disabled={importProductId === ''}>Continue</Button>
            </div>
          </div>
        </div>
      )}

      {excelDialogOpen && importProductId !== '' && (
        <ImportExcelDialog
          open={excelDialogOpen}
          onClose={() => setExcelDialogOpen(false)}
          headers={excelHeaders}
          rows={excelRows}
          productId={importProductId as number}
          onSuccess={() => { setExcelDialogOpen(false); refresh() }}
        />
      )}
    </div>
  )
}
