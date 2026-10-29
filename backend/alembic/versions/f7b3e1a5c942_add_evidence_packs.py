"""evidence_packs: each evidence pack's own list of files, kept when it is made (Check a pack, CHECK_4)

Revision ID: f7b3e1a5c942
Revises: e4a7c2d9b815
"""
from alembic import op
import sqlalchemy as sa

revision = "f7b3e1a5c942"
down_revision = "e4a7c2d9b815"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "evidence_packs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
        sa.Column("draft", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("made_by", sa.String(length=255), nullable=True),
        sa.Column("manifest", sa.Text(), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("files", sa.JSON(), nullable=False),
        sa.Column("exhibits", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_evidence_packs_investigation_id", "evidence_packs", ["investigation_id"])
    op.create_index("ix_evidence_packs_created_at", "evidence_packs", ["created_at"])


def downgrade():
    op.drop_index("ix_evidence_packs_created_at", table_name="evidence_packs")
    op.drop_index("ix_evidence_packs_investigation_id", table_name="evidence_packs")
    op.drop_table("evidence_packs")
