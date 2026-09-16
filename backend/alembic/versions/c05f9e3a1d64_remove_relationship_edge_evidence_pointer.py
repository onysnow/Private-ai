"""remove legacy relationship edge evidence pointer

Revision ID: c05f9e3a1d64
Revises: b94e8d2f0c53
"""
from alembic import op
import sqlalchemy as sa

revision = "c05f9e3a1d64"
down_revision = "b94e8d2f0c53"
branch_labels = None
depends_on = None


def upgrade():
    # Every non-null legacy pointer was copied into relationship_evidence_attachments
    # by b94e8d2f0c53. Attachments are now the sole relationship-evidence authority.
    with op.batch_alter_table("relationship_edges") as batch_op:
        batch_op.drop_index("ix_relationship_edges_evidence_id")
        batch_op.drop_column("evidence_id")


def downgrade():
    with op.batch_alter_table("relationship_edges") as batch_op:
        batch_op.add_column(sa.Column("evidence_id", sa.String(), nullable=True))
        batch_op.create_index("ix_relationship_edges_evidence_id", ["evidence_id"], unique=False)
        batch_op.create_foreign_key("fk_relationship_edges_evidence_id_evidence", "evidence", ["evidence_id"], ["id"])
    # Downgrade is necessarily lossy because the old schema can hold only one item.
    # Pick the oldest attachment deterministically as the compatibility pointer.
    op.execute("""UPDATE relationship_edges SET evidence_id = (
        SELECT rea.evidence_id FROM relationship_evidence_attachments rea
        WHERE rea.relationship_edge_id = relationship_edges.id
        ORDER BY rea.created_at ASC, rea.id ASC LIMIT 1
    )""")
