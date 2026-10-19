"""add cross_reference_proposals and cross_reference_decisions (OpenAleph's
cross-referencing as proposals for reporters; ADR-0006, Wave B)

Revision ID: 93f4568b8d9d
Revises: c7e2a9d41b58
"""
from alembic import op
import sqlalchemy as sa

revision = "93f4568b8d9d"
down_revision = "c7e2a9d41b58"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cross_reference_proposals",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("openaleph_entity_id", sa.String(length=512), nullable=False),
        sa.Column("match_kind", sa.String(length=16), nullable=False),
        sa.Column("other_entity_id", sa.String(), nullable=True),
        sa.Column("match_openaleph_id", sa.String(length=512), nullable=False),
        sa.Column("match_collection_id", sa.String(length=512), nullable=True),
        sa.Column("match_collection_label", sa.String(length=512), nullable=True),
        sa.Column("match_investigation_id", sa.String(), nullable=True),
        sa.Column("match_schema", sa.String(length=128), nullable=False),
        sa.Column("match_caption", sa.String(length=512), nullable=False),
        sa.Column("match_properties", sa.JSON(), nullable=False),
        sa.Column("matched_properties", sa.JSON(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("method", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["other_entity_id"], ["entities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "match_openaleph_id", name="uq_cross_reference_pair"),
    )
    for column in ("investigation_id", "entity_id", "match_kind", "other_entity_id", "match_openaleph_id",
                   "match_investigation_id", "status"):
        op.create_index(f"ix_cross_reference_proposals_{column}", "cross_reference_proposals", [column])
    op.create_table(
        "cross_reference_decisions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("proposal_id", sa.String(), nullable=False),
        sa.Column("decision", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("judgement", sa.String(length=16), nullable=False),
        sa.Column("judgement_status", sa.String(length=16), nullable=False),
        sa.Column("judgement_sent_at", sa.DateTime(), nullable=True),
        sa.Column("judgement_error", sa.Text(), nullable=True),
        sa.Column("openaleph_profile_id", sa.String(length=512), nullable=True),
        sa.Column("resolution_decision_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["proposal_id"], ["cross_reference_proposals.id"]),
        sa.ForeignKeyConstraint(["resolution_decision_id"], ["resolution_decisions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("investigation_id", "proposal_id", "judgement_status"):
        op.create_index(f"ix_cross_reference_decisions_{column}", "cross_reference_decisions", [column])


def downgrade():
    for column in ("judgement_status", "proposal_id", "investigation_id"):
        op.drop_index(f"ix_cross_reference_decisions_{column}", table_name="cross_reference_decisions")
    op.drop_table("cross_reference_decisions")
    for column in ("status", "match_investigation_id", "match_openaleph_id", "other_entity_id", "match_kind",
                   "entity_id", "investigation_id"):
        op.drop_index(f"ix_cross_reference_proposals_{column}", table_name="cross_reference_proposals")
    op.drop_table("cross_reference_proposals")
