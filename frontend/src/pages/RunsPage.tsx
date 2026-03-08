import { ManualTestRunner } from '../components/ManualTestRunner'

export function RunsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manual Test Run</h1>
        <p className="text-muted-foreground mt-2">
          Run a single test manually to try it out before adding it to a suite.
        </p>
      </div>

      <ManualTestRunner />
    </div>
  )
}
