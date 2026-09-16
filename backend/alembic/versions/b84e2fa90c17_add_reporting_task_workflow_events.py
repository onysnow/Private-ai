"""add reporting task workflow events

Revision ID: b84e2fa90c17
Revises: f52c8bd1a403
"""
from alembic import op
import sqlalchemy as sa

revision = "b84e2fa90c17"
down_revision = "f52c8bd1a403"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reporting_task_workflow_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("task_id", sa.String(), sa.ForeignKey("reporting_tasks.id"), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("lead_provenance_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_reporting_task_workflow_events_investigation_id", "reporting_task_workflow_events", ["investigation_id"])
    op.create_index("ix_reporting_task_workflow_events_task_id", "reporting_task_workflow_events", ["task_id"])
    op.create_index("ix_reporting_task_workflow_events_to_status", "reporting_task_workflow_events", ["to_status"])


def downgrade():
    op.drop_index("ix_reporting_task_workflow_events_to_status", table_name="reporting_task_workflow_events")
    op.drop_index("ix_reporting_task_workflow_events_task_id", table_name="reporting_task_workflow_events")
    op.drop_index("ix_reporting_task_workflow_events_investigation_id", table_name="reporting_task_workflow_events")
    op.drop_table("reporting_task_workflow_events")
