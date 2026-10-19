"""flip cards for Practise in Learn: learning_cards, per reporter (research Knowledge §6 "Needs")

Revision ID: b7e3d5a9c142
Revises: e8c4a1f7b293
"""
from alembic import op
import sqlalchemy as sa

revision = "b7e3d5a9c142"
down_revision = "e8c4a1f7b293"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("learning_cards",
        sa.Column("id", sa.String(), nullable=False), sa.Column("owner", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False), sa.Column("ref", sa.String(length=255), nullable=False),
        sa.Column("areas", sa.JSON(), nullable=False), sa.Column("added_from", sa.String(length=32), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False), sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=False), sa.Column("last_answer", sa.String(length=16), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(), nullable=True), sa.Column("reviews", sa.Integer(), nullable=False),
        sa.Column("lapses", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner", "kind", "ref", name="uq_learning_card_owner_kind_ref"))
    op.create_index(op.f("ix_learning_cards_owner"), "learning_cards", ["owner"], unique=False)
    op.create_index(op.f("ix_learning_cards_due_at"), "learning_cards", ["due_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_learning_cards_due_at"), table_name="learning_cards")
    op.drop_index(op.f("ix_learning_cards_owner"), table_name="learning_cards")
    op.drop_table("learning_cards")
