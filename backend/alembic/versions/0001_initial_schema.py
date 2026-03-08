"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-02-25 00:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM as PGEnum

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types idempotently via raw SQL (IF NOT EXISTS via exception handling)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE run_status AS ENUM ('queued', 'running', 'passed', 'failed', 'canceled');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE suite_run_status AS ENUM ('queued', 'running', 'passed', 'failed', 'canceled');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE artifact_kind AS ENUM ('screenshot', 'gif');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)

    # Column type references — create_type=False so SQLAlchemy never emits CREATE TYPE
    run_status_col = PGEnum('queued', 'running', 'passed', 'failed', 'canceled', name='run_status', create_type=False)
    suite_run_status_col = PGEnum('queued', 'running', 'passed', 'failed', 'canceled', name='suite_run_status', create_type=False)
    artifact_kind_col = PGEnum('screenshot', 'gif', name='artifact_kind', create_type=False)

    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )

    op.create_table(
        'suites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'tests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('suite_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('evaluation', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['suite_id'], ['suites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'test_steps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('test_id', sa.Integer(), nullable=False),
        sa.Column('step_order', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['test_id'], ['tests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_unique_constraint('uq_test_steps_test_id_step_order', 'test_steps', ['test_id', 'step_order'])

    op.create_table(
        'suite_runs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('suite_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('status', suite_run_status_col, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['suite_id'], ['suites.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_suite_runs_suite_id', 'suite_runs', ['suite_id'])
    op.create_index('ix_suite_runs_product_id', 'suite_runs', ['product_id'])
    op.create_index('ix_suite_runs_status', 'suite_runs', ['status'])

    op.create_table(
        'browser_use_runs',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('status', run_status_col, nullable=False),
        sa.Column('task', sa.Text(), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=False, server_default='gpt-5'),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('suite_id', sa.Integer(), nullable=True),
        sa.Column('test_id', sa.Integer(), nullable=True),
        sa.Column('suite_run_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['suite_id'], ['suites.id']),
        sa.ForeignKeyConstraint(['test_id'], ['tests.id']),
        sa.ForeignKeyConstraint(['suite_run_id'], ['suite_runs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_browser_use_runs_product_id', 'browser_use_runs', ['product_id'])
    op.create_index('ix_browser_use_runs_suite_id', 'browser_use_runs', ['suite_id'])
    op.create_index('ix_browser_use_runs_test_id', 'browser_use_runs', ['test_id'])
    op.create_index('ix_browser_use_runs_suite_run_id', 'browser_use_runs', ['suite_run_id'])

    op.create_table(
        'run_artifacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('run_id', sa.String(length=64), nullable=False),
        sa.Column('kind', artifact_kind_col, nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['run_id'], ['browser_use_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('run_artifacts')

    op.drop_index('ix_browser_use_runs_suite_run_id', table_name='browser_use_runs')
    op.drop_index('ix_browser_use_runs_test_id', table_name='browser_use_runs')
    op.drop_index('ix_browser_use_runs_suite_id', table_name='browser_use_runs')
    op.drop_index('ix_browser_use_runs_product_id', table_name='browser_use_runs')
    op.drop_table('browser_use_runs')

    op.drop_index('ix_suite_runs_status', table_name='suite_runs')
    op.drop_index('ix_suite_runs_product_id', table_name='suite_runs')
    op.drop_index('ix_suite_runs_suite_id', table_name='suite_runs')
    op.drop_table('suite_runs')

    op.drop_constraint('uq_test_steps_test_id_step_order', 'test_steps', type_='unique')
    op.drop_table('test_steps')
    op.drop_table('tests')
    op.drop_table('suites')
    op.drop_table('products')

    sa.Enum(name='artifact_kind').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='suite_run_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='run_status').drop(op.get_bind(), checkfirst=True)
