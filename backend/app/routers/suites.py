from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ProductModel, SuiteModel, TestCaseModel, TestStepModel
from ..schemas import (
    ReorderTestsPayload,
    Suite,
    SuiteCreate,
    SuiteExportPayload,
    SuiteExportTest,
    SuiteImportPayload,
    SuiteUpdate,
    TestCase,
    TestStepInput,
)

router = APIRouter(prefix='/api/suites', tags=['suites'])


@router.get('', response_model=list[Suite])
def list_suites(product_id: int | None = Query(default=None), db: Session = Depends(get_db)) -> list[SuiteModel]:
    query = select(SuiteModel)
    if product_id is not None:
        query = query.where(SuiteModel.product_id == product_id)
    return list(db.scalars(query.order_by(SuiteModel.created_at.desc())).all())


@router.post('', response_model=Suite)
def create_suite(payload: SuiteCreate, db: Session = Depends(get_db)) -> SuiteModel:
    if db.get(ProductModel, payload.product_id) is None:
        raise HTTPException(status_code=404, detail='Product not found')

    suite = SuiteModel(product_id=payload.product_id, name=payload.name, description=payload.description)
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return suite


@router.get('/{suite_id}', response_model=Suite)
def get_suite(suite_id: int, db: Session = Depends(get_db)) -> SuiteModel:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')
    return suite


@router.patch('/{suite_id}', response_model=Suite)
def update_suite(suite_id: int, payload: SuiteUpdate, db: Session = Depends(get_db)) -> SuiteModel:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')

    if payload.name is not None:
        suite.name = payload.name
    if payload.description is not None:
        suite.description = payload.description

    db.commit()
    db.refresh(suite)
    return suite


@router.delete('/{suite_id}')
def delete_suite(suite_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')
    db.delete(suite)
    db.commit()
    return {'deleted': True}


@router.get('/{suite_id}/export', response_model=SuiteExportPayload)
def export_suite(suite_id: int, db: Session = Depends(get_db)) -> SuiteExportPayload:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')

    test_cases = list(
        db.scalars(select(TestCaseModel).where(TestCaseModel.suite_id == suite_id).order_by(TestCaseModel.id.asc())).all()
    )

    export_tests: list[SuiteExportTest] = []
    for tc in test_cases:
        steps = [
            TestStepInput(step_order=s.step_order, description=s.description)
            for s in db.scalars(
                select(TestStepModel).where(TestStepModel.test_id == tc.id).order_by(TestStepModel.step_order.asc())
            ).all()
        ]
        export_tests.append(SuiteExportTest(label=tc.label, evaluation=tc.evaluation, steps=steps))

    return SuiteExportPayload(name=suite.name, description=suite.description, tests=export_tests)


@router.post('/import', response_model=Suite)
def import_suite(payload: SuiteImportPayload, db: Session = Depends(get_db)) -> SuiteModel:
    if db.get(ProductModel, payload.product_id) is None:
        raise HTTPException(status_code=404, detail='Product not found')

    suite = SuiteModel(product_id=payload.product_id, name=payload.name, description=payload.description)
    db.add(suite)
    db.commit()
    db.refresh(suite)

    for tc_data in payload.tests:
        tc = TestCaseModel(suite_id=suite.id, label=tc_data.label, evaluation=tc_data.evaluation)
        db.add(tc)
        db.commit()
        db.refresh(tc)
        for step in tc_data.steps:
            db.add(TestStepModel(test_id=tc.id, step_order=step.step_order, description=step.description))
    db.commit()
    return suite


@router.put('/{suite_id}/reorder-tests', response_model=list[TestCase])
def reorder_tests(suite_id: int, payload: ReorderTestsPayload, db: Session = Depends(get_db)) -> list[TestCaseModel]:
    suite = db.get(SuiteModel, suite_id)
    if suite is None:
        raise HTTPException(status_code=404, detail='Suite not found')

    for order, test_id in enumerate(payload.test_ids):
        test = db.get(TestCaseModel, test_id)
        if test is not None and test.suite_id == suite_id:
            test.test_order = order

    db.commit()
    return list(
        db.scalars(
            select(TestCaseModel)
            .where(TestCaseModel.suite_id == suite_id)
            .order_by(TestCaseModel.test_order.asc(), TestCaseModel.created_at.desc())
        ).all()
    )
