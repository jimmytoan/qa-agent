import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BrowserUseRunModel, RunArtifactModel, RunStatus
from ..schemas import BrowserUseRun, BrowserUseRunCreate, RunArtifact, RunReport
from ..services.runner import create_browser_use_run
from ..state import RUN_EVENTS, RUN_TASKS
from ..utils import utc_now

router = APIRouter(prefix='/api/browser-use/runs', tags=['runs'])


@router.post('', response_model=BrowserUseRun)
async def create_run_endpoint(payload: BrowserUseRunCreate, db: Session = Depends(get_db)) -> BrowserUseRun:
    run = await create_browser_use_run(payload=payload, db=db)
    return BrowserUseRun.model_validate(run)


@router.get('', response_model=list[BrowserUseRun])
def list_runs(
    product_id: int | None = Query(default=None),
    suite_id: int | None = Query(default=None),
    test_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[BrowserUseRunModel]:
    query = select(BrowserUseRunModel)
    if product_id is not None:
        query = query.where(BrowserUseRunModel.product_id == product_id)
    if suite_id is not None:
        query = query.where(BrowserUseRunModel.suite_id == suite_id)
    if test_id is not None:
        query = query.where(BrowserUseRunModel.test_id == test_id)
    return list(db.scalars(query.order_by(BrowserUseRunModel.created_at.desc())).all())


@router.get('/{run_id}', response_model=BrowserUseRun)
def get_run(run_id: str, db: Session = Depends(get_db)) -> BrowserUseRunModel:
    run = db.get(BrowserUseRunModel, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail='Run not found')
    return run


@router.post('/{run_id}/cancel', response_model=BrowserUseRun)
def cancel_run(run_id: str, db: Session = Depends(get_db)) -> BrowserUseRunModel:
    run = db.get(BrowserUseRunModel, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail='Run not found')

    if run.status in (RunStatus.passed, RunStatus.failed, RunStatus.canceled):
        return run

    task = RUN_TASKS.get(run_id)
    if task is not None:
        task.cancel()

    run.status = RunStatus.canceled
    run.finished_at = utc_now()
    run.updated_at = utc_now()
    db.commit()
    db.refresh(run)
    return run


@router.get('/{run_id}/stream')
async def stream_run_events(run_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    if db.get(BrowserUseRunModel, run_id) is None:
        raise HTTPException(status_code=404, detail='Run not found')

    async def event_generator():
        queue = RUN_EVENTS.get(run_id)
        if queue is None:
            # Run already finished — send a single done event from DB state
            run = db.get(BrowserUseRunModel, run_id)
            if run:
                payload = {'type': 'done', 'status': run.status.value,
                           'result': run.result, 'message': run.error}
                yield f'data: {json.dumps(payload)}\n\n'
            return

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                yield ': keep-alive\n\n'
                continue

            if event is None:
                break  # sentinel — run finished

            yield f'data: {json.dumps(event)}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


@router.get('/{run_id}/artifacts', response_model=list[RunArtifact])
def list_artifacts(run_id: str, db: Session = Depends(get_db)) -> list[RunArtifactModel]:
    if db.get(BrowserUseRunModel, run_id) is None:
        raise HTTPException(status_code=404, detail='Run not found')

    return list(
        db.scalars(
            select(RunArtifactModel).where(RunArtifactModel.run_id == run_id).order_by(RunArtifactModel.created_at.desc())
        ).all()
    )


# ── Reports (separate prefix but logically tied to runs) ─────────────────────

reports_router = APIRouter(prefix='/api/reports', tags=['reports'])


@reports_router.get('/runs/{run_id}', response_model=RunReport)
def get_run_report(run_id: str, db: Session = Depends(get_db)) -> RunReport:
    run = db.get(BrowserUseRunModel, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail='Run not found')

    artifacts = list_artifacts(run_id=run_id, db=db)
    return RunReport(
        run=BrowserUseRun.model_validate(run),
        artifacts=[RunArtifact.model_validate(a) for a in artifacts],
    )
