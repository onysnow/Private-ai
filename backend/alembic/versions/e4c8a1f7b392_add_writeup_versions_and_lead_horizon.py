"""a write-up's snapshots (mockup ACT_2, version "before legal read") and when a lead is chased (Now / Next / Later)

Revision ID: e4c8a1f7b392
Revises: d3a6b9c2e714
"""
from alembic import op
import sqlalchemy as sa

revision = "e4c8a1f7b392"
down_revision = "d3a6b9c2e714"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "writeup_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("writeup_id", sa.String(), sa.ForeignKey("writeups.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_writeup_versions_investigation_id", "writeup_versions", ["investigation_id"])
    op.create_index("ix_writeup_versions_writeup_id", "writeup_versions", ["writeup_id"])
    op.create_index("ix_writeup_versions_created_at", "writeup_versions", ["created_at"])
    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("horizon", sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table("leads") as batch:
        batch.drop_column("horizon")
    op.drop_index("ix_writeup_versions_created_at", table_name="writeup_versions")
    op.drop_index("ix_writeup_versions_writeup_id", table_name="writeup_versions")
    op.drop_index("ix_writeup_versions_investigation_id", table_name="writeup_versions")
    op.drop_table("writeup_versions")
