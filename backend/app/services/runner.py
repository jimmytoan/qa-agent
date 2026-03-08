"""Core browser-use execution logic and run-creation helpers."""

import asyncio
import os
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BrowserUseRunModel, RunStatus, SuiteRunModel, SuiteRunStatus, TestCaseModel, TestStepModel, SuiteModel
from ..schemas import BrowserUseRunCreate
from ..state import BROWSER_SEMAPHORE, RUN_TASKS, SUITE_RUN_TASKS, RUN_EVENTS
from ..utils import utc_now
from .artifacts import save_gif_artifact, save_screenshot_artifact


def _build_llm(model_name: str) -> Any:
    """Return the appropriate LangChain chat model based on the model name.

    Provider selection logic:
    - ``gemini-*``  → Google Gemini via GOOGLE_API_KEY
    - ``claude-*``  → Anthropic via ANTHROPIC_API_KEY
    - everything else → Azure OpenAI (AZURE_OPENAI_API_KEY) or
                        standard OpenAI (OPENAI_API_KEY), whichever key is present.
    """
    model_lower = model_name.lower()

    if model_lower.startswith('gemini'):
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            raise RuntimeError('GOOGLE_API_KEY is required for Gemini models')
        return ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key)

    if model_lower.startswith('claude'):
        from langchain_anthropic import ChatAnthropic
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise RuntimeError('ANTHROPIC_API_KEY is required for Claude models')
        return ChatAnthropic(model=model_name, api_key=api_key)

    # Default: OpenAI-compatible models (gpt-*, o-series, custom Azure deployments, …)
    azure_api_key = os.getenv('AZURE_OPENAI_API_KEY')
    openai_api_key = os.getenv('OPENAI_API_KEY')

    if azure_api_key:
        from langchain_openai import AzureChatOpenAI
        azure_endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
        if not azure_endpoint:
            raise RuntimeError('AZURE_OPENAI_ENDPOINT is required when AZURE_OPENAI_API_KEY is set')
        api_version = os.getenv('AZURE_OPENAI_API_VERSION', '2024-12-01-preview')
        azure_deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME', model_name)
        return AzureChatOpenAI(
            model=model_name,
            azure_deployment=azure_deployment,
            azure_endpoint=azure_endpoint,
            api_key=azure_api_key,
            api_version=api_version,
        )

    if openai_api_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model_name, api_key=openai_api_key)

    raise RuntimeError(
        'No API key found for OpenAI/GPT models. '
        'Set AZURE_OPENAI_API_KEY (Azure OpenAI) or OPENAI_API_KEY (OpenAI).'
    )


async def run_browser_use_task(run_id: str) -> None:
    """Background task: executes a single browser-use run end-to-end."""
    from ..database import SessionLocal

    with SessionLocal() as db:
        run = db.get(BrowserUseRunModel, run_id)
        if run is None:
            return
        if run.status == RunStatus.canceled:
            return

        run.status = RunStatus.running
        run.started_at = utc_now()
        run.updated_at = utc_now()
        db.commit()

    try:
        from browser_use import Agent, BrowserProfile

        with SessionLocal() as db:
            current = db.get(BrowserUseRunModel, run_id)
            if current is None:
                return
            model_name = current.model
            task_text = current.task

        llm = _build_llm(model_name)

        headless = os.getenv('BROWSER_HEADLESS', 'false').lower() in ('1', 'true', 'yes')
        browser_profile = BrowserProfile(headless=headless)

        queue = RUN_EVENTS.get(run_id)

        async def on_step(state, output, step_num: int) -> None:
            if queue is None:
                return
            actions = []
            if output and output.action:
                for a in (output.action if isinstance(output.action, list) else [output.action]):
                    try:
                        actions.append(a.model_dump(exclude_none=True))
                    except Exception:
                        actions.append(str(a))
            await queue.put({
                'type': 'step',
                'step': step_num,
                'evaluation': getattr(output, 'evaluation_previous_goal', None) if output else None,
                'memory': getattr(output, 'memory', None) if output else None,
                'next_goal': getattr(output, 'next_goal', None) if output else None,
                'actions': actions,
                'screenshot': state.screenshot if state else None,
            })

        async with BROWSER_SEMAPHORE:
            agent = Agent(task=task_text, llm=llm, browser_profile=browser_profile,
                          register_new_step_callback=on_step)
            result = await agent.run()
        final_result = result.final_result() if hasattr(result, 'final_result') else str(result)

        with SessionLocal() as db:
            run = db.get(BrowserUseRunModel, run_id)
            if run is None:
                return
            if run.status == RunStatus.canceled:
                return

            run.status = RunStatus.passed
            run.result = str(final_result)
            run.finished_at = utc_now()
            run.updated_at = utc_now()

            save_screenshot_artifact(run_id=run_id, result=result, db=db)
            save_gif_artifact(run_id=run_id, task=task_text, result=result, db=db)
            db.commit()

        if queue is not None:
            await queue.put({'type': 'done', 'status': 'passed', 'result': str(final_result)})
            await queue.put(None)  # sentinel

    except Exception as exc:
        with SessionLocal() as db:
            run = db.get(BrowserUseRunModel, run_id)
            if run is None:
                return
            if run.status == RunStatus.canceled:
                return

            run.status = RunStatus.failed
            run.error = str(exc)
            run.finished_at = utc_now()
            run.updated_at = utc_now()
            db.commit()

        queue = RUN_EVENTS.get(run_id)
        if queue is not None:
            await queue.put({'type': 'error', 'status': 'failed', 'message': str(exc)})
            await queue.put(None)  # sentinel
    finally:
        RUN_TASKS.pop(run_id, None)
        q = RUN_EVENTS.pop(run_id, None)
        if q is not None:
            await q.put(None)  # ensure SSE is unblocked if not already closed


