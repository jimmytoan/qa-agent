import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BrowserUseRunModel, SuiteModel, SuiteRunModel, SuiteRunStatus, TestCaseModel
from ..schemas import BrowserUseRun, BrowserUseRunCreate, SuiteRun, SuiteRunWithRuns
from ..services.runner import create_test_run, finalize_suite_run
from ..state import SUITE_RUN_TASKS
from ..utils import utc_now

router = APIRouter(tags=['suite-runs'])


@router.post('/api/suites/{suite_id}/runs', response_model=SuiteRunWithRuns)
async def create_suite_runs(
    suite_id: int,
    payload: BrowserUseRunCreate,
    db: Session = Depends(get_db),
) -> SuiteRunWithRuns:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')

    test_cases = list(
        db.scalars(select(TestCaseModel).where(TestCaseModel.suite_id == suite_id).order_by(TestCaseModel.id.asc())).all()
    )
    if not test_cases:
        raise HTTPException(status_code=400, detail='Suite has no test cases')

    now = utc_now()
    suite_run = SuiteRunModel(
        suite_id=suite_id,
        product_id=suite.product_id,
        status=SuiteRunStatus.running,
        created_at=now,
        started_at=now,
    )
    db.add(suite_run)
    db.commit()
    db.refresh(suite_run)

    async def _start_one(tc: TestCaseModel) -> BrowserUseRunModel:
        run = await create_test_run(test_id=tc.id, payload=BrowserUseRunCreate(task=payload.task, model=payload.model), db=db)
        run.suite_run_id = suite_run.id
        db.commit()
        return run

    runs: list[BrowserUseRunModel] = list(await asyncio.gather(*[_start_one(tc) for tc in test_cases]))
    run_ids = [r.id for r in runs]

    SUITE_RUN_TASKS[suite_run.id] = asyncio.create_task(finalize_suite_run(suite_run.id, run_ids))

    return SuiteRunWithRuns(
        id=suite_run.id,
        suite_id=suite_run.suite_id,
        product_id=suite_run.product_id,
        status=suite_run.status,
        created_at=suite_run.created_at,
        started_at=suite_run.started_at,
        finished_at=suite_run.finished_at,
        error=suite_run.error,
        runs=[BrowserUseRun.model_validate(r) for r in runs],
    )


@router.get('/api/suite-runs', response_model=list[SuiteRun])
def list_suite_runs(
    suite_id: int | None = Query(default=None),
    product_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SuiteRunModel]:
    query = select(SuiteRunModel)
    if suite_id is not None:
        query = query.where(SuiteRunModel.suite_id == suite_id)
    if product_id is not None:
        query = query.where(SuiteRunModel.product_id == product_id)
    return list(db.scalars(query.order_by(SuiteRunModel.created_at.desc())).all())


@router.get('/api/suite-runs/{suite_run_id}', response_model=SuiteRunWithRuns)
def get_suite_run(suite_run_id: int, db: Session = Depends(get_db)) -> SuiteRunWithRuns:
    suite_run = db.get(SuiteRunModel, suite_run_id)
    if suite_run is None:
        raise HTTPException(status_code=404, detail='Suite run not found')

    runs = list(
        db.scalars(
            select(BrowserUseRunModel)
            .where(BrowserUseRunModel.suite_run_id == suite_run_id)
            .order_by(BrowserUseRunModel.created_at.asc())
        ).all()
    )
    return SuiteRunWithRuns(
        id=suite_run.id,
        suite_id=suite_run.suite_id,
        product_id=suite_run.product_id,
        status=suite_run.status,
        created_at=suite_run.created_at,
        started_at=suite_run.started_at,
        finished_at=suite_run.finished_at,
        error=suite_run.error,
        runs=[BrowserUseRun.model_validate(r) for r in runs],
    )
