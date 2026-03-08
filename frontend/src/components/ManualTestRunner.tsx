import { useEffect, useRef, useState } from 'react'
import {
  Play, XCircle, AlertCircle, CheckCircle2,
  FileText, RotateCcw, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react'
import {
  API_BASE_URL,
  cancelBrowserUseRun,
  createBrowserUseRun,
  listRunArtifacts,
  type BrowserUseRun,
  type BrowserUseRunStatus,
  type RunArtifact,
} from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

const TERMINAL_STATUSES: BrowserUseRunStatus[] = ['passed', 'failed', 'canceled']

const AI_MODELS = [
  {
    group: 'OpenAI',
    models: [
      { value: 'gpt-5.4', label: 'GPT-5.4 (most capable)' },
      { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro (smarter / more precise)' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini (fast, cost-efficient)' },
      { value: 'gpt-5-nano', label: 'GPT-5 nano (fastest, cheapest)' },

    ],
  },
  {
    group: 'Azure OpenAI',
    models: [
      { value: 'gpt-5.4', label: 'GPT-5.4 (Azure deployment)' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini (Azure deployment)' },

    ],
  },
  {
    group: 'Anthropic',
    models: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (most intelligent)' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (speed + intelligence)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  {
    group: 'Google Gemini',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (advanced reasoning)' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (frontier performance)' },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview (fast & cheap)' },
    ],
  },
] as const

function StatusBadge({ status }: { status: BrowserUseRunStatus }) {
  const variantMap: Record<BrowserUseRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    queued: 'secondary', running: 'default', passed: 'outline', failed: 'destructive', canceled: 'secondary',
  }
  const classNameMap: Record<BrowserUseRunStatus, string> = {
    queued: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-transparent',
    running: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent',
    passed: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80',
    failed: '',
    canceled: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80 border-transparent',
  }
  return <Badge variant={variantMap[status]} className={`capitalize ${classNameMap[status]}`}>{status}</Badge>
}

type StepEvent = {
  step: number
  evaluation: string | null
  memory: string | null
  next_goal: string | null
  actions: Record<string, unknown>[]
  screenshot: string | null
}

type RunState = {
  run: BrowserUseRun
  steps: StepEvent[]
  liveScreenshot: string | null
  finalStatus: BrowserUseRunStatus | null
  finalResult: string | null
  finalError: string | null
  artifacts: RunArtifact[]
  streaming: boolean
}

function ActionPill({ action }: { action: Record<string, unknown> }) {
  const name = Object.keys(action)[0] ?? 'action'
  const params = action[name] as Record<string, unknown> | undefined
  const detail = params ? Object.entries(params).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(', ') : ''
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground border">
      {name}{detail ? ` · ${detail}` : ''}
    </span>
  )
}