async def create_browser_use_run(payload: BrowserUseRunCreate, db: Session) -> BrowserUseRunModel:
    """Create a BrowserUseRun record and enqueue its background task."""
    run_id = str(uuid4())
    now = utc_now()
    run = BrowserUseRunModel(
        id=run_id,
        status=RunStatus.queued,
        task=payload.task,
        model=payload.model,
        product_id=payload.product_id,
        suite_id=payload.suite_id,
        test_id=payload.test_id,
        created_at=now,
        updated_at=now,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    RUN_EVENTS[run_id] = asyncio.Queue()
    RUN_TASKS[run_id] = asyncio.create_task(run_browser_use_task(run_id))
    return run


async def create_test_run(test_id: int, payload: BrowserUseRunCreate, db: Session) -> BrowserUseRunModel:
    """Build a task string from test steps and enqueue a browser-use run."""
    test_case = db.get(TestCaseModel, test_id)
    if test_case is None:
        raise ValueError(f'Test {test_id} not found')

    suite = db.get(SuiteModel, test_case.suite_id)
    if suite is None:
        raise ValueError(f'Suite {test_case.suite_id} not found')

    steps = list(
        db.scalars(
            select(TestStepModel)
            .where(TestStepModel.test_id == test_id)
            .order_by(TestStepModel.step_order.asc())
        ).all()
    )
    steps_block = '\n'.join(f"{s.step_order}. {s.description}" for s in steps)

    task_text = payload.task
    if steps_block:
        task_text = (
            f"Test Case: {test_case.label}\n"
            f"Steps:\n{steps_block}\n\n"
            f"Evaluation Criteria:\n{test_case.evaluation}"
        )

    run_payload = BrowserUseRunCreate(
        task=task_text,
        model=payload.model,
        product_id=suite.product_id,
        suite_id=suite.id,
        test_id=test_case.id,
    )
    return await create_browser_use_run(payload=run_payload, db=db)


async def finalize_suite_run(suite_run_id: int, run_ids: list[str]) -> None:
    """Background task: waits for all child runs then updates suite run status."""
    from ..database import SessionLocal

    tasks = [t for rid in run_ids if (t := RUN_TASKS.get(rid)) is not None]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

    with SessionLocal() as db:
        suite_run = db.get(SuiteRunModel, suite_run_id)
        if suite_run is None:
            return

        child_runs = list(
            db.scalars(
                select(BrowserUseRunModel).where(BrowserUseRunModel.suite_run_id == suite_run_id)
            ).all()
        )
        statuses = {r.status for r in child_runs}
        if RunStatus.failed in statuses or RunStatus.canceled in statuses:
            suite_run.status = SuiteRunStatus.failed
        else:
            suite_run.status = SuiteRunStatus.passed
        suite_run.finished_at = utc_now()
        db.commit()

    SUITE_RUN_TASKS.pop(suite_run_id, None)
