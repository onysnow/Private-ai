"""when a backup was made (ADR-0015). The outbound log is the
`outbound_requests` table of a3f7c1d9e642.

Revision ID: f1a9c3d7e582
Revises: c3f8a2d6e914
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a9c3d7e582"
down_revision = "c3f8a2d6e914"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "backup_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("with_documents", sa.Boolean(), nullable=False),
        sa.Column("record_total", sa.Integer(), nullable=False),
        sa.Column("document_count", sa.Integer(), nullable=False),
        sa.Column("encrypted", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_backup_events_investigation_id", "backup_events", ["investigation_id"])
    op.create_index("ix_backup_events_at", "backup_events", ["at"])


def downgrade():
    op.drop_index("ix_backup_events_at", table_name="backup_events")
    op.drop_index("ix_backup_events_investigation_id", table_name="backup_events")
    op.drop_table("backup_events")
