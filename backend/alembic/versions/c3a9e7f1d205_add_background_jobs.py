"""add background_jobs (slow work runs after the request returns; ADR-0004)

Revision ID: c3a9e7f1d205
Revises: b4e8d2a61c07
"""
from alembic import op
import sqlalchemy as sa

revision = "c3a9e7f1d205"
down_revision = "b4e8d2a61c07"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "background_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=True),
        sa.Column("subject_type", sa.String(length=64), nullable=True),
        sa.Column("subject_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("runner", sa.String(length=16), nullable=False),
        sa.Column("queue_job_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_background_jobs_kind", "background_jobs", ["kind"])
    op.create_index("ix_background_jobs_investigation_id", "background_jobs", ["investigation_id"])
    op.create_index("ix_background_jobs_subject_id", "background_jobs", ["subject_id"])
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"])


def downgrade():
    op.drop_index("ix_background_jobs_status", table_name="background_jobs")
    op.drop_index("ix_background_jobs_subject_id", table_name="background_jobs")
    op.drop_index("ix_background_jobs_investigation_id", table_name="background_jobs")
    op.drop_index("ix_background_jobs_kind", table_name="background_jobs")
    op.drop_table("background_jobs")
