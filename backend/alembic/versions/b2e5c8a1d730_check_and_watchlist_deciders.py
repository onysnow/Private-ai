"""Who answered a To check item (missing values too) and who decided a watchlist hit (app/db/decided_by.py), as
extraction proposals and claim reviews already keep it. Needed so the demo's pre-made decisions (app/services/
demo_decided.py, "Demo (pre-decided)") can be told apart from a person's and undone. Rows already decided keep no
decider (none was kept then).

Revision ID: b2e5c8a1d730
Revises: b1c4e7a9d352
"""
import sqlalchemy as sa

from alembic import op

revision = "b2e5c8a1d730"
down_revision = "b1c4e7a9d352"
branch_labels = None
depends_on = None

TABLES = ("check_items", "watchlist_hits")


def upgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("decided_by_id", sa.String(), nullable=True))
            batch.add_column(sa.Column("decided_by_name", sa.String(length=255), nullable=True))


def downgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("decided_by_name")
            batch.drop_column("decided_by_id")
