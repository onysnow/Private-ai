"""decision snoozes: H on Decide puts a decision off until a time or until the item changes
(research Check §3.1 keyboard, "H later (snooze, wakes on new activity — Linear)"; Needs: "a small
decision_snooze table (kind, id, until, wake_on_activity) for H")

Revision ID: d3a7c9e15b48
Revises: b7e3d5a9c142
"""
from alembic import op
import sqlalchemy as sa

revision = "d3a7c9e15b48"
down_revision = "b7e3d5a9c142"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "decision_snoozes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("item_id", sa.String(), nullable=False),
        sa.Column("until", sa.DateTime(), nullable=True),
        sa.Column("wake_on_activity", sa.Boolean(), nullable=False),
        sa.Column("digest", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "kind", "item_id", name="uq_decision_snooze_item"),
    )
    op.create_index(op.f("ix_decision_snoozes_investigation_id"), "decision_snoozes", ["investigation_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_decision_snoozes_investigation_id"), table_name="decision_snoozes")
    op.drop_table("decision_snoozes")
