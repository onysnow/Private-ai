"""add ingestion_batches and ingestion_batch_items (a bulk import as one
record the triage screen and review queue follow; design doc "Document
Ingestion & Review System Design", Phase 2)

Revision ID: b4e1d7c93a20
Revises: 93f4568b8d9d
"""
from alembic import op
import sqlalchemy as sa

revision = "b4e1d7c93a20"
down_revision = "93f4568b8d9d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestion_batches",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(length=512), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingestion_batches_investigation_id", "ingestion_batches", ["investigation_id"])
    op.create_table(
        "ingestion_batch_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("batch_id", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("document_id", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["ingestion_batches.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingestion_batch_items_batch_id", "ingestion_batch_items", ["batch_id"])
    op.create_index("ix_ingestion_batch_items_position", "ingestion_batch_items", ["position"])
    op.create_index("ix_ingestion_batch_items_outcome", "ingestion_batch_items", ["outcome"])
    op.create_index("ix_ingestion_batch_items_document_id", "ingestion_batch_items", ["document_id"])


def downgrade():
    op.drop_index("ix_ingestion_batch_items_document_id", table_name="ingestion_batch_items")
    op.drop_index("ix_ingestion_batch_items_outcome", table_name="ingestion_batch_items")
    op.drop_index("ix_ingestion_batch_items_position", table_name="ingestion_batch_items")
    op.drop_index("ix_ingestion_batch_items_batch_id", table_name="ingestion_batch_items")
    op.drop_table("ingestion_batch_items")
    op.drop_index("ix_ingestion_batches_investigation_id", table_name="ingestion_batches")
    op.drop_table("ingestion_batches")
