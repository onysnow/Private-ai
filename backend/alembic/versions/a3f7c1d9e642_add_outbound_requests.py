"""the outbound log: every request that carried case data to a service (mockup KNOWLEDGE_KEEP_2, ADR-0015)

Revision ID: a3f7c1d9e642
Revises: e8c4a1f7b293
"""
from alembic import op
import sqlalchemy as sa

revision = "a3f7c1d9e642"
down_revision = "e8c4a1f7b293"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "outbound_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("service", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("actor", sa.String(16), nullable=False, server_default="you"),
        sa.Column("leaves_computer", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("outcome", sa.String(16), nullable=False, server_default="sent"),
        sa.Column("documents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.JSON(), nullable=True),
    )
    op.create_index("ix_outbound_requests_investigation_id", "outbound_requests", ["investigation_id"])
    op.create_index("ix_outbound_requests_at", "outbound_requests", ["at"])
    op.create_index("ix_outbound_requests_service", "outbound_requests", ["service"])


def downgrade():
    op.drop_table("outbound_requests")
