"""Passphrase-protected backups and Housekeeping: backup_events.encrypted (whether a backup was protected with a
passphrase, ADR-0015) and kept_stray_files (stray files the reporter chose to keep, research Keep §12)

Revision ID: f3b9d2a7c615
Revises: c4f8a2d6e913
"""
from alembic import op
import sqlalchemy as sa

revision = "f3b9d2a7c615"
down_revision = "c4f8a2d6e913"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("backup_events", sa.Column("encrypted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table("kept_stray_files",
        sa.Column("id", sa.String(), nullable=False), sa.Column("relative_path", sa.String(length=1024), nullable=False),
        sa.Column("kept_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("relative_path"))


def downgrade():
    op.drop_table("kept_stray_files")
    op.drop_column("backup_events", "encrypted")
