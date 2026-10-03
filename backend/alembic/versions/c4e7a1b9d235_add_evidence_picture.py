"""add a picture to evidence: the uploaded picture an evidence record is, and when it was taken (before-and-after images)

Revision ID: c4e7a1b9d235
Revises: b3d6f2a9c814
"""
from alembic import op
import sqlalchemy as sa

revision = "c4e7a1b9d235"
down_revision = "b3d6f2a9c814"
branch_labels = None
depends_on = None


def upgrade():
    # batch mode: SQLite adds a foreign key only by rebuilding the table (as c7e2a9d41b58 does).
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(sa.Column("document_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("captured_on", sa.String(length=10), nullable=True))
        batch.create_foreign_key("fk_evidence_document_id_documents", "documents", ["document_id"], ["id"])
        batch.create_index("ix_evidence_document_id", ["document_id"])


def downgrade():
    with op.batch_alter_table("evidence") as batch:
        batch.drop_index("ix_evidence_document_id")
        batch.drop_constraint("fk_evidence_document_id_documents", type_="foreignkey")
        batch.drop_column("captured_on")
        batch.drop_column("document_id")
