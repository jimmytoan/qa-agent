import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunStatus(str, enum.Enum):
    queued = 'queued'
    running = 'running'
    passed = 'passed'
    failed = 'failed'
    canceled = 'canceled'


class ArtifactKind(str, enum.Enum):
    screenshot = 'screenshot'
    gif = 'gif'


class SuiteRunStatus(str, enum.Enum):
    queued = 'queued'
    running = 'running'
    passed = 'passed'
    failed = 'failed'
    canceled = 'canceled'


class ProductModel(Base):
    __tablename__ = 'products'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    suites: Mapped[list['SuiteModel']] = relationship('SuiteModel', back_populates='product', cascade='all, delete-orphan')


class SuiteModel(Base):
    __tablename__ = 'suites'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    product: Mapped[ProductModel] = relationship('ProductModel', back_populates='suites')
    tests: Mapped[list['TestCaseModel']] = relationship('TestCaseModel', back_populates='suite', cascade='all, delete-orphan')
    suite_runs: Mapped[list['SuiteRunModel']] = relationship('SuiteRunModel', back_populates='suite', cascade='all, delete-orphan')


class SuiteRunModel(Base):
    __tablename__ = 'suite_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    suite_id: Mapped[int] = mapped_column(ForeignKey('suites.id', ondelete='CASCADE'), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey('products.id', ondelete='SET NULL'), nullable=True)
    status: Mapped[SuiteRunStatus] = mapped_column(Enum(SuiteRunStatus), nullable=False, default=SuiteRunStatus.queued)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    suite: Mapped['SuiteModel'] = relationship('SuiteModel', back_populates='suite_runs')
    runs: Mapped[list['BrowserUseRunModel']] = relationship('BrowserUseRunModel', back_populates='suite_run')


class TestCaseModel(Base):
    __tablename__ = 'tests'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    suite_id: Mapped[int] = mapped_column(ForeignKey('suites.id', ondelete='CASCADE'), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    evaluation: Mapped[str] = mapped_column(Text, nullable=False)
    test_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    suite: Mapped[SuiteModel] = relationship('SuiteModel', back_populates='tests')
    steps: Mapped[list['TestStepModel']] = relationship('TestStepModel', back_populates='test', cascade='all, delete-orphan')


class TestStepModel(Base):
    __tablename__ = 'test_steps'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_id: Mapped[int] = mapped_column(ForeignKey('tests.id', ondelete='CASCADE'), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    test: Mapped[TestCaseModel] = relationship('TestCaseModel', back_populates='steps')


class BrowserUseRunModel(Base):
    __tablename__ = 'browser_use_runs'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), nullable=False, default=RunStatus.queued)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey('products.id', ondelete='SET NULL'), nullable=True)
    suite_id: Mapped[int | None] = mapped_column(ForeignKey('suites.id', ondelete='SET NULL'), nullable=True)
    test_id: Mapped[int | None] = mapped_column(ForeignKey('tests.id', ondelete='SET NULL'), nullable=True)
    suite_run_id: Mapped[int | None] = mapped_column(ForeignKey('suite_runs.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    artifacts: Mapped[list['RunArtifactModel']] = relationship(
        'RunArtifactModel', back_populates='run', cascade='all, delete-orphan'
    )
    suite_run: Mapped['SuiteRunModel | None'] = relationship('SuiteRunModel', back_populates='runs')


class RunArtifactModel(Base):
    __tablename__ = 'run_artifacts'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey('browser_use_runs.id', ondelete='CASCADE'), nullable=False)
    kind: Mapped[ArtifactKind] = mapped_column(Enum(ArtifactKind), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    run: Mapped[BrowserUseRunModel] = relationship('BrowserUseRunModel', back_populates='artifacts')
