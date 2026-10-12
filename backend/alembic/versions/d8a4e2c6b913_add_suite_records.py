"""add the Authority System Suite's fields and records the app lacked (the app-side
suite gaps, docs/authority-suite/SUITE_GAPS.md): source tier and issuer; evidence
authenticity, restatement, separate dates and limits; claim classification,
likelihood term, confidence level and basis, warrant, assumptions, limits, verdict
and corrected wording; reviewer type on review events; relationship evidence
status; lead gathering outcome; and case_records for the suite's own records

Revision ID: d8a4e2c6b913
Revises: c6e1a9d4f2b7
"""
from alembic import op
import sqlalchemy as sa

revision = "d8a4e2c6b913"
down_revision = "c6e1a9d4f2b7"
branch_labels = None
depends_on = None

EVIDENCE = (("issuer_or_author", sa.String(length=512)), ("authenticity_status", sa.String(length=16)),
            ("created_on", sa.String(length=10)), ("event_on", sa.String(length=10)), ("published_on", sa.String(length=10)),
            ("retrieved_on", sa.String(length=10)), ("limitations", sa.JSON()))
CLAIMS = (("classification", sa.String(length=32)), ("confidence_term", sa.String(length=32)), ("confidence_level", sa.String(length=8)),
          ("confidence_basis", sa.Text()), ("warrant", sa.Text()), ("assumptions", sa.JSON()), ("limitations", sa.JSON()),
          ("verification_verdict", sa.String(length=48)), ("corrected_wording", sa.Text()))


def upgrade():
    with op.batch_alter_table("sources") as batch:
        batch.add_column(sa.Column("source_tier", sa.String(length=1), nullable=True))
        batch.add_column(sa.Column("issuer_or_author", sa.String(length=512), nullable=True))
    with op.batch_alter_table("evidence") as batch:
        for name, kind in EVIDENCE:
            batch.add_column(sa.Column(name, kind, nullable=True))
        batch.add_column(sa.Column("restates_evidence_id", sa.String(), nullable=True))
        batch.create_index("ix_evidence_restates_evidence_id", ["restates_evidence_id"])
        batch.create_foreign_key("fk_evidence_restates_evidence_id", "evidence", ["restates_evidence_id"], ["id"])
    with op.batch_alter_table("claims") as batch:
        for name, kind in CLAIMS:
            batch.add_column(sa.Column(name, kind, nullable=True))
    with op.batch_alter_table("claim_review_events") as batch:
        batch.add_column(sa.Column("reviewer_type", sa.String(length=16), nullable=False, server_default="HUMAN"))
        batch.add_column(sa.Column("suite_changes", sa.JSON(), nullable=True))
    with op.batch_alter_table("relationship_evidence_review_events") as batch:
        batch.add_column(sa.Column("reviewer_type", sa.String(length=16), nullable=False, server_default="HUMAN"))
    with op.batch_alter_table("relationship_edges") as batch:
        batch.add_column(sa.Column("evidence_status", sa.String(length=16), nullable=True))
    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("gathering_outcome", sa.String(length=24), nullable=True))
    op.create_table(
        "case_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("investigation_id", "record_id", name="uq_case_record_id"),
    )
    op.create_index("ix_case_records_investigation_id", "case_records", ["investigation_id"])
    op.create_index("ix_case_records_kind", "case_records", ["kind"])
    op.create_index("ix_case_records_record_id", "case_records", ["record_id"])


def downgrade():
    op.drop_index("ix_case_records_record_id", table_name="case_records")
    op.drop_index("ix_case_records_kind", table_name="case_records")
    op.drop_index("ix_case_records_investigation_id", table_name="case_records")
    op.drop_table("case_records")
    with op.batch_alter_table("leads") as batch:
        batch.drop_column("gathering_outcome")
    with op.batch_alter_table("relationship_edges") as batch:
        batch.drop_column("evidence_status")
    with op.batch_alter_table("relationship_evidence_review_events") as batch:
        batch.drop_column("reviewer_type")
    with op.batch_alter_table("claim_review_events") as batch:
        batch.drop_column("suite_changes")
        batch.drop_column("reviewer_type")
    with op.batch_alter_table("claims") as batch:
        for name, _ in reversed(CLAIMS):
            batch.drop_column(name)
    with op.batch_alter_table("evidence") as batch:
        batch.drop_constraint("fk_evidence_restates_evidence_id", type_="foreignkey")
        batch.drop_index("ix_evidence_restates_evidence_id")
        batch.drop_column("restates_evidence_id")
        for name, _ in reversed(EVIDENCE):
            batch.drop_column(name)
    with op.batch_alter_table("sources") as batch:
        batch.drop_column("issuer_or_author")
        batch.drop_column("source_tier")
