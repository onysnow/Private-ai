"""document_media.voices: who spoke when, and the names a person gave the voices (ADR-0026)

Revision ID: e4a7c2d9b815
Revises: d8f4b2a6c731
"""
from alembic import op
import sqlalchemy as sa

revision = "e4a7c2d9b815"
down_revision = "d8f4b2a6c731"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("document_media") as batch:
        batch.add_column(sa.Column("voices", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("document_media") as batch:
        batch.drop_column("voices")
