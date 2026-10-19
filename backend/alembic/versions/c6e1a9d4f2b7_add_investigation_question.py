"""add investigations.question (the case's own question, shown above the
standing numbers on Case home; Workbench-redesign-2026.pdf, "The case home"),
claim_review_events.override_reason / unmet_rules (the Done rules for Supported), and
check_items.record_type / record_id / blocks / lead_id (missing values)

Revision ID: c6e1a9d4f2b7
Revises: b5d8f3a1c720
"""
from alembic import op
import sqlalchemy as sa

revision = "c6e1a9d4f2b7"
down_revision = "b5d8f3a1c720"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("investigations", sa.Column("question", sa.Text(), nullable=True))
    # Definition of done for Supported (app/services/claim_done.py): an override's reason.
    op.add_column("claim_review_events", sa.Column("override_reason", sa.Text(), nullable=True))
    op.add_column("claim_review_events", sa.Column("unmet_rules", sa.JSON(), nullable=True))
    # Missing values (app/patterns/missing.py) are To check items of kind "missing" on a record.
    with op.batch_alter_table("check_items") as batch:
        batch.add_column(sa.Column("record_type", sa.String(length=16), nullable=True))
        batch.add_column(sa.Column("record_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("blocks", sa.Text(), nullable=True))
        batch.add_column(sa.Column("lead_id", sa.String(), nullable=True))
        batch.create_index("ix_check_items_record_id", ["record_id"])
        batch.create_foreign_key("fk_check_items_lead_id", "leads", ["lead_id"], ["id"])


def downgrade():
    with op.batch_alter_table("check_items") as batch:
        batch.drop_constraint("fk_check_items_lead_id", type_="foreignkey")
        batch.drop_index("ix_check_items_record_id")
        for column in ("lead_id", "blocks", "record_id", "record_type"):
            batch.drop_column(column)
    with op.batch_alter_table("claim_review_events") as batch:
        batch.drop_column("unmet_rules")
        batch.drop_column("override_reason")
    with op.batch_alter_table("investigations") as batch:
        batch.drop_column("question")
