"""each AI run's steps as they happened, append-only (mockup AI_1 "Watch the run", ADR-0012)

Revision ID: d3a6b9c2e714
Revises: c7d1f3a8e520
"""
from alembic import op
import sqlalchemy as sa

revision = "d3a6b9c2e714"
down_revision = "c7d1f3a8e520"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_run_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("node", sa.String(length=64), nullable=False),
        sa.Column("system", sa.String(length=16), nullable=False),
        sa.Column("rule", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("verdict", sa.String(length=64), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("refs", sa.JSON(), nullable=False),
        sa.Column("parent", sa.Integer(), nullable=True),
        sa.Column("self_reported", sa.Boolean(), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.UniqueConstraint("run_id", "n", name="uq_ai_run_events_run_n"),
    )
    op.create_index("ix_ai_run_events_investigation_id", "ai_run_events", ["investigation_id"])
    op.create_index("ix_ai_run_events_run_id", "ai_run_events", ["run_id"])


def downgrade():
    op.drop_index("ix_ai_run_events_run_id", table_name="ai_run_events")
    op.drop_index("ix_ai_run_events_investigation_id", table_name="ai_run_events")
    op.drop_table("ai_run_events")
