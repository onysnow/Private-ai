"""add preview-first canonical entity merge audit

Revision ID: e2a7c55f9011
Revises: c91d7a3e1f42
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e2a7c55f9011"
down_revision: Union[str, None] = "c91d7a3e1f42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    with op.batch_alter_table("entities") as batch:
        batch.add_column(sa.Column("merged_into_entity_id", sa.String(), nullable=True))
        batch.create_index("ix_entities_merged_into_entity_id", ["merged_into_entity_id"], unique=False)
    op.create_table(
        "canonical_entity_merge_audits",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("source_entity_id", sa.String(), nullable=False),
        sa.Column("target_entity_id", sa.String(), nullable=False),
        sa.Column("resolution_decision_id", sa.String(), nullable=True),
        sa.Column("preview_digest", sa.String(length=64), nullable=False),
        sa.Column("preview_json", sa.JSON(), nullable=False),
        sa.Column("moved_counts_json", sa.JSON(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["source_entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["target_entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["resolution_decision_id"], ["canonical_resolution_decisions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for name in ("investigation_id", "source_entity_id", "target_entity_id", "resolution_decision_id", "preview_digest"):
        op.create_index(f"ix_canonical_entity_merge_audits_{name}", "canonical_entity_merge_audits", [name], unique=False)

def downgrade() -> None:
    op.drop_table("canonical_entity_merge_audits")
    with op.batch_alter_table("entities") as batch:
        batch.drop_index("ix_entities_merged_into_entity_id")
        batch.drop_column("merged_into_entity_id")
