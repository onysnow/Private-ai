"""add the timeline event grade: Bellingcat's grading scale (ADR-0005, line 5)

Revision ID: b3d6f2a9c814
Revises: a8c1d4e7f052
"""
from alembic import op
import sqlalchemy as sa

revision = "b3d6f2a9c814"
down_revision = "a8c1d4e7f052"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("timeline_events", sa.Column("grade", sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table("timeline_events") as batch:
        batch.drop_column("grade")
