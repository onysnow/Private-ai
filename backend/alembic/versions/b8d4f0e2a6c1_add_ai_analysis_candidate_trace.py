"""add ai_analysis_candidates.trace (the exact prompts and retrieval packet a run used)

Revision ID: b8d4f0e2a6c1
Revises: a7c3e9d1f2b4
"""
from alembic import op
import sqlalchemy as sa

revision = "b8d4f0e2a6c1"
down_revision = "a7c3e9d1f2b4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("ai_analysis_candidates") as batch:
        batch.add_column(sa.Column("trace", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("ai_analysis_candidates") as batch:
        batch.drop_column("trace")
