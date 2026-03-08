import { useState, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { importSuite, type SuiteExportPayload } from '../lib/api'
import { Button } from './ui/button'

export type ExcelRow = Record<string, string>

interface Props {
  open: boolean
  onClose: () => void
  headers: string[]
  rows: ExcelRow[]
  productId: number
  onSuccess: () => void
}

const UNSET = '__UNSET__'

export function ImportExcelDialog({ open, onClose, headers, rows, productId, onSuccess }: Props) {
  const [suiteCol, setSuiteCol] = useState(UNSET)
  const [testNameCol, setTestNameCol] = useState(UNSET)
  const [stepsCol, setStepsCol] = useState(UNSET)
  const [evalCol, setEvalCol] = useState(UNSET)

  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const canImport = suiteCol !== UNSET && testNameCol !== UNSET && stepsCol !== UNSET && evalCol !== UNSET

  // Build preview: first 5 rows for selected columns
  const previewRows = useMemo(() => rows.slice(0, 5), [rows])

  // Group rows into suites for the confirm step
  function buildPayloads(): Array<SuiteExportPayload & { product_id: number }> {
    const suiteMap = new Map<string, SuiteExportPayload & { product_id: number }>()

    for (const row of rows) {
      const suiteName = (row[suiteCol] ?? '').trim()
      const testName = (row[testNameCol] ?? '').trim()
      const stepsRaw = (row[stepsCol] ?? '').trim()
      const evaluation = (row[evalCol] ?? '').trim()

      if (!suiteName || !testName) continue

      if (!suiteMap.has(suiteName)) {
        suiteMap.set(suiteName, { name: suiteName, description: null, tests: [], product_id: productId })
      }

      const steps = stepsRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((description, i) => ({ step_order: i + 1, description }))

      suiteMap.get(suiteName)!.tests.push({ label: testName, evaluation, steps })
    }

    return Array.from(suiteMap.values())
  }

  async function onImport() {
    if (!canImport) return
    const payloads = buildPayloads()

    if (payloads.length === 0) {
      setErrors(['No valid rows found with the selected column mapping.'])
      return
    }

    setImporting(true)
    setErrors([])
    setProgress({ done: 0, total: payloads.length })

    const errs: string[] = []

    for (let i = 0; i < payloads.length; i++) {
      try {
        await importSuite(payloads[i])
      } catch (err) {
        errs.push(`Suite "${payloads[i].name}": ${err instanceof Error ? err.message : String(err)}`)
      }
      setProgress({ done: i + 1, total: payloads.length })
    }

    setImporting(false)
    setErrors(errs)
    setDone(true)

    if (errs.length === 0) {
      onSuccess()
    }
  }

  function handleClose() {
    // Reset state on close
    setSuiteCol(UNSET)
    setTestNameCol(UNSET)
    setStepsCol(UNSET)
    setEvalCol(UNSET)
    setImporting(false)
    setProgress(null)
    setErrors([])
    setDone(false)
    onClose()
  }

  if (!open) return null

  const selectCls =
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

  const activePreviewCols = [suiteCol, testNameCol, stepsCol, evalCol].filter((c) => c !== UNSET)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Import from Excel</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {rows.length} data row{rows.length !== 1 ? 's' : ''} detected · {headers.length} columns
            </p>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {!done ? (
            <>
              {/* Column mapping */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Map Columns</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Select which Excel column corresponds to each field. Steps support multi-line cells (Alt+Enter in Excel).
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Suite Name <span className="text-destructive">*</span>
                    </label>
                    <select className={selectCls} value={suiteCol} onChange={(e) => setSuiteCol(e.target.value)} disabled={importing}>
                      <option value={UNSET}>— select column —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Test Name <span className="text-destructive">*</span>
                    </label>
                    <select className={selectCls} value={testNameCol} onChange={(e) => setTestNameCol(e.target.value)} disabled={importing}>
                      <option value={UNSET}>— select column —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Test Steps <span className="text-destructive">*</span>
                    </label>
                    <select className={selectCls} value={stepsCol} onChange={(e) => setStepsCol(e.target.value)} disabled={importing}>
                      <option value={UNSET}>— select column —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Newline-separated within the cell</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Evaluation <span className="text-destructive">*</span>
                    </label>
                    <select className={selectCls} value={evalCol} onChange={(e) => setEvalCol(e.target.value)} disabled={importing}>
                      <option value={UNSET}>— select column —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Preview table */}
              {activePreviewCols.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          {activePreviewCols.map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                            {activePreviewCols.map((col) => (
                              <td key={col} className="px-3 py-2 max-w-[200px] align-top">
                                <span className="line-clamp-3 whitespace-pre-wrap break-words">{row[col] ?? ''}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Suite summary */}
              {canImport && (
                <div className="rounded-md bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
                  {(() => {
                    const payloads = buildPayloads()
                    const totalTests = payloads.reduce((s, p) => s + p.tests.length, 0)
                    return (
                      <p className="text-foreground">
                        Will import <span className="font-semibold text-primary">{payloads.length} suite{payloads.length !== 1 ? 's' : ''}</span> with{' '}
                        <span className="font-semibold text-primary">{totalTests} test case{totalTests !== 1 ? 's' : ''}</span> total.
                      </p>
                    )
                  })()}
                </div>
              )}

              {/* Progress */}
              {importing && progress && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Importing suite {progress.done} of {progress.total}…
                </div>
              )}
            </>
          ) : (
            /* Done state */
            <div className="flex flex-col gap-4">
              {errors.length === 0 ? (
                <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">Import completed successfully.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errors.length} error{errors.length !== 1 ? 's' : ''} occurred:
                  </div>
                  <ul className="text-xs text-destructive space-y-1 list-disc list-inside">
                    {errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                  {progress && progress.done - errors.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {progress.done - errors.length} suite{progress.done - errors.length !== 1 ? 's' : ''} imported successfully.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button onClick={onImport} disabled={!canImport || importing}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                'Import'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
