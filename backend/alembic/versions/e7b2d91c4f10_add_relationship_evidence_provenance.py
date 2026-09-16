"""add relationship evidence provenance

Revision ID: e7b2d91c4f10
Revises: d4f91c4a2b66
"""
from alembic import op
import sqlalchemy as sa

revision = "e7b2d91c4f10"
down_revision = "d4f91c4a2b66"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("relationship_edges") as batch_op:
        batch_op.add_column(sa.Column("evidence_id", sa.String(), nullable=True))
        batch_op.create_index("ix_relationship_edges_evidence_id", ["evidence_id"], unique=False)
        batch_op.create_foreign_key("fk_relationship_edges_evidence_id_evidence", "evidence", ["evidence_id"], ["id"])


def downgrade():
    with op.batch_alter_table("relationship_edges") as batch_op:
        batch_op.drop_constraint("fk_relationship_edges_evidence_id_evidence", type_="foreignkey")
        batch_op.drop_index("ix_relationship_edges_evidence_id")
        batch_op.drop_column("evidence_id")
