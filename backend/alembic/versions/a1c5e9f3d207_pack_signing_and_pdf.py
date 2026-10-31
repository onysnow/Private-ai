"""local_profile signing key; evidence_packs key fingerprint and PDF (DECISIONS_LOG 3)

Revision ID: a1c5e9f3d207
Revises: f7b3e1a5c942
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c5e9f3d207"
down_revision = "f7b3e1a5c942"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("local_profile") as batch:
        batch.add_column(sa.Column("signing_public", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("signing_secret", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("signing_created_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("evidence_packs") as batch:
        batch.add_column(sa.Column("key_fingerprint", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("pdf", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("evidence_packs") as batch:
        batch.drop_column("pdf")
        batch.drop_column("key_fingerprint")
    with op.batch_alter_table("local_profile") as batch:
        batch.drop_column("signing_created_at")
        batch.drop_column("signing_secret")
        batch.drop_column("signing_public")
