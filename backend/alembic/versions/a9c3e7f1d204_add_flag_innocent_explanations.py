"""the state of each innocent explanation on a Red Flag (research §2 of Act, mockup ACT_1 "Before you call it"):
not looked at, ruled out (with a note), or could apply; kept on the flag, which survives re-runs by fingerprint

Revision ID: a9c3e7f1d204
Revises: d8a4e2c6b913
"""
from alembic import op
import sqlalchemy as sa

revision = "a9c3e7f1d204"
down_revision = "d8a4e2c6b913"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("pattern_flags") as batch:
        batch.add_column(sa.Column("innocent", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("pattern_flags") as batch:
        batch.drop_column("innocent")
