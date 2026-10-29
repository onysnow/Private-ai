"""timeline_periods and timeline_events.placeholder (Timeline Lanes and Periods, TIME_1 and TIME_8)

Revision ID: c8e4a2f6b175
Revises: b6d2f8a4c913
"""
import sqlalchemy as sa

from alembic import op

revision = "c8e4a2f6b175"
down_revision = "b6d2f8a4c913"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "timeline_periods",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("date_start", sa.String(length=32), nullable=False),
        sa.Column("date_end", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("made_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_timeline_periods_investigation_id", "timeline_periods", ["investigation_id"])
    with op.batch_alter_table("timeline_events") as batch:
        batch.add_column(sa.Column("placeholder", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("timeline_events") as batch:
        batch.drop_column("placeholder")
    op.drop_index("ix_timeline_periods_investigation_id", table_name="timeline_periods")
    op.drop_table("timeline_periods")
