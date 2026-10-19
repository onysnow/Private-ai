"""add investigations.type_areas (the investigation's type as the reporter
chose it; app/patterns/investigation_type.py)

Revision ID: a4c7e2f9b318
Revises: e3b9c4d7a215
"""
from alembic import op
import sqlalchemy as sa

revision = "a4c7e2f9b318"
down_revision = "e3b9c4d7a215"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("investigations", sa.Column("type_areas", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("investigations", "type_areas")
