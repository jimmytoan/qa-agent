from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ArtifactKind, RunStatus, SuiteRunStatus


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Products ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str | None = None
    description: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None


class Product(ORMBase):
    id: int
    org_id: int
    name: str
    slug: str | None = None
    description: str | None = None
    created_at: datetime


# ── Suites ────────────────────────────────────────────────────────────────────

class SuiteCreate(BaseModel):
    product_id: int
    name: str = Field(min_length=1)
    description: str | None = None


class SuiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class Suite(ORMBase):
    id: int
    product_id: int
    name: str
    description: str | None = None
    created_at: datetime


# ── Suite export / import ─────────────────────────────────────────────────────

class TestStepInput(BaseModel):
    step_order: int = Field(gt=0)
    description: str = Field(min_length=1)


class SuiteExportTest(BaseModel):
    label: str
    evaluation: str
    steps: list[TestStepInput] = []


class SuiteExportPayload(BaseModel):
    name: str
    description: str | None = None
    tests: list[SuiteExportTest] = []


class SuiteImportPayload(BaseModel):
    product_id: int
    name: str
    description: str | None = None
    tests: list[SuiteExportTest] = []


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreate(BaseModel):
    suite_id: int
    label: str = Field(min_length=1)
    evaluation: str = Field(min_length=1)


class TestUpdate(BaseModel):
    label: str | None = None
    evaluation: str | None = None


class TestCase(ORMBase):
    id: int
    suite_id: int
    label: str
    evaluation: str
    created_at: datetime


class TestStep(ORMBase):
    id: int
    test_id: int
    step_order: int
    description: str


class TestCaseWithSteps(ORMBase):
    id: int
    suite_id: int
    label: str
    evaluation: str
    created_at: datetime
    steps: list[TestStep] = []


class ReplaceTestStepsPayload(BaseModel):
    steps: list[TestStepInput]


class ReorderTestsPayload(BaseModel):
    test_ids: list[int]


# ── Browser-use runs ──────────────────────────────────────────────────────────

class BrowserUseRunCreate(BaseModel):
    task: str = Field(default='')
    model: str = Field(default='gpt-5')
    product_id: int | None = None
    suite_id: int | None = None
    test_id: int | None = None


class BrowserUseRun(ORMBase):
    id: str
    status: RunStatus
    task: str
    model: str
    product_id: int | None = None
    suite_id: int | None = None
    test_id: int | None = None
    suite_run_id: int | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: str | None = None
    error: str | None = None


# ── Suite runs ────────────────────────────────────────────────────────────────

class SuiteRun(ORMBase):
    id: int
    suite_id: int
    product_id: int | None = None
    status: SuiteRunStatus
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None


class SuiteRunWithRuns(SuiteRun):
    runs: list[BrowserUseRun] = []


# ── Artifacts / reports ───────────────────────────────────────────────────────

class RunArtifact(ORMBase):
    id: int
    run_id: str
    kind: ArtifactKind
    url: str
    content_type: str | None = None
    size_bytes: int | None = None
    created_at: datetime


class RunReport(BaseModel):
    run: BrowserUseRun
    artifacts: list[RunArtifact]
