"""when the Red Flag rules last ran on a case, what they read and what could not run (mockup ACT_1 "Reading never writes")

Revision ID: e8b5c1f4a927
Revises: d3a6b9c2e714
"""
from alembic import op
import sqlalchemy as sa

revision = "e8b5c1f4a927"
down_revision = "d3a6b9c2e714"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("investigations", sa.Column("red_flag_run", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("investigations") as batch:
        batch.drop_column("red_flag_run")
