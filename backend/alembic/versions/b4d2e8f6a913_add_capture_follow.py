"""captures.reason_kind and monitors.capture_id: a link-only reason in one word, and checking a capture's page again

Revision ID: b4d2e8f6a913
Revises: e9c4a2d7f315
"""
from alembic import op
import sqlalchemy as sa

revision = "b4d2e8f6a913"
down_revision = "e9c4a2d7f315"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("captures") as batch:
        batch.add_column(sa.Column("reason_kind", sa.String(16), nullable=True))
        batch.add_column(sa.Column("reason_kind_by", sa.String(255), nullable=True))
    with op.batch_alter_table("monitors") as batch:
        batch.add_column(sa.Column("capture_id", sa.String(), nullable=True))
        batch.create_index("ix_monitors_capture_id", ["capture_id"])


def downgrade():
    with op.batch_alter_table("monitors") as batch:
        batch.drop_index("ix_monitors_capture_id")
        batch.drop_column("capture_id")
    with op.batch_alter_table("captures") as batch:
        batch.drop_column("reason_kind_by")
        batch.drop_column("reason_kind")
