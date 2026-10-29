"""document_media.sync: another recording lined up by sound, as accepted by a person (MEDIA_2)

Revision ID: e6c1b4d8a352
Revises: d3a7c5e9f218
"""
from alembic import op
import sqlalchemy as sa

revision = "e6c1b4d8a352"
down_revision = "d3a7c5e9f218"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("document_media") as batch:
        batch.add_column(sa.Column("sync", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("document_media") as batch:
        batch.drop_column("sync")
