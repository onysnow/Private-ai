"""add document extraction_issues

Revision ID: d3a8f61e2c94
Revises: a1c3e0d9f512
"""
from alembic import op
import sqlalchemy as sa

revision = "d3a8f61e2c94"
down_revision = "a1c3e0d9f512"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "documents",
        sa.Column("extraction_issues", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("documents", "extraction_issues")
