"""authenticity_items and authenticity_checks: Is it real? (ADR-0023)

Revision ID: c7e3a1f9b524
Revises: b4d2e8f6a913
"""
from alembic import op
import sqlalchemy as sa

revision = "c7e3a1f9b524"
down_revision = "b4d2e8f6a913"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "authenticity_items",
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("source_protected", sa.Boolean(), nullable=False),
        sa.Column("decided_by", sa.String(255), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("checked", sa.JSON(), nullable=False),
        sa.Column("platform_label", sa.Text(), nullable=True),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("about_evidence", sa.JSON(), nullable=False),
        sa.Column("suite_restore", sa.JSON(), nullable=False),
        sa.Column("examined_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_authenticity_items_investigation_id", "authenticity_items", ["investigation_id"])
    op.create_index("ix_authenticity_items_status", "authenticity_items", ["status"])
    op.create_table(
        "authenticity_checks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("actor", sa.String(16), nullable=False),
        sa.Column("person", sa.String(255), nullable=True),
        sa.Column("method", sa.String(255), nullable=True),
        sa.Column("tool", sa.String(255), nullable=True),
        sa.Column("version", sa.String(64), nullable=True),
        sa.Column("input_sha256", sa.String(64), nullable=True),
        sa.Column("local", sa.Boolean(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_authenticity_checks_document_id", "authenticity_checks", ["document_id"])
    op.create_index("ix_authenticity_checks_investigation_id", "authenticity_checks", ["investigation_id"])
    op.create_index("ix_authenticity_checks_created_at", "authenticity_checks", ["created_at"])


def downgrade():
    op.drop_table("authenticity_checks")
    op.drop_table("authenticity_items")
