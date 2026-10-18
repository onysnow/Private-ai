"""add decks.style_json (deck theme and font pairing)

Revision ID: b4e8d2a61c07
Revises: e5060ea25cdb
"""
from alembic import op
import sqlalchemy as sa

revision = "b4e8d2a61c07"
down_revision = "e5060ea25cdb"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("decks") as batch:
        batch.add_column(sa.Column("style_json", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("decks") as batch:
        batch.drop_column("style_json")
