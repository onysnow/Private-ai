"""per-claim review of an AI proposal: Keep / Correct / Reject (mockup AI_1, research AI §2 "Per-claim decisions")

Revision ID: e8c4a1f7b293
Revises: e4c8a1f7b392
"""
from alembic import op
import sqlalchemy as sa

revision = "e8c4a1f7b293"
down_revision = "e4c8a1f7b392"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ai_analysis_candidates", sa.Column("claim_reviews", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("ai_analysis_candidates") as batch:
        batch.drop_column("claim_reviews")
