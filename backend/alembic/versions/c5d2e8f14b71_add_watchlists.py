"""add watchlist_entries and watchlist_hits (a watchlist of names re-checked
as documents arrive; ADR-0006, Wave C)

Revision ID: c5d2e8f14b71
Revises: b4e1d7c93a20
"""
from alembic import op
import sqlalchemy as sa

revision = "c5d2e8f14b71"
down_revision = "b4e1d7c93a20"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "watchlist_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("query", sa.String(length=512), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("checked_at", sa.DateTime(), nullable=True),
        sa.Column("check_state", sa.String(length=32), nullable=True),
        sa.Column("check_detail", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_watchlist_entries_investigation_id", "watchlist_entries", ["investigation_id"])
    op.create_table(
        "watchlist_hits",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("entry_id", sa.String(), nullable=False),
        sa.Column("document_key", sa.String(length=512), nullable=False),
        sa.Column("document_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("highlights", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("lead_id", sa.String(), nullable=True),
        sa.Column("found_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["entry_id"], ["watchlist_entries.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_id", "document_key", name="uq_watchlist_hit_entry_document"),
    )
    op.create_index("ix_watchlist_hits_investigation_id", "watchlist_hits", ["investigation_id"])
    op.create_index("ix_watchlist_hits_entry_id", "watchlist_hits", ["entry_id"])
    op.create_index("ix_watchlist_hits_document_id", "watchlist_hits", ["document_id"])
    op.create_index("ix_watchlist_hits_status", "watchlist_hits", ["status"])


def downgrade():
    for name in ("ix_watchlist_hits_status", "ix_watchlist_hits_document_id", "ix_watchlist_hits_entry_id", "ix_watchlist_hits_investigation_id"):
        op.drop_index(name, table_name="watchlist_hits")
    op.drop_table("watchlist_hits")
    op.drop_index("ix_watchlist_entries_investigation_id", table_name="watchlist_entries")
    op.drop_table("watchlist_entries")
