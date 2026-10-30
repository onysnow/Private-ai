"""A mapping proposed for a table when it arrives (app/services/table_proposals.py; DECISIONS_LOG 39):
table_mappings.prepare (how a proposed mapping reads the cells first) and table_proposal_decisions (who accepted or
dismissed the proposal, and what they changed).

Revision ID: b1c4e7a9d352
Revises: a8d2f6c4e913
"""
import sqlalchemy as sa

from alembic import op

revision = "b1c4e7a9d352"
down_revision = "a8d2f6c4e913"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("table_mappings") as batch:
        batch.add_column(sa.Column("prepare", sa.JSON(), nullable=True))
    op.create_table(
        "table_proposal_decisions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("sheet", sa.String(length=255), nullable=True),
        sa.Column("decision", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("proposed", sa.JSON(), nullable=False),
        sa.Column("accepted", sa.JSON(), nullable=True),
        sa.Column("changed", sa.Boolean(), nullable=False),
        sa.Column("mapping_id", sa.String(), sa.ForeignKey("table_mappings.id"), nullable=True),
        sa.Column("decided_by", sa.String(length=255), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_table_proposal_decisions_investigation_id", "table_proposal_decisions", ["investigation_id"])
    op.create_index("ix_table_proposal_decisions_document_id", "table_proposal_decisions", ["document_id"])


def downgrade():
    op.drop_index("ix_table_proposal_decisions_document_id", table_name="table_proposal_decisions")
    op.drop_index("ix_table_proposal_decisions_investigation_id", table_name="table_proposal_decisions")
    op.drop_table("table_proposal_decisions")
    with op.batch_alter_table("table_mappings") as batch:
        batch.drop_column("prepare")
