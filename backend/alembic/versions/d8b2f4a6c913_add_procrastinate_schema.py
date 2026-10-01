"""add the Procrastinate job-queue schema (PostgreSQL only; ADR-0004)

The queue's tables, types and functions live in their own PostgreSQL schema,
"procrastinate", so the Workbench's own schema (public) is unchanged: the
schema-compatibility check, backups and the console only ever see public.
SQLite (developer mode, fast tests) has no queue; jobs run in-process there.
The SQL is the vendored alembic/sql/procrastinate_3.10.0_schema.sql.

Revision ID: d8b2f4a6c913
Revises: c3a9e7f1d205
"""
from alembic import op

from app.jobs.queue_schema import QUEUE_SCHEMA, apply_queue_schema, queue_schema_present

revision = "d8b2f4a6c913"
down_revision = "c3a9e7f1d205"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or queue_schema_present(bind):
        return
    apply_queue_schema(bind)


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(f"DROP SCHEMA IF EXISTS {QUEUE_SCHEMA} CASCADE")
