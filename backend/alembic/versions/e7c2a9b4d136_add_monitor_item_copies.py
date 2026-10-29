"""monitor_items.copy_of and similarity (the same story seen earlier, counted once) and rechecked_at (is a captured
page still there) (ADR-0021)

Revision ID: e7c2a9b4d136
Revises: d6b1f8a3c925
"""
from alembic import op
import sqlalchemy as sa

revision = "e7c2a9b4d136"
down_revision = "d6b1f8a3c925"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("monitor_items") as batch:
        batch.add_column(sa.Column("copy_of", sa.String(), nullable=True))
        batch.add_column(sa.Column("similarity", sa.Float(), nullable=True))
        batch.add_column(sa.Column("rechecked_at", sa.DateTime(), nullable=True))
        batch.create_foreign_key("fk_monitor_items_copy_of", "monitor_items", ["copy_of"], ["id"])
        batch.create_index("ix_monitor_items_copy_of", ["copy_of"])


def downgrade():
    with op.batch_alter_table("monitor_items") as batch:
        batch.drop_index("ix_monitor_items_copy_of")
        batch.drop_constraint("fk_monitor_items_copy_of", type_="foreignkey")
        batch.drop_column("rechecked_at")
        batch.drop_column("similarity")
        batch.drop_column("copy_of")
