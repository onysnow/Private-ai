"""add preferred record to post-merge reconciliation

Revision ID: a3d2e61c8842
Revises: f1c9a2d7b410
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
revision: str = "a3d2e61c8842"
down_revision: Union[str, None] = "f1c9a2d7b410"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column("post_merge_reconciliation_decisions", sa.Column("preferred_record_id", sa.String(), nullable=True))
    op.create_index("ix_post_merge_reconciliation_decisions_preferred_record_id", "post_merge_reconciliation_decisions", ["preferred_record_id"], unique=False)

def downgrade() -> None:
    op.drop_index("ix_post_merge_reconciliation_decisions_preferred_record_id", table_name="post_merge_reconciliation_decisions")
    op.drop_column("post_merge_reconciliation_decisions", "preferred_record_id")
