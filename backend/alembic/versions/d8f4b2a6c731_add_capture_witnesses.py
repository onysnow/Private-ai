"""captures.witnesses: the time proof, the second witness and a copy found elsewhere (ADR-0025)

Revision ID: d8f4b2a6c731
Revises: c7e3a1f9b524
"""
from alembic import op
import sqlalchemy as sa

revision = "d8f4b2a6c731"
down_revision = "c7e3a1f9b524"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("captures") as batch:
        batch.add_column(sa.Column("witnesses", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("captures") as batch:
        batch.drop_column("witnesses")
