import { useEffect } from 'react'
import { X, Clock, XCircle, CheckCircle2, FileText } from 'lucide-react'
import { Badge } from './ui/badge'
import { RunArtifactViewer } from './RunArtifactViewer'
import type { BrowserUseRun, BrowserUseRunStatus, RunArtifact } from '../lib/api'

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

interface RunDetailModalProps {
  run: BrowserUseRun
  artifacts: RunArtifact[]
  onClose: () => void
  onCancel?: () => void
  /** Optional label to display next to Run ID (e.g. test name) */
  label?: string
  testName?: string
  suiteName?: string
  productName?: string
}

export function RunDetailModal({
  run,
  artifacts,
  onClose,
  onCancel,
  testName,
  suiteName,
  productName,
}: RunDetailModalProps) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const isActive = run.status === 'running' || run.status === 'queued'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-background rounded-xl shadow-2xl border overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">
                Run <span className="font-mono">{run.id.slice(0, 8)}</span>
              </span>
              <StatusBadge status={run.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate">{run.id}</p>
            {(testName || suiteName || productName) && (
              <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                {testName && <span><span className="font-medium text-foreground/70">Test:</span> {testName}</span>}
                {suiteName && <span><span className="font-medium text-foreground/70">Suite:</span> {suiteName}</span>}
                {productName && <span><span className="font-medium text-foreground/70">Product:</span> {productName}</span>}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Meta grid */}
          <div className="text-sm grid grid-cols-[90px_1fr] gap-y-2 bg-muted/30 rounded-lg p-4 border">
            <span className="text-muted-foreground font-medium">Model</span>
            <span>{run.model}</span>
            <span className="text-muted-foreground font-medium">Created</span>
            <span className="text-xs">{fmt(run.created_at)}</span>
            <span className="text-muted-foreground font-medium">Timing</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {fmt(run.started_at)} → {fmt(run.finished_at)}
            </span>
            {run.task && (
              <>
                <span className="text-muted-foreground font-medium">Task</span>
                <span className="text-xs whitespace-pre-wrap break-all">{run.task}</span>
              </>
            )}
          </div>

          {/* Error */}
          {run.error && (
            <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-lg border border-destructive/20 flex flex-col gap-1">
              <span className="font-semibold flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> Execution Error
              </span>
              <span className="font-mono text-xs whitespace-pre-wrap">{run.error}</span>
            </div>
          )}

          {/* Result */}
          {run.result && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Final Result
              </h3>
              <div className="bg-muted/30 rounded-lg border p-3">
                <pre className="text-xs whitespace-pre-wrap font-mono break-all text-muted-foreground">{run.result}</pre>
              </div>
            </div>
          )}

          {!run.error && !run.result && !isActive && (
            <p className="text-sm text-muted-foreground italic text-center py-4">No result available.</p>
          )}

          {isActive && (
            <p className="text-sm text-blue-600 italic text-center py-2 animate-pulse">Run in progress…</p>
          )}

          {/* Artifacts */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" /> Artifacts
            </h3>
            {artifacts.length === 0
              ? <p className="text-xs text-muted-foreground">No artifacts yet.</p>
              : <RunArtifactViewer artifacts={artifacts} />
            }
          </div>
        </div>

        {/* Footer */}
        {onCancel && isActive && (
          <div className="border-t px-6 py-3 flex justify-end gap-3 bg-muted/20">
            <button
              onClick={onCancel}
              className="text-sm text-destructive hover:underline"
            >
              Cancel Run
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
