from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SuiteModel, TestCaseModel, TestStepModel
from ..schemas import (
    BrowserUseRun,
    BrowserUseRunCreate,
    ReplaceTestStepsPayload,
    TestCase,
    TestCreate,
    TestStep,
    TestUpdate,
)

from ..services.runner import create_test_run

router = APIRouter(prefix='/api/tests', tags=['tests'])


@router.get('', response_model=list[TestCase])
def list_tests(suite_id: int | None = Query(default=None), db: Session = Depends(get_db)) -> list[TestCaseModel]:
    query = select(TestCaseModel)
    if suite_id is not None:
        query = query.where(TestCaseModel.suite_id == suite_id)
    return list(db.scalars(query.order_by(TestCaseModel.test_order.asc(), TestCaseModel.created_at.desc())).all())


@router.post('', response_model=TestCase)
def create_test(payload: TestCreate, db: Session = Depends(get_db)) -> TestCaseModel:
    if db.get(SuiteModel, payload.suite_id) is None:
        raise HTTPException(status_code=404, detail='Suite not found')

    test_case = TestCaseModel(suite_id=payload.suite_id, label=payload.label, evaluation=payload.evaluation)
    db.add(test_case)
    db.commit()
    db.refresh(test_case)
    return test_case


@router.get('/{test_id}', response_model=TestCase)
def get_test(test_id: int, db: Session = Depends(get_db)) -> TestCaseModel:
    test_case = db.get(TestCaseModel, test_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail='Test not found')
    return test_case


@router.patch('/{test_id}', response_model=TestCase)
def update_test(test_id: int, payload: TestUpdate, db: Session = Depends(get_db)) -> TestCaseModel:
    test_case = db.get(TestCaseModel, test_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail='Test not found')

    if payload.label is not None:
        test_case.label = payload.label
    if payload.evaluation is not None:
        test_case.evaluation = payload.evaluation

    db.commit()
    db.refresh(test_case)
    return test_case


@router.delete('/{test_id}')
def delete_test(test_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    test_case = db.get(TestCaseModel, test_id)
    if test_case is None:
        raise HTTPException(status_code=404, detail='Test not found')
    db.delete(test_case)
    db.commit()
    return {'deleted': True}


@router.post('/{test_id}/duplicate', response_model=TestCase)
def duplicate_test(test_id: int, db: Session = Depends(get_db)) -> TestCaseModel:
    original = db.get(TestCaseModel, test_id)
    if original is None:
        raise HTTPException(status_code=404, detail='Test not found')

    new_test = TestCaseModel(
        suite_id=original.suite_id,
        label=f'{original.label} (copy)',
        evaluation=original.evaluation,
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)

    for step in db.scalars(
        select(TestStepModel).where(TestStepModel.test_id == test_id).order_by(TestStepModel.step_order.asc())
    ).all():
        db.add(TestStepModel(test_id=new_test.id, step_order=step.step_order, description=step.description))
    db.commit()
    return new_test


@router.get('/{test_id}/steps', response_model=list[TestStep])
def list_test_steps(test_id: int, db: Session = Depends(get_db)) -> list[TestStepModel]:
    if db.get(TestCaseModel, test_id) is None:
        raise HTTPException(status_code=404, detail='Test not found')

    return list(
        db.scalars(select(TestStepModel).where(TestStepModel.test_id == test_id).order_by(TestStepModel.step_order.asc())).all()
    )


@router.put('/{test_id}/steps', response_model=list[TestStep])
def replace_test_steps(test_id: int, payload: ReplaceTestStepsPayload, db: Session = Depends(get_db)) -> list[TestStepModel]:
    if db.get(TestCaseModel, test_id) is None:
        raise HTTPException(status_code=404, detail='Test not found')

    step_orders = [s.step_order for s in payload.steps]
    if len(step_orders) != len(set(step_orders)):
        raise HTTPException(status_code=400, detail='Duplicate step_order values are not allowed')

    db.query(TestStepModel).filter(TestStepModel.test_id == test_id).delete()
    for step in sorted(payload.steps, key=lambda s: s.step_order):
        db.add(TestStepModel(test_id=test_id, step_order=step.step_order, description=step.description))
    db.commit()

    return list_test_steps(test_id=test_id, db=db)


@router.post('/{test_id}/runs', response_model=BrowserUseRun)
async def create_test_run_endpoint(
    test_id: int, payload: BrowserUseRunCreate, db: Session = Depends(get_db)
) -> BrowserUseRun:
    try:
        run = await create_test_run(test_id=test_id, payload=payload, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return BrowserUseRun.model_validate(run)
