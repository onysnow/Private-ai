"""your name and the app lock (local_profile), a case locked on its own, and per-person keys that expire (ADR-0016)

Revision ID: d6a1f4c8e237
Revises: f1a9c3d7e582
"""
from alembic import op
import sqlalchemy as sa

revision = "d6a1f4c8e237"
down_revision = "f1a9c3d7e582"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "local_profile",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("protection", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("passphrase_hash", sa.String(length=255), nullable=True),
        sa.Column("recovery_hash", sa.String(length=255), nullable=True),
        sa.Column("pin_hash", sa.String(length=255), nullable=True),
        sa.Column("backup_recipient", sa.String(length=128), nullable=True),
        sa.Column("identity_by_passphrase", sa.Text(), nullable=True),
        sa.Column("identity_by_recovery", sa.Text(), nullable=True),
        sa.Column("idle_minutes", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("lock_on_hide", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("lock_on_sleep", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("quick_pin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("passphrase_set_at", sa.DateTime(), nullable=True),
        sa.Column("recovery_set_at", sa.DateTime(), nullable=True),
        sa.Column("disk_answer", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("investigations") as batch:
        batch.add_column(sa.Column("case_lock", sa.JSON(), nullable=True))
    with op.batch_alter_table("app_users") as batch:
        batch.add_column(sa.Column("token_hint", sa.String(length=8), nullable=True))
        batch.add_column(sa.Column("token_expires_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("app_users") as batch:
        batch.drop_column("token_expires_at")
        batch.drop_column("token_hint")
    with op.batch_alter_table("investigations") as batch:
        batch.drop_column("case_lock")
    op.drop_table("local_profile")
