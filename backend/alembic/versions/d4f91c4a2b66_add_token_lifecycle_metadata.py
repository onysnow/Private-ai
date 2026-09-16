"""add token lifecycle metadata

Revision ID: d4f91c4a2b66
Revises: a9216c2d77e1
Create Date: 2026-09-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d4f91c4a2b66"
down_revision: Union[str, None] = "a9216c2d77e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("app_users", sa.Column("token_created_at", sa.DateTime(), nullable=True))
    op.add_column("app_users", sa.Column("token_last_used_at", sa.DateTime(), nullable=True))
    op.add_column("app_users", sa.Column("token_rotated_at", sa.DateTime(), nullable=True))
    op.add_column("app_users", sa.Column("token_revoked_at", sa.DateTime(), nullable=True))
    op.add_column("app_users", sa.Column("disabled_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_app_users_token_revoked_at"), "app_users", ["token_revoked_at"], unique=False)
    op.execute("UPDATE app_users SET token_created_at = created_at WHERE token_created_at IS NULL")
    with op.batch_alter_table("app_users") as batch_op:
        batch_op.alter_column("token_created_at", existing_type=sa.DateTime(), nullable=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_app_users_token_revoked_at"), table_name="app_users")
    op.drop_column("app_users", "disabled_at")
    op.drop_column("app_users", "token_revoked_at")
    op.drop_column("app_users", "token_rotated_at")
    op.drop_column("app_users", "token_last_used_at")
    op.drop_column("app_users", "token_created_at")
