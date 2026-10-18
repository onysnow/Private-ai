"""add investigation is_demo flag

Revision ID: a1c3e0d9f512
Revises: b8d4f0e2a6c1
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c3e0d9f512"
down_revision = "b8d4f0e2a6c1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "investigations",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("investigations", "is_demo")
