from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import products, runs, suite_runs, suites, tests
from .services.artifacts import ARTIFACTS_DIR

app = FastAPI(title='QA Agent', version='0.1.0')

# Mount artifacts
app.mount('/artifacts', StaticFiles(directory=str(ARTIFACTS_DIR)), name='artifacts')

# CORS — only needed in local mode (Vite dev server is a different origin)
if settings.in_local_mode:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['http://localhost:5173'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

# API routers
app.include_router(products.router)
app.include_router(suites.router)
app.include_router(tests.router)
app.include_router(runs.router)
app.include_router(runs.reports_router)
app.include_router(suite_runs.router)


@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'backend'}


# ── Environment-aware frontend serving ──────────────────────────────────
VITE_LOCAL_SERVER = 'http://localhost:5173'

if settings.in_local_mode:
    # Local mode (ENV=local): proxy all non-API/non-docs/non-artifacts requests to the Vite dev server.
    # The following paths are handled by FastAPI directly and must NOT be forwarded:
    #   /api          → API routers
    #   /artifacts    → StaticFiles mount
    #   /docs         → Swagger UI
    #   /openapi.json → OpenAPI schema
    #   /redoc        → ReDoc UI
    @app.middleware('http')
    async def local_proxy(request: Request, call_next):
        if (
            request.url.path.startswith('/api')
            or request.url.path.startswith('/artifacts')
            or request.url.path.startswith('/docs')
            or request.url.path.startswith('/openapi.json')
            or request.url.path.startswith('/redoc')
        ):
            return await call_next(request)

        async with httpx.AsyncClient() as client:
            vite_url = f'{VITE_LOCAL_SERVER}{request.url.path}'
            if request.url.query:
                vite_url += f'?{request.url.query}'
            try:
                vite_resp = await client.request(
                    request.method,
                    vite_url,
                    headers=dict(request.headers),
                    content=await request.body(),
                )
                return Response(
                    content=vite_resp.content,
                    status_code=vite_resp.status_code,
                    headers=dict(vite_resp.headers),
                )
            except httpx.RequestError as e:
                return Response(
                    f'Vite dev server not running at {VITE_LOCAL_SERVER}: {str(e)}',
                    status_code=502,
                )

else:
    # Deployed: serve the pre-built frontend from frontend/dist
    # IMPORTANT: this path resolves from backend/app/main.py → repo root
    frontend_dist = Path(__file__).parent.parent.parent / 'frontend' / 'dist'

    # Only mount /assets if frontend has been built (safe for test/CI environments)
    assets_dir = frontend_dist / 'assets'
    if assets_dir.exists():
        app.mount('/assets', StaticFiles(directory=str(assets_dir)), name='frontend-assets')

    # SPA catch-all: must be registered AFTER all API routers and static mounts
    @app.get('/{full_path:path}', include_in_schema=False, response_model=None)
    async def serve_spa(full_path: str) -> FileResponse | JSONResponse:
        # Defensive guard: reject API paths that somehow fell through
        if full_path == 'api' or full_path.startswith('api/'):
            raise HTTPException(status_code=404, detail='Not found')
        # Defensive guard: /assets should be handled by StaticFiles mount above
        if full_path.startswith('assets/'):
            raise HTTPException(status_code=404, detail='Not found')
        # Fall back to index.html for all SPA client-side routes
        index_file = frontend_dist / 'index.html'
        if index_file.exists():
            return FileResponse(
                index_file,
                headers={
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            )
        return JSONResponse({'error': 'Frontend not built. Run: pnpm build'}, status_code=404)

