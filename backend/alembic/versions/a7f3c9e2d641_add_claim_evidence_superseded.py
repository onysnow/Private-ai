"""claim_evidence_links: a link marked superseded by a newer record, with the reason and who marked it

Revision ID: a7f3c9e2d641
Revises: a7d3f9c2e614
"""
import sqlalchemy as sa

from alembic import op

revision = "a7f3c9e2d641"
down_revision = "a7d3f9c2e614"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("claim_evidence_links") as batch:
        batch.add_column(sa.Column("superseded_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("superseded_by_evidence_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("superseded_reason", sa.Text(), nullable=True))
        batch.add_column(sa.Column("superseded_decided_by_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("superseded_decided_by_name", sa.String(255), nullable=True))
        batch.create_foreign_key("fk_claim_evidence_links_superseded_by_evidence_id_evidence", "evidence",
                                 ["superseded_by_evidence_id"], ["id"])


def downgrade():
    with op.batch_alter_table("claim_evidence_links") as batch:
        batch.drop_constraint("fk_claim_evidence_links_superseded_by_evidence_id_evidence", type_="foreignkey")
        batch.drop_column("superseded_decided_by_name")
        batch.drop_column("superseded_decided_by_id")
        batch.drop_column("superseded_reason")
        batch.drop_column("superseded_by_evidence_id")
        batch.drop_column("superseded_at")
