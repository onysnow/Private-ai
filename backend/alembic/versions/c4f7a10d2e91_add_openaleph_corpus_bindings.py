"""add OpenAleph corpus bindings and document sync state

Revision ID: c4f7a10d2e91
Revises: a3d2e61c8842
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c4f7a10d2e91"
down_revision: Union[str, None] = "a3d2e61c8842"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investigation_corpus_bindings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("collection_id", sa.String(length=512), nullable=False),
        sa.Column("foreign_id", sa.String(length=512), nullable=True),
        sa.Column("collection_label", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "provider", name="uq_investigation_corpus_provider"),
    )
    for column in ("investigation_id", "provider", "collection_id", "foreign_id", "status"):
        op.create_index(f"ix_investigation_corpus_bindings_{column}", "investigation_corpus_bindings", [column])
    op.create_table(
        "document_corpus_syncs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("collection_id", sa.String(length=512), nullable=False),
        sa.Column("provider_record_id", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("response_json", sa.JSON(), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "provider", name="uq_document_corpus_provider"),
    )
    for column in ("document_id", "investigation_id", "provider", "collection_id", "provider_record_id", "status"):
        op.create_index(f"ix_document_corpus_syncs_{column}", "document_corpus_syncs", [column])


def downgrade() -> None:
    op.drop_table("document_corpus_syncs")
    op.drop_table("investigation_corpus_bindings")
