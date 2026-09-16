"""add lead relationship links

Revision ID: f52c8bd1a403
Revises: e7b2d91c4f10
"""
from alembic import op
import sqlalchemy as sa

revision = "f52c8bd1a403"
down_revision = "e7b2d91c4f10"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("lead_links") as batch_op:
        batch_op.add_column(sa.Column("relationship_id", sa.String(), nullable=True))
        batch_op.create_index("ix_lead_links_relationship_id", ["relationship_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_lead_links_relationship_id_relationship_edges",
            "relationship_edges", ["relationship_id"], ["id"],
        )


def downgrade():
    with op.batch_alter_table("lead_links") as batch_op:
        batch_op.drop_constraint("fk_lead_links_relationship_id_relationship_edges", type_="foreignkey")
        batch_op.drop_index("ix_lead_links_relationship_id")
        batch_op.drop_column("relationship_id")
