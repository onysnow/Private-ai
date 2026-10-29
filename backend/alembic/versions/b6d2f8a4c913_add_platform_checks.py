"""platform_checks: each try of a platform's public test item (Does it work today?, WORKS_1)

Revision ID: b6d2f8a4c913
Revises: a1c5e9f3d207
"""
from alembic import op
import sqlalchemy as sa

revision = "b6d2f8a4c913"
down_revision = "a1c5e9f3d207"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "platform_checks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("test_url", sa.Text(), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False, server_default=""),
        sa.Column("missing", sa.JSON(), nullable=False),
        sa.Column("seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("tool", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("checked_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_platform_checks_platform", "platform_checks", ["platform"])
    op.create_index("ix_platform_checks_checked_at", "platform_checks", ["checked_at"])


def downgrade():
    op.drop_index("ix_platform_checks_checked_at", table_name="platform_checks")
    op.drop_index("ix_platform_checks_platform", table_name="platform_checks")
    op.drop_table("platform_checks")
