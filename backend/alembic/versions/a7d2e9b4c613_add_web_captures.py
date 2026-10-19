"""a web page captured from a link (ADR-0016, mockup INTAKE_3)

Revision ID: a7d2e9b4c613
Revises: f1a9c3d7e582
"""
from alembic import op
import sqlalchemy as sa

revision = "a7d2e9b4c613"
down_revision = "f1a9c3d7e582"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "web_captures",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("source_id", sa.String(), sa.ForeignKey("sources.id"), nullable=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("supersedes_id", sa.String(), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("final_url", sa.Text(), nullable=True),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("collector", sa.JSON(), nullable=False),
        sa.Column("request", sa.JSON(), nullable=True),
        sa.Column("response", sa.JSON(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("files", sa.JSON(), nullable=False),
        sa.Column("page_sha256", sa.String(length=64), nullable=True),
        sa.Column("text_sha256", sa.String(length=64), nullable=True),
        sa.Column("displayed", sa.JSON(), nullable=True),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    for column in ("investigation_id", "source_id", "document_id", "supersedes_id", "outcome", "page_sha256"):
        op.create_index(f"ix_web_captures_{column}", "web_captures", [column])


def downgrade():
    for column in ("page_sha256", "outcome", "supersedes_id", "document_id", "source_id", "investigation_id"):
        op.drop_index(f"ix_web_captures_{column}", table_name="web_captures")
    op.drop_table("web_captures")
