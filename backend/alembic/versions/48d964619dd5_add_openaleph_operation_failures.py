"""add openaleph_operation_failures (STRUCT-0027: server-side trace of
failed OpenAleph pipeline operations)

Revision ID: 48d964619dd5
Revises: e2f3a4b5c6d7
"""
from alembic import op
import sqlalchemy as sa

revision = "48d964619dd5"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "openaleph_operation_failures",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_openaleph_operation_failures_investigation_id", "openaleph_operation_failures", ["investigation_id"]
    )
    op.create_index(
        "ix_openaleph_operation_failures_document_id", "openaleph_operation_failures", ["document_id"]
    )
    op.create_index(
        "ix_openaleph_operation_failures_operation", "openaleph_operation_failures", ["operation"]
    )
    op.create_index(
        "ix_openaleph_operation_failures_created_at", "openaleph_operation_failures", ["created_at"]
    )


def downgrade():
    op.drop_index("ix_openaleph_operation_failures_created_at", table_name="openaleph_operation_failures")
    op.drop_index("ix_openaleph_operation_failures_operation", table_name="openaleph_operation_failures")
    op.drop_index("ix_openaleph_operation_failures_document_id", table_name="openaleph_operation_failures")
    op.drop_index("ix_openaleph_operation_failures_investigation_id", table_name="openaleph_operation_failures")
    op.drop_table("openaleph_operation_failures")
