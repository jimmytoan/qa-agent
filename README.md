# QA Agent

<p align="center">
  <strong>Run end-to-end browser tests using natural language.</strong><br />
  No Selenium scripts. No brittle Playwright selectors. Just describe the test.
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <img alt="FastAPI" src="https://img.shields.io/badge/backend-FastAPI-009688" />
  <img alt="React 19" src="https://img.shields.io/badge/frontend-React%2019-61DAFB" />
  <img alt="browser-use" src="https://img.shields.io/badge/agent-browser--use-orange" />
  <img alt="LangChain" src="https://img.shields.io/badge/LLM-LangChain-1C3C3C" />
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/jimmytoan/qa-agent?style=flat" />
</p>

QA Agent is an **AI-powered E2E testing platform** for product, QA, and engineering teams.
It lets you define browser tests in natural language, execute them with an LLM-driven browser agent, and inspect screenshots, GIFs, and run history when something fails.

It supports **Azure OpenAI, OpenAI, Anthropic Claude, and Google Gemini**.

---

## Why QA Agent?

Traditional E2E automation usually means:

- writing automation scripts
- maintaining brittle selectors
- updating tests whenever the UI changes

QA Agent replaces that workflow with:

- **natural language test authoring**
- **real browser execution**
- **live streaming progress**
- **screenshots + GIF artifacts**
- **run reports and history**

---

## What a test looks like

```text
Test: User can log in

Steps:
1. Go to https://example.com
2. Click the login button
3. Enter email test@example.com
4. Enter password
5. Submit the form

Evaluation:
The user dashboard is visible.
```

The agent opens a real browser, performs the flow, evaluates the result, and stores artifacts for review.

---

## Key Features

### Natural Language Test Authoring
Create tests with plain-language steps and evaluation criteria.

### Real Browser Execution
Runs in a real browser using **browser-use**.

### Real-Time Streaming
Watch each run live through the **SSE event stream**.

### Products, Suites, and Tests
Organize test coverage by product and suite.

### Artifacts
Every run can capture:

- screenshots
- step-by-step execution logs
- GIF recordings

### Run Reports and History
Track:

- pass / fail status
- execution details
- error context
- linked artifacts

### Import / Export
Import suites from Excel and export suite definitions.

### Multi-Provider LLM Support
Use the provider that fits your workflow:

- Azure OpenAI
- OpenAI
- Anthropic Claude
- Google Gemini

---

## Example Run

```text
Run Status: running

Step 1
Navigate to homepage

Step 2
Click login button

Step 3
Enter credentials

Step 4
Verify dashboard is visible

Result: PASSED

Artifacts generated:
- screenshots
- GIF recording
- step evaluation logs
```

---

## Architecture

```text
React + Vite frontend
        |
        | REST + SSE
        v
FastAPI backend
        |
        | run orchestration
        v
browser-use + LangChain chat model
        |
        v
real browser automation

PostgreSQL
run history + artifacts metadata
```

---

## Supported Providers

QA Agent chooses the provider automatically from the selected model name:

- `gemini-*` → Google Gemini via `GOOGLE_API_KEY`
- `claude-*` → Anthropic via `ANTHROPIC_API_KEY`
- everything else → Azure OpenAI if `AZURE_OPENAI_API_KEY` is set, otherwise OpenAI via `OPENAI_API_KEY`

Example models already supported in the UI:

- **OpenAI**: `gpt-5.4`, `gpt-5-mini`, `gpt-4.1`, `gpt-4o`
- **Anthropic**: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- **Gemini**: `gemini-3.1-pro-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`
- **Azure OpenAI**: any deployment mapped through `AZURE_OPENAI_DEPLOYMENT_NAME` or matching the model name

See [backend/.env.example](backend/.env.example) for the full environment template.

---

## Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL

### Agent Execution
- browser-use
- LangChain provider adapters
- Azure OpenAI / OpenAI / Anthropic / Gemini

### Frontend
- React 19
- Vite 6
- TypeScript
- Tailwind CSS
- shadcn/ui

### Infrastructure
- Docker
- pnpm workspaces
- uv

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/jimmytoan/qa-agent.git
cd qa-agent
```

### 2. Install dependencies

```bash
pnpm install:all
```

Prerequisites:

- Node.js 18+
- pnpm
- Python 3.12+
- uv
- PostgreSQL 15+

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

At minimum, set:

```bash
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/qa_agent

# choose one or more providers
OPENAI_API_KEY=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
```

### 4. Run database migrations

```bash
cd backend
uv run alembic upgrade head
cd ..
```

### 5. Start the app in development

```bash
pnpm dev
```

Open:

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

In local mode, the Vite dev server proxies API and artifact requests to the backend.

---

## Run with Docker

```bash
docker build -t qa-agent .

docker run --rm -p 8000:8000 \
  -e DATABASE_URL=postgresql+psycopg://user:password@host:5432/qa_agent \
  -e OPENAI_API_KEY=your_key_here \
  qa-agent
```

The container:

- runs Alembic migrations on startup
- serves the backend API
- serves the built frontend on port `8000`

---

## API Examples

### Create a browser run

```http
POST /api/browser-use/runs
```

Response:

```json
{
  "id": "...",
  "status": "queued"
}
```

### Stream progress

```http
GET /api/browser-use/runs/{run_id}/stream
```

### Useful endpoints

- `GET /api/health`
- `POST /api/tests/{test_id}/runs`
- `POST /api/suites/{suite_id}/runs`
- `GET /api/reports/runs/{run_id}`
- `GET /api/suites/{suite_id}/export`
- `POST /api/suites/import`

---

## Documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/features-and-api.md](docs/features-and-api.md)
- [docs/db-schema.md](docs/db-schema.md)
- [docs/monorepo-setup.md](docs/monorepo-setup.md)
- [docs/prd.md](docs/prd.md)

---

## Roadmap

Planned improvements:

- scheduled runs
- Slack / Jira notifications
- webhooks
- API tokens and auth
- object storage for artifacts
- CI integrations
- richer evaluation strategies

---

## Why Open Source?

AI agents are changing how QA gets done.

We believe testing should be:

- accessible to product teams
- easier to debug
- faster to write

Open sourcing QA Agent makes it easier for teams to experiment with **AI-native testing workflows** and adapt the stack to their own environments.

---

## Contributing

PRs are welcome.

High-impact areas for contribution:

- new evaluation strategies
- additional model/provider support
- CI and notification integrations
- artifact storage backends
- reporting UX improvements

---

## License

This project is licensed under the **GNU Affero General Public License v3.0**.
See [LICENSE](LICENSE) for details.

---

## Support the Project

If QA Agent is useful to your team, give it a ⭐

It helps the project grow and makes the repo easier to discover.
