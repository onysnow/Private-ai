"""add ai_analysis_candidates.request (the question/theory a reviewer is judging the output against)

Revision ID: a7c3e9d1f2b4
Revises: 48d964619dd5
"""
from alembic import op
import sqlalchemy as sa

revision = "a7c3e9d1f2b4"
down_revision = "48d964619dd5"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("ai_analysis_candidates") as batch:
        batch.add_column(sa.Column("request", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("ai_analysis_candidates") as batch:
        batch.drop_column("request")
