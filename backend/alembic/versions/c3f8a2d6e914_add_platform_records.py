"""what leaves the computer, saved questions, notifications delivered outside the app, push subscriptions; when an
import finished (docs/project-notes/PLATFORM_NEEDS_PLAN.md)

Revision ID: c3f8a2d6e914
Revises: b3f7d2a9c615
"""
from alembic import op
import sqlalchemy as sa

revision = "c3f8a2d6e914"
down_revision = "b3f7d2a9c615"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "outbound_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("sent", sa.Text(), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("actor", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_outbound_requests_at", "outbound_requests", ["at"])
    op.create_index("ix_outbound_requests_investigation_id", "outbound_requests", ["investigation_id"])
    op.create_index("ix_outbound_requests_kind", "outbound_requests", ["kind"])
    op.create_table(
        "saved_questions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("module", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("working_theory", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_run_id", sa.String(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_batch_id", sa.String(), nullable=True),
    )
    op.create_index("ix_saved_questions_investigation_id", "saved_questions", ["investigation_id"])
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("person", sa.String(length=255), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("row_key", sa.String(length=255), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.UniqueConstraint("person", "channel", "row_key", name="uq_notification_delivery"),
    )
    op.create_index("ix_notification_deliveries_person", "notification_deliveries", ["person"])
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("person", sa.String(length=255), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("keys", sa.JSON(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
    )
    op.create_index("ix_push_subscriptions_person", "push_subscriptions", ["person"])
    op.add_column("ingestion_batches", sa.Column("finished_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("ingestion_batches") as batch:
        batch.drop_column("finished_at")
    op.drop_table("push_subscriptions")
    op.drop_table("notification_deliveries")
    op.drop_table("saved_questions")
    op.drop_table("outbound_requests")
