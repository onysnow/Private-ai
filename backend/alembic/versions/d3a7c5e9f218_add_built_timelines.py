"""built_timelines: a person's own order of the case's events (Timeline › Build your own, TIME_3)

Revision ID: d3a7c5e9f218
Revises: c8e4a2f6b175
"""
from alembic import op
import sqlalchemy as sa

revision = "d3a7c5e9f218"
down_revision = "c8e4a2f6b175"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "built_timelines",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("owner", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_built_timelines_investigation_id", "built_timelines", ["investigation_id"])
    op.create_index("ix_built_timelines_owner", "built_timelines", ["owner"])


def downgrade():
    op.drop_index("ix_built_timelines_owner", table_name="built_timelines")
    op.drop_index("ix_built_timelines_investigation_id", table_name="built_timelines")
    op.drop_table("built_timelines")
