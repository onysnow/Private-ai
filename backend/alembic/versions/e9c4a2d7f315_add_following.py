"""monitors, monitor_items and page_versions: sources a case follows, what they turn up, page versions (ADR-0022)

Revision ID: e9c4a2d7f315
Revises: d7b3f1a9c264
"""
from alembic import op
import sqlalchemy as sa

revision = "e9c4a2d7f315"
down_revision = "d7b3f1a9c264"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "monitors",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("platform", sa.String(32), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("every_minutes", sa.Integer(), nullable=False),
        sa.Column("route", sa.String(16), nullable=False),
        sa.Column("health", sa.String(16), nullable=False),
        sa.Column("health_detail", sa.Text(), nullable=True),
        sa.Column("moved_to", sa.Text(), nullable=True),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("etag", sa.String(500), nullable=True),
        sa.Column("last_modified", sa.String(100), nullable=True),
        sa.Column("robots_allowed", sa.Boolean(), nullable=True),
        sa.Column("deleted_recent", sa.Integer(), nullable=False),
        sa.Column("window", sa.Integer(), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_ok_at", sa.DateTime(), nullable=True),
        sa.Column("next_check_at", sa.DateTime(), nullable=True),
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
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("vanished_at", sa.DateTime(), nullable=True),
        sa.Column("versions", sa.JSON(), nullable=False),
        sa.Column("extra", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("cluster", sa.String(), nullable=True),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("capture_id", sa.String(), nullable=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("link_checked_at", sa.DateTime(), nullable=True),
        sa.Column("gone_status", sa.Integer(), nullable=True),
        sa.Column("decision", sa.JSON(), nullable=False),
    )
    for col in ("investigation_id", "monitor_id", "state", "cluster"):
        op.create_index(f"ix_monitor_items_{col}", "monitor_items", [col])
    op.create_table(
        "page_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("monitor_id", sa.String(), sa.ForeignKey("monitors.id"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(), nullable=False),
        sa.Column("text_sha256", sa.String(64), nullable=False),
        sa.Column("layout_sha256", sa.String(64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lines_changed", sa.Integer(), nullable=False),
        sa.Column("diff", sa.JSON(), nullable=False),
        sa.Column("layout_changes", sa.JSON(), nullable=False),
        sa.Column("captured", sa.Boolean(), nullable=False),
        sa.Column("capture_id", sa.String(), nullable=True),
    )
    for col in ("investigation_id", "monitor_id"):
        op.create_index(f"ix_page_versions_{col}", "page_versions", [col])


def downgrade():
    for col in ("investigation_id", "monitor_id"):
        op.drop_index(f"ix_page_versions_{col}", table_name="page_versions")
    op.drop_table("page_versions")
    for col in ("investigation_id", "monitor_id", "state", "cluster"):
        op.drop_index(f"ix_monitor_items_{col}", table_name="monitor_items")
    op.drop_table("monitor_items")
    op.drop_index("ix_monitors_next_check_at", table_name="monitors")
    op.drop_index("ix_monitors_investigation_id", table_name="monitors")
    op.drop_table("monitors")
