"""add writeups and decks

Revision ID: e5060ea25cdb
Revises: d3a8f61e2c94
"""
from alembic import op
import sqlalchemy as sa

revision = "e5060ea25cdb"
down_revision = "d3a8f61e2c94"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "writeups",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("cited_record_refs", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("source_ai_candidate_id", sa.String(), sa.ForeignKey("ai_analysis_candidates.id"), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_writeups_investigation_id", "writeups", ["investigation_id"])
    op.create_index("ix_writeups_status", "writeups", ["status"])
    op.create_index("ix_writeups_source_ai_candidate_id", "writeups", ["source_ai_candidate_id"])

    op.create_table(
        "decks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("slides_json", sa.JSON(), nullable=False),
        sa.Column("source_ai_candidate_id", sa.String(), sa.ForeignKey("ai_analysis_candidates.id"), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_decks_investigation_id", "decks", ["investigation_id"])
    op.create_index("ix_decks_source_ai_candidate_id", "decks", ["source_ai_candidate_id"])


def downgrade():
    op.drop_index("ix_decks_source_ai_candidate_id", table_name="decks")
    op.drop_index("ix_decks_investigation_id", table_name="decks")
    op.drop_table("decks")
    op.drop_index("ix_writeups_source_ai_candidate_id", table_name="writeups")
    op.drop_index("ix_writeups_status", table_name="writeups")
    op.drop_index("ix_writeups_investigation_id", table_name="writeups")
    op.drop_table("writeups")
