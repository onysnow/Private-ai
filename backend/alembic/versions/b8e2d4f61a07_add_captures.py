"""captures: a web page kept from a link, with its files' hashes and custody (ADR-0018, ADR-0019)

Revision ID: b8e2d4f61a07
Revises: a3f7c1d9e642
"""
from alembic import op
import sqlalchemy as sa

revision = "b8e2d4f61a07"
down_revision = "a3f7c1d9e642"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "captures",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("final_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("outcome", sa.String(16), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("collector", sa.String(255), nullable=True),
        sa.Column("tool", sa.String(255), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("captured_at", sa.DateTime(), nullable=True),
        sa.Column("files", sa.JSON(), nullable=False),
        sa.Column("displayed", sa.JSON(), nullable=False),
        sa.Column("stages", sa.JSON(), nullable=False),
        sa.Column("exchange", sa.JSON(), nullable=False),
        sa.Column("robots_disallowed", sa.Boolean(), nullable=True),
        sa.Column("source_id", sa.String(), sa.ForeignKey("sources.id"), nullable=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("case_record_id", sa.String(), sa.ForeignKey("case_records.id"), nullable=True),
        sa.Column("job_id", sa.String(), nullable=True),
    )
    op.create_index("ix_captures_investigation_id", "captures", ["investigation_id"])
    op.create_index("ix_captures_source_id", "captures", ["source_id"])
    op.create_index("ix_captures_document_id", "captures", ["document_id"])


def downgrade():
    op.drop_table("captures")
