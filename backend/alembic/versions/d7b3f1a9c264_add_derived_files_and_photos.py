"""derived_files and document_photos: the edit trail of files made from case files, and what photos say about themselves (ADR-0021)

Revision ID: d7b3f1a9c264
Revises: c5a9e3b72d14
"""
from alembic import op
import sqlalchemy as sa

revision = "d7b3f1a9c264"
down_revision = "c5a9e3b72d14"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "derived_files",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("derived_files.id"), nullable=True),
        sa.Column("parent_sha256", sa.String(64), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("tool", sa.String(255), nullable=False),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("model_sha256", sa.String(64), nullable=True),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    for col in ("investigation_id", "document_id", "parent_id", "sha256", "operation"):
        op.create_index(f"ix_derived_files_{col}", "derived_files", [col])
    op.create_table(
        "document_photos",
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("claims", sa.JSON(), nullable=False),
        sa.Column("date_tag", sa.String(64), nullable=True),
        sa.Column("tool", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_document_photos_investigation_id", "document_photos", ["investigation_id"])


def downgrade():
    op.drop_index("ix_document_photos_investigation_id", table_name="document_photos")
    op.drop_table("document_photos")
    for col in ("investigation_id", "document_id", "parent_id", "sha256", "operation"):
        op.drop_index(f"ix_derived_files_{col}", table_name="derived_files")
    op.drop_table("derived_files")
