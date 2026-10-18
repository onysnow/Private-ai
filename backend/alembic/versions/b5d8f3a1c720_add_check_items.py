"""add check_items (To check: passages and checklist items a person decides;
docs/discovery/detection-design.md)

Revision ID: b5d8f3a1c720
Revises: a4c7e2f9b318
"""
from alembic import op
import sqlalchemy as sa

revision = "b5d8f3a1c720"
down_revision = "a4c7e2f9b318"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "check_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("indicator_id", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("parties", sa.JSON(), nullable=False),
        sa.Column("flag_id", sa.String(), nullable=True),
        sa.Column("document_id", sa.String(), nullable=True),
        sa.Column("locator", sa.String(length=255), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("terms", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("gone_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["flag_id"], ["pattern_flags.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "fingerprint", name="uq_check_item_fingerprint"),
    )
    op.create_index("ix_check_items_investigation_id", "check_items", ["investigation_id"])
    op.create_index("ix_check_items_indicator_id", "check_items", ["indicator_id"])
    op.create_index("ix_check_items_status", "check_items", ["status"])


def downgrade():
    op.drop_index("ix_check_items_status", table_name="check_items")
    op.drop_index("ix_check_items_indicator_id", table_name="check_items")
    op.drop_index("ix_check_items_investigation_id", table_name="check_items")
    op.drop_table("check_items")
