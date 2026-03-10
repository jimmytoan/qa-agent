# Stage 1: frontend build
FROM node:24-alpine AS frontend-builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY frontend ./frontend
WORKDIR /app/frontend
RUN pnpm build

# Stage 2: backend deps
FROM python:3.13-slim AS backend-builder
WORKDIR /app
RUN pip install --no-cache-dir uv==0.9.18
COPY backend ./backend
WORKDIR /app/backend
RUN uv sync --locked --no-dev --no-default-groups

# Stage 3: runtime
FROM python:3.13-slim
WORKDIR /app
COPY --from=backend-builder /app/backend/.venv /app/backend/.venv
ENV PATH="/app/backend/.venv/bin:$PATH"
COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
ENV ENV=prod
ENV PYTHONUNBUFFERED=1

# Install Chromium and its system dependencies via Playwright
RUN /app/backend/.venv/bin/playwright install chromium --with-deps
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
WORKDIR /app/backend
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
