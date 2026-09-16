"""add persisted users and investigation memberships

Revision ID: a9216c2d77e1
Revises: 6d87a355bb9b
Create Date: 2026-09-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a9216c2d77e1"
down_revision: Union[str, None] = "6d87a355bb9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("token_digest", sa.String(length=64), nullable=False),
        sa.Column("global_role", sa.String(length=32), nullable=False),
        sa.Column("disabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_app_users_display_name"), "app_users", ["display_name"], unique=False)
    op.create_index(op.f("ix_app_users_token_digest"), "app_users", ["token_digest"], unique=True)
    op.create_index(op.f("ix_app_users_global_role"), "app_users", ["global_role"], unique=False)
    op.create_index(op.f("ix_app_users_disabled"), "app_users", ["disabled"], unique=False)
    op.create_table(
        "investigation_memberships",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["app_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "investigation_id", name="uq_investigation_membership_user_inv"),
    )
    op.create_index(op.f("ix_investigation_memberships_user_id"), "investigation_memberships", ["user_id"], unique=False)
    op.create_index(op.f("ix_investigation_memberships_investigation_id"), "investigation_memberships", ["investigation_id"], unique=False)
    op.create_index(op.f("ix_investigation_memberships_role"), "investigation_memberships", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_investigation_memberships_role"), table_name="investigation_memberships")
    op.drop_index(op.f("ix_investigation_memberships_investigation_id"), table_name="investigation_memberships")
    op.drop_index(op.f("ix_investigation_memberships_user_id"), table_name="investigation_memberships")
    op.drop_table("investigation_memberships")
    op.drop_index(op.f("ix_app_users_disabled"), table_name="app_users")
    op.drop_index(op.f("ix_app_users_global_role"), table_name="app_users")
    op.drop_index(op.f("ix_app_users_token_digest"), table_name="app_users")
    op.drop_index(op.f("ix_app_users_display_name"), table_name="app_users")
    op.drop_table("app_users")
