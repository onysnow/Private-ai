"""add first-class relationship evidence attachments

Revision ID: b94e8d2f0c53
Revises: a83d7c1e9b42
"""
from alembic import op
import sqlalchemy as sa
revision = "b94e8d2f0c53"
down_revision = "a83d7c1e9b42"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("relationship_evidence_attachments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("relationship_edge_id", sa.String(), nullable=False),
        sa.Column("evidence_id", sa.String(), nullable=False),
        sa.Column("attached_by", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["relationship_edge_id"], ["relationship_edges.id"]),
        sa.ForeignKeyConstraint(["evidence_id"], ["evidence.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("relationship_edge_id", "evidence_id", name="uq_relationship_evidence_attachment"))
    op.create_index(op.f("ix_relationship_evidence_attachments_relationship_edge_id"), "relationship_evidence_attachments", ["relationship_edge_id"], unique=False)
    op.create_index(op.f("ix_relationship_evidence_attachments_evidence_id"), "relationship_evidence_attachments", ["evidence_id"], unique=False)
    op.create_index(op.f("ix_relationship_evidence_attachments_attached_by"), "relationship_evidence_attachments", ["attached_by"], unique=False)
    # Preserve all legacy one-evidence relationships as explicit attachments.
    op.execute("""INSERT INTO relationship_evidence_attachments (id, relationship_edge_id, evidence_id, attached_by, created_at)
        SELECT 'legacy-' || id, id, evidence_id, 'migration', created_at FROM relationship_edges WHERE evidence_id IS NOT NULL""")

def downgrade():
    op.drop_index(op.f("ix_relationship_evidence_attachments_attached_by"), table_name="relationship_evidence_attachments")
    op.drop_index(op.f("ix_relationship_evidence_attachments_evidence_id"), table_name="relationship_evidence_attachments")
    op.drop_index(op.f("ix_relationship_evidence_attachments_relationship_edge_id"), table_name="relationship_evidence_attachments")
    op.drop_table("relationship_evidence_attachments")
