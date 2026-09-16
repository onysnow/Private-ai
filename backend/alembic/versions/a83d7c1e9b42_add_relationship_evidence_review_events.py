"""add relationship evidence review events

Revision ID: a83d7c1e9b42
Revises: f72c9d4a1b30
"""
from alembic import op
import sqlalchemy as sa
revision = "a83d7c1e9b42"
down_revision = "f72c9d4a1b30"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("relationship_evidence_review_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("relationship_edge_id", sa.String(), nullable=False),
        sa.Column("evidence_id", sa.String(), nullable=False),
        sa.Column("stance", sa.String(length=32), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["relationship_edge_id"], ["relationship_edges.id"]),
        sa.ForeignKeyConstraint(["evidence_id"], ["evidence.id"]),
        sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_relationship_evidence_review_events_relationship_edge_id"), "relationship_evidence_review_events", ["relationship_edge_id"], unique=False)
    op.create_index(op.f("ix_relationship_evidence_review_events_evidence_id"), "relationship_evidence_review_events", ["evidence_id"], unique=False)
    op.create_index(op.f("ix_relationship_evidence_review_events_stance"), "relationship_evidence_review_events", ["stance"], unique=False)

def downgrade():
    op.drop_index(op.f("ix_relationship_evidence_review_events_stance"), table_name="relationship_evidence_review_events")
    op.drop_index(op.f("ix_relationship_evidence_review_events_evidence_id"), table_name="relationship_evidence_review_events")
    op.drop_index(op.f("ix_relationship_evidence_review_events_relationship_edge_id"), table_name="relationship_evidence_review_events")
    op.drop_table("relationship_evidence_review_events")
