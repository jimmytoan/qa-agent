# QA Agent — Copilot Instructions

## Architecture Overview

QA Agent is an AI-powered E2E testing platform. Users define browser tests in natural language; an LLM-driven agent (via `browser-use`) executes them in a real browser and captures artifacts.

**Monorepo layout** (pnpm workspace, root `package.json` scripts orchestrate both halves):

- `backend/` — Python 3.13, FastAPI, SQLAlchemy 2.x (sync sessions), Alembic, PostgreSQL
- `frontend/` — React 19, TypeScript, Vite, Tailwind CSS 3, shadcn/ui (Radix primitives + CVA)

**Data hierarchy**: Product → Suite → TestCase → TestStep. Runs are tracked in `BrowserUseRunModel`; suite-level runs are grouped by `SuiteRunModel`.

**Browser execution**: Each test run creates a new `browser-use` `Agent` with its own `BrowserProfile`. Concurrency is throttled by `BROWSER_SEMAPHORE` (env `MAX_CONCURRENT_RUNS`, default 3). Suite runs fan out tests concurrently via `asyncio.gather`. Real-time progress is streamed to the frontend via SSE (`/api/browser-use/runs/{id}/stream`).

## Developer Workflow

```bash
# First-time setup
pnpm install:all          # pnpm install + cd backend && uv sync --all-extras

# Development (both servers)
pnpm dev                  # concurrently: backend on :8000, frontend Vite on :5173

# Individual servers
pnpm dev:backend          # uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pnpm dev:frontend         # vite dev on :5173

# Backend tests
pnpm test:backend         # cd backend && uv run pytest

# Build
pnpm build                # builds frontend only (backend is interpreted)
```

**Required env vars** (in `backend/.env`):
- `DATABASE_URL` — PostgreSQL connection string (required)
- At least one LLM key: `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`
- `BROWSER_HEADLESS` — `true`/`false` (default `false`)
- `MAX_CONCURRENT_RUNS` — concurrent browser limit (default `3`)
- `ENV` — `local`/`dev`/`prod`/`test` (default `local`; controls CORS and frontend serving mode)

## Backend Conventions

- **Package manager**: `uv` (not pip). Add deps with `uv add <package>`, run commands with `uv run <cmd>`.
- **ORM style**: SQLAlchemy 2.x declarative with `Mapped[]` / `mapped_column()`. All models in `backend/app/models.py` extend `Base` from `database.py`.
- **Schemas**: Pydantic v2 models in `backend/app/schemas.py`. Read schemas inherit `ORMBase` (`ConfigDict(from_attributes=True)`). Create/Update schemas inherit plain `BaseModel`.
- **Routers live in** `backend/app/routers/` — one file per resource (`products.py`, `suites.py`, `tests.py`, `runs.py`, `suite_runs.py`). All routes are prefixed with `/api/`.
- **DB sessions**: Sync `Session` via `Depends(get_db)` in routes. Background tasks open their own sessions via `SessionLocal()`.
- **Async pattern**: Route handlers that start background work create `asyncio.Task` entries stored in `state.py` dicts (`RUN_TASKS`, `SUITE_RUN_TASKS`). SSE events flow through `asyncio.Queue` in `RUN_EVENTS`.
- **Timestamps**: Always use `utc_now()` from `app/utils.py` (returns timezone-aware UTC).
- **LLM provider selection**: `_build_llm()` in `runner.py` routes by model name prefix: `gemini-*` → Google, `claude-*` → Anthropic, else → Azure OpenAI or OpenAI.

## Database & Migrations

- **PostgreSQL** with Alembic for migrations. Migration files in `backend/alembic/versions/`.
- **Naming convention**: `0001_description.py`, `0002_description.py`, etc. Use descriptive `revision` IDs matching the filename.
- **Enum types**: Created via raw SQL with `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` pattern for idempotency. Reference with `PGEnum(..., create_type=False)`.
- **Run migrations**: `cd backend && alembic upgrade head` (also runs automatically in Docker via `entrypoint.sh`).
- **Create new migration**: `cd backend && alembic revision -m "description"`, then manually set `revision = '000N_description'`.

## Frontend Conventions

- **UI components**: shadcn/ui pattern — primitives in `frontend/src/components/ui/` using Radix + CVA + `cn()` utility. Use existing components (`Badge`, `Button`, `Card`, `Input`, `Label`, `Table`) before creating new ones.
- **Path alias**: `@/` maps to `frontend/src/` (configured in `tsconfig.json` and `vite.config.ts`).
- **API client**: All backend calls go through typed functions in `frontend/src/lib/api.ts`. Uses `fetch` directly (no axios). Types mirror backend Pydantic schemas.
- **Pages**: One component per page in `frontend/src/pages/`. Routing via `react-router-dom` v7 in `App.tsx`.
- **Styling**: Tailwind utility classes. Dark mode supported via CSS variables. No CSS modules or styled-components.
- **Vite proxy**: In dev mode, `/api` and `/artifacts` requests are proxied to `:8000`. In prod, FastAPI serves the built frontend from `frontend/dist/`.

## Deployment

- **Docker**: Multi-stage build (`Dockerfile`). Stage 1 builds frontend with pnpm, Stage 2 installs backend deps with uv, Stage 3 copies both into `python:3.13-slim`. `entrypoint.sh` runs `alembic upgrade head` then starts uvicorn.
- **Artifacts**: Screenshots and GIFs are saved to `backend/artifacts/` and served via FastAPI's `StaticFiles` mount at `/artifacts`.

## Key Integration Points

- `backend/app/services/runner.py` — Core execution engine. `run_browser_use_task()` manages the full lifecycle: DB status updates → browser-use Agent creation → SSE event emission → artifact saving. `create_test_run()` builds task prompts from test steps.
- `backend/app/state.py` — In-memory state shared across the app: `RUN_TASKS`, `SUITE_RUN_TASKS`, `RUN_EVENTS`, `BROWSER_SEMAPHORE`.
- `backend/app/services/artifacts.py` — Saves screenshots (per-step from agent history) and GIFs (via `browser_use.agent.gif.create_history_gif`).
