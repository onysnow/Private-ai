"""add a payment's kind to relationship edges: a transfer, a loan, a fee, a settlement,
an agreed price, a fine or penalty, or an amount ordered by a court or authority
(DECISIONS_LOG 32). NULL is "not said" and reads as money that moved. FollowTheMoney's
Payment has no property for it (purpose is free text, programme a sanctions or funding
programme), so it is the app's own column, beside evidence_status.

Revision ID: a7d3f9c2e614
Revises: e6c1b4d8a352
"""
import sqlalchemy as sa

from alembic import op

revision = "a7d3f9c2e614"
down_revision = "e6c1b4d8a352"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("relationship_edges") as batch:
        batch.add_column(sa.Column("payment_kind", sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table("relationship_edges") as batch:
        batch.drop_column("payment_kind")
