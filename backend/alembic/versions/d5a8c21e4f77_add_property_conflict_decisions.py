"""add property conflict decisions

Revision ID: d5a8c21e4f77
Revises: c4f7a10d2e91
"""
from alembic import op
import sqlalchemy as sa

revision = "d5a8c21e4f77"
down_revision = "c4f7a10d2e91"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "property_conflict_decisions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("prop", sa.String(length=255), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("values_json", sa.JSON(), nullable=False),
        sa.Column("preferred_value", sa.Text(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("investigation_id", "entity_id", "prop", "decision"):
        op.create_index(op.f(f"ix_property_conflict_decisions_{column}"), "property_conflict_decisions", [column], unique=False)


def downgrade():
    for column in ("decision", "prop", "entity_id", "investigation_id"):
        op.drop_index(op.f(f"ix_property_conflict_decisions_{column}"), table_name="property_conflict_decisions")
    op.drop_table("property_conflict_decisions")
