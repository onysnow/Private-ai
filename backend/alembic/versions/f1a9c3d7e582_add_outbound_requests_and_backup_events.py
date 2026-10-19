"""what left this computer and when a backup was made (mockup KEEP-safety-and-data, ADR-0015)

Revision ID: f1a9c3d7e582
Revises: e8c4a1f7b293
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a9c3d7e582"
down_revision = "e8c4a1f7b293"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "outbound_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("local", sa.Boolean(), nullable=False),
        sa.Column("value_sent", sa.Text(), nullable=False),
        sa.Column("value_kind", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("actor", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
    )
    op.create_index("ix_outbound_requests_investigation_id", "outbound_requests", ["investigation_id"])
    op.create_index("ix_outbound_requests_at", "outbound_requests", ["at"])
    op.create_index("ix_outbound_requests_service", "outbound_requests", ["service"])
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
    op.drop_index("ix_outbound_requests_service", table_name="outbound_requests")
    op.drop_index("ix_outbound_requests_at", table_name="outbound_requests")
    op.drop_index("ix_outbound_requests_investigation_id", table_name="outbound_requests")
    op.drop_table("outbound_requests")
