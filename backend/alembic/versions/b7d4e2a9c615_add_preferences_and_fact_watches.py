"""settings kept on the server (Notifications, Outside lookups, AI and research) and watches on a claim or a Red Flag

Revision ID: b7d4e2a9c615
Revises: e8c4a1f7b293
"""
from alembic import op
import sqlalchemy as sa

revision = "b7d4e2a9c615"
down_revision = "e8c4a1f7b293"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "app_preferences",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("scope", "subject", "key", name="uq_app_preference"),
    )
    op.create_index("ix_app_preferences_scope", "app_preferences", ["scope"])
    op.create_index("ix_app_preferences_subject", "app_preferences", ["subject"])
    op.create_index("ix_app_preferences_investigation_id", "app_preferences", ["investigation_id"])
    op.create_table(
        "fact_watches",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("owner", sa.String(length=255), nullable=False),
        sa.Column("record_type", sa.String(length=16), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("baseline", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("seen_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("owner", "record_type", "record_id", name="uq_fact_watch"),
    )
    op.create_index("ix_fact_watches_investigation_id", "fact_watches", ["investigation_id"])
    op.create_index("ix_fact_watches_owner", "fact_watches", ["owner"])
    op.create_index("ix_fact_watches_record_id", "fact_watches", ["record_id"])


def downgrade():
    op.drop_table("fact_watches")
    op.drop_table("app_preferences")
