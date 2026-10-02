"""add documents.parent_document_id (a file found inside an archive or attached
to an email that OpenAleph read; ADR-0006, Wave A)

Revision ID: c7e2a9d41b58
Revises: aff315d3ef8b
"""
from alembic import op
import sqlalchemy as sa

revision = "c7e2a9d41b58"
down_revision = "aff315d3ef8b"
branch_labels = None
depends_on = None


def upgrade():
    # batch mode: SQLite adds a foreign key only by rebuilding the table.
    with op.batch_alter_table("documents") as batch:
        batch.add_column(sa.Column("parent_document_id", sa.String(), nullable=True))
        batch.create_foreign_key("fk_documents_parent_document_id_documents", "documents", ["parent_document_id"], ["id"])
        batch.create_index("ix_documents_parent_document_id", ["parent_document_id"])


def downgrade():
    with op.batch_alter_table("documents") as batch:
        batch.drop_index("ix_documents_parent_document_id")
        batch.drop_constraint("fk_documents_parent_document_id_documents", type_="foreignkey")
        batch.drop_column("parent_document_id")
