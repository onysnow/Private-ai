"""merge heads (reporting task workflow events + relationship evidence pointer removal)

Revision ID: d1e2f3a4b5c6
Revises: b84e2fa90c17, c05f9e3a1d64
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = ("b84e2fa90c17", "c05f9e3a1d64")
branch_labels = None
depends_on = None


def upgrade():
    # Pure merge point: the two branches (reporting-task workflow events,
    # relationship-edge legacy evidence pointer removal) touch disjoint
    # tables and have no ordering dependency on each other. Nothing to do
    # here beyond joining the two heads back into one line of history so
    # `alembic upgrade head` is unambiguous again.
    pass


def downgrade():
    pass
