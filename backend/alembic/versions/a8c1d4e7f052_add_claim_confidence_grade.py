"""add the claim confidence grade: evidence and agreement on the IPCC AR5
grid (ADR-0005, line 5), on each claim and on each review

Revision ID: a8c1d4e7f052
Revises: e7f4a0b36d93
"""
from alembic import op
import sqlalchemy as sa

revision = "a8c1d4e7f052"
down_revision = "e7f4a0b36d93"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("claims", sa.Column("evidence_grade", sa.String(length=16), nullable=True))
    op.add_column("claims", sa.Column("agreement_grade", sa.String(length=16), nullable=True))
    op.add_column("claim_review_events", sa.Column("from_evidence_grade", sa.String(length=16), nullable=True))
    op.add_column("claim_review_events", sa.Column("to_evidence_grade", sa.String(length=16), nullable=True))
    op.add_column("claim_review_events", sa.Column("from_agreement_grade", sa.String(length=16), nullable=True))
    op.add_column("claim_review_events", sa.Column("to_agreement_grade", sa.String(length=16), nullable=True))


def downgrade():
    with op.batch_alter_table("claim_review_events") as batch:
        batch.drop_column("to_agreement_grade")
        batch.drop_column("from_agreement_grade")
        batch.drop_column("to_evidence_grade")
        batch.drop_column("from_evidence_grade")
    with op.batch_alter_table("claims") as batch:
        batch.drop_column("agreement_grade")
        batch.drop_column("evidence_grade")
