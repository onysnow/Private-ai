"""this case's default AI run settings (mockup AI_2 "Before you run", research AI §6)

Revision ID: c7d1f3a8e520
Revises: b4e8d2a6c931
"""
from alembic import op
import sqlalchemy as sa

revision = "c7d1f3a8e520"
down_revision = "b4e8d2a6c931"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("investigations", sa.Column("ai_run_profile", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("investigations") as batch:
        batch.drop_column("ai_run_profile")
