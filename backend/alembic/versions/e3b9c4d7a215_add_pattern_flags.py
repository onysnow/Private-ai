"""add pattern_flags (Red Flags: occurrences of pattern rules;
docs/discovery/system-design.md §3.3)

Revision ID: e3b9c4d7a215
Revises: d8a3f6c2e917
"""
from alembic import op
import sqlalchemy as sa

revision = "e3b9c4d7a215"
down_revision = "d8a3f6c2e917"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pattern_flags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("indicator_id", sa.String(length=16), nullable=False),
        sa.Column("rule_version", sa.Integer(), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("parties", sa.JSON(), nullable=False),
        sa.Column("links", sa.JSON(), nullable=False),
        sa.Column("facts", sa.JSON(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("weight_parts", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("dismissed_reason", sa.Text(), nullable=True),
        sa.Column("lead_id", sa.String(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("gone_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "fingerprint", name="uq_pattern_flag_fingerprint"),
    )
    op.create_index("ix_pattern_flags_investigation_id", "pattern_flags", ["investigation_id"])
    op.create_index("ix_pattern_flags_indicator_id", "pattern_flags", ["indicator_id"])
    op.create_index("ix_pattern_flags_status", "pattern_flags", ["status"])


def downgrade():
    for name in ("ix_pattern_flags_status", "ix_pattern_flags_indicator_id", "ix_pattern_flags_investigation_id"):
        op.drop_index(name, table_name="pattern_flags")
    op.drop_table("pattern_flags")
