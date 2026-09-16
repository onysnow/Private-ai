"""add canonical resolution decisions

Revision ID: c91d7a3e1f42
Revises: b84e2fa90c17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c91d7a3e1f42"
down_revision: Union[str, None] = "b84e2fa90c17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "canonical_resolution_decisions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("entity_a_id", sa.String(), nullable=False),
        sa.Column("entity_b_id", sa.String(), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["entity_a_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["entity_b_id"], ["entities.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ("investigation_id","entity_a_id","entity_b_id","decision"):
        op.create_index(op.f("ix_canonical_resolution_decisions_"+col), "canonical_resolution_decisions", [col], unique=False)

def downgrade() -> None:
    for col in ("decision","entity_b_id","entity_a_id","investigation_id"):
        op.drop_index(op.f("ix_canonical_resolution_decisions_"+col), table_name="canonical_resolution_decisions")
    op.drop_table("canonical_resolution_decisions")
