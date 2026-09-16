"""add property conflict temporal intervals

Revision ID: e61b8c3f9a20
Revises: d5a8c21e4f77
"""
from alembic import op
import sqlalchemy as sa

revision = "e61b8c3f9a20"
down_revision = "d5a8c21e4f77"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("property_conflict_decisions", sa.Column("temporal_intervals_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))

def downgrade():
    op.drop_column("property_conflict_decisions", "temporal_intervals_json")
