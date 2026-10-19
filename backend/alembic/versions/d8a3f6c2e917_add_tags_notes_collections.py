"""add tags, record_tags, notes, collections and collection_items (the
reporter's own marks on records; docs/discovery/system-design.md §3.1)

Revision ID: d8a3f6c2e917
Revises: c4e7a1b9d235
"""
from alembic import op
import sqlalchemy as sa

revision = "d8a3f6c2e917"
down_revision = "c4e7a1b9d235"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("colour", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "name", name="uq_tag_investigation_name"),
    )
    op.create_index("ix_tags_investigation_id", "tags", ["investigation_id"])
    op.create_table(
        "record_tags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("tag_id", sa.String(), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tag_id", "record_type", "record_id", name="uq_record_tag"),
    )
    op.create_index("ix_record_tags_investigation_id", "record_tags", ["investigation_id"])
    op.create_index("ix_record_tags_tag_id", "record_tags", ["tag_id"])
    op.create_index("ix_record_tags_record_type", "record_tags", ["record_type"])
    op.create_index("ix_record_tags_record_id", "record_tags", ["record_id"])
    op.create_table(
        "notes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=True),
        sa.Column("record_id", sa.String(), nullable=True),
        sa.Column("chart_ref", sa.JSON(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lead_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notes_investigation_id", "notes", ["investigation_id"])
    op.create_index("ix_notes_record_type", "notes", ["record_type"])
    op.create_index("ix_notes_record_id", "notes", ["record_id"])
    op.create_table(
        "collections",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_collections_investigation_id", "collections", ["investigation_id"])
    op.create_table(
        "collection_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("collection_id", sa.String(), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("collection_id", "record_type", "record_id", name="uq_collection_item"),
    )
    op.create_index("ix_collection_items_investigation_id", "collection_items", ["investigation_id"])
    op.create_index("ix_collection_items_collection_id", "collection_items", ["collection_id"])
    op.create_index("ix_collection_items_record_id", "collection_items", ["record_id"])


def downgrade():
    for name in ("ix_collection_items_record_id", "ix_collection_items_collection_id", "ix_collection_items_investigation_id"):
        op.drop_index(name, table_name="collection_items")
    op.drop_table("collection_items")
    op.drop_index("ix_collections_investigation_id", table_name="collections")
    op.drop_table("collections")
    for name in ("ix_notes_record_id", "ix_notes_record_type", "ix_notes_investigation_id"):
        op.drop_index(name, table_name="notes")
    op.drop_table("notes")
    for name in ("ix_record_tags_record_id", "ix_record_tags_record_type", "ix_record_tags_tag_id", "ix_record_tags_investigation_id"):
        op.drop_index(name, table_name="record_tags")
    op.drop_table("record_tags")
    op.drop_index("ix_tags_investigation_id", table_name="tags")
    op.drop_table("tags")
