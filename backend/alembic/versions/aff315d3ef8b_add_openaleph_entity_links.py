"""add openaleph_entity_links and openaleph_corpus_sync_states (reporter-confirmed
records copied to the OpenAleph corpus; ADR-0006, Wave B)

Revision ID: aff315d3ef8b
Revises: d8b2f4a6c913
"""
from alembic import op
import sqlalchemy as sa

revision = "aff315d3ef8b"
down_revision = "d8b2f4a6c913"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "openaleph_entity_links",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("record_type", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("collection_id", sa.String(length=512), nullable=False),
        sa.Column("openaleph_entity_id", sa.String(length=512), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("pushed_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("record_type", "record_id", name="uq_openaleph_entity_link_record"),
    )
    for column in ("investigation_id", "record_type", "record_id", "collection_id", "openaleph_entity_id"):
        op.create_index(f"ix_openaleph_entity_links_{column}", "openaleph_entity_links", [column])
    op.create_table(
        "openaleph_corpus_sync_states",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("push_status", sa.String(length=32), nullable=False),
        sa.Column("push_started_at", sa.DateTime(), nullable=True),
        sa.Column("push_finished_at", sa.DateTime(), nullable=True),
        sa.Column("push_message", sa.Text(), nullable=True),
        sa.Column("push_error", sa.Text(), nullable=True),
        sa.Column("push_counts", sa.JSON(), nullable=False),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=True),
        sa.Column("xref_status", sa.String(length=32), nullable=False),
        sa.Column("xref_requested_at", sa.DateTime(), nullable=True),
        sa.Column("xref_finished_at", sa.DateTime(), nullable=True),
        sa.Column("xref_error", sa.Text(), nullable=True),
        sa.Column("xref_counts", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", name="uq_openaleph_corpus_sync_state_investigation"),
    )
    op.create_index(
        "ix_openaleph_corpus_sync_states_investigation_id", "openaleph_corpus_sync_states", ["investigation_id"]
    )


def downgrade():
    op.drop_index("ix_openaleph_corpus_sync_states_investigation_id", table_name="openaleph_corpus_sync_states")
    op.drop_table("openaleph_corpus_sync_states")
    for column in ("openaleph_entity_id", "collection_id", "record_id", "record_type", "investigation_id"):
        op.drop_index(f"ix_openaleph_entity_links_{column}", table_name="openaleph_entity_links")
    op.drop_table("openaleph_entity_links")