function StepRow({ step, defaultOpen }: { step: StepEvent; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span className="font-semibold text-muted-foreground w-14 shrink-0">Step {step.step}</span>
        <span className="truncate text-foreground/80">{step.next_goal ?? step.memory ?? '—'}</span>
      </button>

      {open && (
        <div className="px-4 py-3 flex flex-col gap-3 text-sm border-t bg-background">
          {step.evaluation && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Evaluation</div>
              <div className="text-foreground/80">{step.evaluation}</div>
            </div>
          )}
          {step.memory && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Memory</div>
              <div className="text-foreground/80">{step.memory}</div>
            </div>
          )}
          {step.next_goal && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Next Goal</div>
              <div className="text-foreground/80">{step.next_goal}</div>
            </div>
          )}
          {step.actions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Actions</div>
              <div className="flex flex-wrap gap-1">
                {step.actions.map((a, i) => <ActionPill key={i} action={a} />)}
              </div>
            </div>
          )}
          {step.screenshot && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Screenshot</div>
              <img
                src={`data:image/png;base64,${step.screenshot}`}
                alt={`Step ${step.step} screenshot`}
                className="rounded-md border max-h-64 w-auto object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ManualTestRunner() {
  const [task, setTask] = useState('')
  const [model, setModel] = useState('gpt-5.4')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [runState, setRunState] = useState<RunState | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const isActive = runState?.streaming ?? false
  const isDone = runState && !runState.streaming

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [runState?.steps.length])

  useEffect(() => () => { esRef.current?.close() }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    let run: BrowserUseRun
    try {
      run = await createBrowserUseRun({ task, model })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to start run')
      setIsSubmitting(false)
      return
    }
    setIsSubmitting(false)

    setRunState({ run, steps: [], liveScreenshot: null, finalStatus: null, finalResult: null, finalError: null, artifacts: [], streaming: true })

    esRef.current?.close()
    const es = new EventSource(`${API_BASE_URL}/api/browser-use/runs/${run.id}/stream`)
    esRef.current = es

    es.onmessage = (ev) => {
      const event = JSON.parse(ev.data) as { type: string } & Record<string, unknown>

      if (event.type === 'step') {
        const s = event as unknown as StepEvent & { type: string }
        setRunState((prev) => prev ? { ...prev, steps: [...prev.steps, s], liveScreenshot: s.screenshot ?? prev.liveScreenshot } : prev)
      } else if (event.type === 'done' || event.type === 'error') {
        const status = (event.status as BrowserUseRunStatus) ?? (event.type === 'done' ? 'passed' : 'failed')
        setRunState((prev) => prev ? {
          ...prev,
          finalStatus: status,
          finalResult: (event.result as string) ?? null,
          finalError: (event.message as string) ?? null,
          streaming: false,
        } : prev)
        es.close()
        listRunArtifacts(run.id)
          .then((arts) => setRunState((prev) => prev ? { ...prev, artifacts: arts } : prev))
          .catch(() => {})
      }
    }

    es.onerror = () => {
      setRunState((prev) => prev ? { ...prev, streaming: false } : prev)
      es.close()
    }
  }

  async function onCancel() {
    if (!runState) return
    esRef.current?.close()
    try {
      await cancelBrowserUseRun(runState.run.id)
    } catch { /* ignore */ }
    setRunState((prev) => prev ? { ...prev, finalStatus: 'canceled', streaming: false } : prev)
  }

  function onReset() {
    esRef.current?.close()
    setRunState(null)
    setFormError(null)
  }

  const displayStatus: BrowserUseRunStatus | null = runState
    ? (runState.finalStatus ?? (runState.streaming ? 'running' : null))
    : null

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* ── Form ── */}
      <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-muted/30 rounded-xl border p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task" className="text-sm font-medium">Test task</label>
          <textarea
            id="task"
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g. Go to example.com and verify the page title contains 'Example Domain'"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            required
            disabled={isActive}
          />
          <p className="text-xs text-muted-foreground">Describe what the AI agent should do and verify.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="model" className="text-sm font-medium">Model</label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            disabled={isActive}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {AI_MODELS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.models.map((m) => (
                  <option key={`${group.group}-${m.value}`} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Azure OpenAI and OpenAI both use the same GPT model names. Provider is selected via env vars.</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          {!isActive && (
            <Button type="submit" disabled={isSubmitting || !task.trim()}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</> : <><Play className="w-4 h-4 mr-2" />Run Test</>}
            </Button>
          )}
          {isActive && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              <XCircle className="w-4 h-4 mr-2" />Cancel Run
            </Button>
          )}
          {isDone && (
            <Button type="button" variant="outline" onClick={onReset}>
              <RotateCcw className="w-4 h-4 mr-2" />Run another test
            </Button>
          )}
        </div>
      </form>

      {formError && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="w-4 h-4 shrink-0" />{formError}
        </div>
      )}

      {/* ── Live run panel ── */}
      {runState && (
        <div className="flex flex-col gap-5">
          {/* Status bar */}
          <div className="flex items-center gap-3 flex-wrap">
            {isActive && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            {displayStatus && <StatusBadge status={displayStatus} />}
            <span className="text-sm text-muted-foreground font-mono">{runState.run.id.slice(0, 8)}</span>
            {isActive && <span className="text-sm text-blue-600 animate-pulse">Agent running…</span>}
          </div>

          {/* Live screenshot */}
          {runState.liveScreenshot && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live view</div>
              <img
                src={`data:image/png;base64,${runState.liveScreenshot}`}
                alt="Live browser screenshot"
                className="rounded-xl border shadow-sm w-full object-contain max-h-80"
              />
            </div>
          )}

          {/* Step log */}
          {runState.steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Agent log — {runState.steps.length} step{runState.steps.length !== 1 ? 's' : ''}
              </div>
              <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                {runState.steps.map((step, i) => (
                  <StepRow key={step.step} step={step} defaultOpen={i === runState.steps.length - 1} />
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Final result */}
          {runState.finalResult && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Final Result
              </div>
              <div className="bg-muted/30 rounded-lg border p-3">
                <pre className="text-xs whitespace-pre-wrap font-mono break-all text-muted-foreground">{runState.finalResult}</pre>
              </div>
            </div>
          )}

          {/* Error */}
          {runState.finalError && (
            <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-lg border border-destructive/20 flex flex-col gap-1">
              <span className="font-semibold flex items-center gap-1.5"><XCircle className="w-4 h-4" /> Error</span>
              <span className="font-mono text-xs whitespace-pre-wrap">{runState.finalError}</span>
            </div>
          )}

          {/* Saved artifacts */}
          {runState.artifacts.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" /> Saved Artifacts
              </div>
              <div className="flex flex-wrap gap-3">
                {runState.artifacts.map((art) => (
                  <a key={art.id} href={`${API_BASE_URL}${art.url}`} target="_blank" rel="noopener noreferrer" className="group flex flex-col gap-1">
                    <img
                      src={`${API_BASE_URL}${art.url}`}
                      alt={art.kind}
                      className="rounded-lg border max-h-48 w-auto object-contain group-hover:opacity-90 transition-opacity"
                    />
                    <span className="text-xs text-muted-foreground capitalize text-center">{art.kind}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {runState.finalStatus === 'canceled' && !runState.finalError && (
            <p className="text-sm text-muted-foreground italic">Run was canceled.</p>
          )}
        </div>
      )}
    </div>
  )
}
