"""add post-merge duplicate reconciliation decisions

Revision ID: f1c9a2d7b410
Revises: e2a7c55f9011
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f1c9a2d7b410"
down_revision: Union[str, None] = "e2a7c55f9011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "post_merge_reconciliation_decisions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=False),
        sa.Column("record_a_id", sa.String(), nullable=False),
        sa.Column("record_b_id", sa.String(), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("investigation_id", "entity_id", "record_type", "record_a_id", "record_b_id", "decision"):
        op.create_index(f"ix_post_merge_reconciliation_decisions_{column}", "post_merge_reconciliation_decisions", [column], unique=False)


def downgrade() -> None:
    for column in reversed(("investigation_id", "entity_id", "record_type", "record_a_id", "record_b_id", "decision")):
        op.drop_index(f"ix_post_merge_reconciliation_decisions_{column}", table_name="post_merge_reconciliation_decisions")
    op.drop_table("post_merge_reconciliation_decisions")
