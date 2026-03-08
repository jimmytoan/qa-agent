export const API_BASE_URL = ''

export type HealthResponse = {
  status: string
  service: string
}

export type BrowserUseRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'canceled'
export type SuiteRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'canceled'

export type Product = {
  id: number
  org_id?: number
  name: string
  slug?: string
  description?: string | null
  created_at?: string
}

export type Suite = {
  id: number
  product_id: number
  name: string
  description?: string | null
  created_at?: string
}

export type TestCase = {
  id: number
  suite_id: number
  label: string
  evaluation: string
  test_order: number
  created_at?: string
}

export type TestStep = {
  id?: number
  test_id?: number
  step_order: number
  description: string
}

export type BrowserUseRun = {
  id: string
  status: BrowserUseRunStatus
  task: string
  model: string
  product_id: number | null
  suite_id: number | null
  test_id: number | null
  suite_run_id: number | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  result: string | null
  error: string | null
}

export type SuiteRun = {
  id: number
  suite_id: number
  product_id: number | null
  status: SuiteRunStatus
  created_at: string
  started_at: string | null
  finished_at: string | null
  error: string | null
}

export type SuiteRunWithRuns = SuiteRun & {
  runs: BrowserUseRun[]
}

export type RunArtifact = {
  id: number
  run_id: string
  kind: 'screenshot' | 'gif'
  url: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
}

export type RunReport = {
  run: BrowserUseRun
  artifacts: RunArtifact[]
}

export type TestCaseWithSteps = TestCase & {
  steps: TestStep[]
}

export type SuiteExportTest = {
  label: string
  evaluation: string
  steps: TestStep[]
}

export type SuiteExportPayload = {
  name: string
  description?: string | null
  tests: SuiteExportTest[]
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }

  return (await res.json()) as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init)
  return parseJson<T>(res)
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health')
}

export async function createBrowserUseRun(payload: {
  task: string
  model: string
  product_id?: number
  suite_id?: number
  test_id?: number
}): Promise<BrowserUseRun> {
  return request<BrowserUseRun>('/api/browser-use/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getBrowserUseRun(runId: string): Promise<BrowserUseRun> {
  return request<BrowserUseRun>(`/api/browser-use/runs/${runId}`)
}

export async function listBrowserUseRuns(filters?: {
  product_id?: number
  suite_id?: number
  test_id?: number
}): Promise<BrowserUseRun[]> {
  const params = new URLSearchParams()
  if (filters?.product_id != null) params.set('product_id', String(filters.product_id))
  if (filters?.suite_id != null) params.set('suite_id', String(filters.suite_id))
  if (filters?.test_id != null) params.set('test_id', String(filters.test_id))

  const query = params.toString()
  return request<BrowserUseRun[]>(`/api/browser-use/runs${query ? `?${query}` : ''}`)
}

export async function runTestCase(testId: number, payload: { task: string; model: string }): Promise<BrowserUseRun> {
  return request<BrowserUseRun>(`/api/tests/${testId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function runSuite(suiteId: number, payload: { task: string; model: string }): Promise<SuiteRunWithRuns> {
  return request<SuiteRunWithRuns>(`/api/suites/${suiteId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function listProducts(): Promise<Product[]> {
  return request<Product[]>('/api/products')
}

export async function createProduct(payload: { name: string; slug?: string; description?: string }): Promise<Product> {
  return request<Product>('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateProduct(
  productId: number,
  payload: { name?: string; slug?: string; description?: string },
): Promise<Product> {
  return request<Product>(`/api/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteProduct(productId: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/products/${productId}`, {
    method: 'DELETE',
  })
}

export async function listSuites(productId?: number): Promise<Suite[]> {
  const query = productId != null ? `?product_id=${productId}` : ''
  return request<Suite[]>(`/api/suites${query}`)
}

export async function createSuite(payload: {
  product_id: number
  name: string
  description?: string
}): Promise<Suite> {
  return request<Suite>('/api/suites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateSuite(suiteId: number, payload: { name?: string; description?: string }): Promise<Suite> {
  return request<Suite>(`/api/suites/${suiteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteSuite(suiteId: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/suites/${suiteId}`, {
    method: 'DELETE',
  })
}

export async function listTests(suiteId?: number): Promise<TestCase[]> {
  const query = suiteId != null ? `?suite_id=${suiteId}` : ''
  return request<TestCase[]>(`/api/tests${query}`)
}

export async function createTest(payload: {
  suite_id: number
  label: string
  evaluation: string
}): Promise<TestCase> {
  return request<TestCase>('/api/tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateTest(testId: number, payload: { label?: string; evaluation?: string }): Promise<TestCase> {
  return request<TestCase>(`/api/tests/${testId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteTest(testId: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/tests/${testId}`, {
    method: 'DELETE',
  })
}

export async function listTestSteps(testId: number): Promise<TestStep[]> {
  return request<TestStep[]>(`/api/tests/${testId}/steps`)
}

export async function replaceTestSteps(testId: number, steps: TestStep[]): Promise<TestStep[]> {
  return request<TestStep[]>(`/api/tests/${testId}/steps`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps }),
  })
}

export async function cancelBrowserUseRun(runId: string): Promise<BrowserUseRun> {
  return request<BrowserUseRun>(`/api/browser-use/runs/${runId}/cancel`, {
    method: 'POST',
  })
}

export async function listSuiteRuns(filters?: { suite_id?: number; product_id?: number }): Promise<SuiteRun[]> {
  const params = new URLSearchParams()
  if (filters?.suite_id != null) params.set('suite_id', String(filters.suite_id))
  if (filters?.product_id != null) params.set('product_id', String(filters.product_id))
  const query = params.toString()
  return request<SuiteRun[]>(`/api/suite-runs${query ? `?${query}` : ''}`)
}

export async function getSuiteRun(suiteRunId: number): Promise<SuiteRunWithRuns> {
  return request<SuiteRunWithRuns>(`/api/suite-runs/${suiteRunId}`)
}

export async function listRunArtifacts(runId: string): Promise<RunArtifact[]> {
  return request<RunArtifact[]>(`/api/browser-use/runs/${runId}/artifacts`)
}

export async function getRunReport(runId: string): Promise<RunReport> {
  return request<RunReport>(`/api/reports/runs/${runId}`)
}

export async function exportSuite(suiteId: number): Promise<SuiteExportPayload> {
  return request<SuiteExportPayload>(`/api/suites/${suiteId}/export`)
}

export async function importSuite(payload: SuiteExportPayload & { product_id: number }): Promise<Suite> {
  return request<Suite>('/api/suites/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function duplicateTest(testId: number): Promise<TestCase> {
  return request<TestCase>(`/api/tests/${testId}/duplicate`, {
    method: 'POST',
  })
}

export async function reorderTests(suiteId: number, testIds: number[]): Promise<TestCase[]> {
  return request<TestCase[]>(`/api/suites/${suiteId}/reorder-tests`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test_ids: testIds }),
  })
}
