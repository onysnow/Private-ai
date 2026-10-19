"""add openaleph_entity_sets (the diagrams, timelines and lists the
Workbench makes in OpenAleph from an investigation's records; ADR-0006, Wave C)

Revision ID: e7f4a0b36d93
Revises: d6e3f9a25c82
"""
from alembic import op
import sqlalchemy as sa

revision = "e7f4a0b36d93"
down_revision = "d6e3f9a25c82"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "openaleph_entity_sets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=512), nullable=False),
        sa.Column("collection_id", sa.String(length=512), nullable=False),
        sa.Column("openaleph_entityset_id", sa.String(length=512), nullable=False),
        sa.Column("item_ids", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_openaleph_entity_sets_investigation_id"), "openaleph_entity_sets", ["investigation_id"], unique=False)
    op.create_index(op.f("ix_openaleph_entity_sets_kind"), "openaleph_entity_sets", ["kind"], unique=False)
    op.create_index(op.f("ix_openaleph_entity_sets_openaleph_entityset_id"), "openaleph_entity_sets", ["openaleph_entityset_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_openaleph_entity_sets_openaleph_entityset_id"), table_name="openaleph_entity_sets")
    op.drop_index(op.f("ix_openaleph_entity_sets_kind"), table_name="openaleph_entity_sets")
    op.drop_index(op.f("ix_openaleph_entity_sets_investigation_id"), table_name="openaleph_entity_sets")
    op.drop_table("openaleph_entity_sets")
