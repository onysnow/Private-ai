"""add table_mappings (a spreadsheet's columns mapped to FollowTheMoney
entities, whose results are proposals; ADR-0006, Wave C)

Revision ID: d6e3f9a25c82
Revises: c5d2e8f14b71
"""
from alembic import op
import sqlalchemy as sa

revision = "d6e3f9a25c82"
down_revision = "c5d2e8f14b71"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "table_mappings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("sheet", sa.String(length=255), nullable=True),
        sa.Column("query", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("rows_read", sa.Integer(), nullable=False),
        sa.Column("entities_proposed", sa.Integer(), nullable=False),
        sa.Column("links_proposed", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_table_mappings_document_id"), "table_mappings", ["document_id"], unique=False)
    op.create_index(op.f("ix_table_mappings_investigation_id"), "table_mappings", ["investigation_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_table_mappings_investigation_id"), table_name="table_mappings")
    op.drop_index(op.f("ix_table_mappings_document_id"), table_name="table_mappings")
    op.drop_table("table_mappings")
