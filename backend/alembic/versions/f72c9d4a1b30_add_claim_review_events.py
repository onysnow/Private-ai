"""add claim review events

Revision ID: f72c9d4a1b30
Revises: e61b8c3f9a20
"""
from alembic import op
import sqlalchemy as sa
revision = "f72c9d4a1b30"
down_revision = "e61b8c3f9a20"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("claim_review_events",
        sa.Column("id", sa.String(), nullable=False), sa.Column("claim_id", sa.String(), nullable=False),
        sa.Column("from_status", sa.String(length=64), nullable=False), sa.Column("to_status", sa.String(length=64), nullable=False),
        sa.Column("from_confidence", sa.Float(), nullable=False), sa.Column("to_confidence", sa.Float(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_claim_review_events_claim_id"), "claim_review_events", ["claim_id"], unique=False)
    op.create_index(op.f("ix_claim_review_events_to_status"), "claim_review_events", ["to_status"], unique=False)

def downgrade():
    op.drop_index(op.f("ix_claim_review_events_to_status"), table_name="claim_review_events")
    op.drop_index(op.f("ix_claim_review_events_claim_id"), table_name="claim_review_events")
    op.drop_table("claim_review_events")
