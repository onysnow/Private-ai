"""monitors, monitor_items and monitor_versions: sources the app watches for a case and what each poll found (ADR-0021)

Revision ID: d6b1f8a3c925
Revises: c5a9e3b72d14
"""
from alembic import op
import sqlalchemy as sa

revision = "d6b1f8a3c925"
down_revision = "c5a9e3b72d14"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "monitors",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("interval_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("route", sa.String(8), nullable=False, server_default="direct"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("health", sa.String(16), nullable=False, server_default="waiting"),
        sa.Column("health_reason", sa.Text(), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("etag", sa.Text(), nullable=True),
        sa.Column("last_modified", sa.Text(), nullable=True),
        sa.Column("moved_to", sa.Text(), nullable=True),
        sa.Column("robots_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_ok_at", sa.DateTime(), nullable=True),
        sa.Column("next_check_at", sa.DateTime(), nullable=True),
        sa.Column("last_poll", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_monitors_investigation_id", "monitors", ["investigation_id"])
    op.create_index("ix_monitors_next_check_at", "monitors", ["next_check_at"])
    op.create_table(
        "monitor_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("monitor_id", sa.String(), sa.ForeignKey("monitors.id"), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("displayed", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("edits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("flags", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(12), nullable=False, server_default="new"),
        sa.Column("decided_by", sa.String(255), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("capture_id", sa.String(), sa.ForeignKey("captures.id"), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_monitor_items_investigation_id", "monitor_items", ["investigation_id"])
    op.create_index("ix_monitor_items_monitor_id", "monitor_items", ["monitor_id"])
    op.create_index("ix_monitor_items_state", "monitor_items", ["state"])
    op.create_table(
        "monitor_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("monitor_id", sa.String(), sa.ForeignKey("monitors.id"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("text_sha256", sa.String(64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lines_added", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lines_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seen_at", sa.DateTime(), nullable=False),
        sa.Column("capture_id", sa.String(), sa.ForeignKey("captures.id"), nullable=True),
    )
    op.create_index("ix_monitor_versions_investigation_id", "monitor_versions", ["investigation_id"])
    op.create_index("ix_monitor_versions_monitor_id", "monitor_versions", ["monitor_id"])


def downgrade():
    op.drop_table("monitor_versions")
    op.drop_table("monitor_items")
    op.drop_table("monitors")
