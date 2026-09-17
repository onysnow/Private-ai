"""add ai_analysis_candidates (review-gated TAS reasoning-layer output)

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""
from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_analysis_candidates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("module", sa.String(length=32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("checked_citation_ids", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("review_status", sa.String(length=32), nullable=False, server_default="proposed"),
        sa.Column("accepted_record_type", sa.String(length=32), nullable=True),
        sa.Column("accepted_record_id", sa.String(length=512), nullable=True),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_ai_analysis_candidates_investigation_id", "ai_analysis_candidates", ["investigation_id"]
    )
    op.create_index("ix_ai_analysis_candidates_module", "ai_analysis_candidates", ["module"])
    op.create_index(
        "ix_ai_analysis_candidates_review_status", "ai_analysis_candidates", ["review_status"]
    )


def downgrade():
    op.drop_index("ix_ai_analysis_candidates_review_status", table_name="ai_analysis_candidates")
    op.drop_index("ix_ai_analysis_candidates_module", table_name="ai_analysis_candidates")
    op.drop_index("ix_ai_analysis_candidates_investigation_id", table_name="ai_analysis_candidates")
    op.drop_table("ai_analysis_candidates")
