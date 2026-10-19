"""Safety & data: outbound_log (what left this computer, word for word), service_modes (Off / Ask first / Automatic
per case and service), safety_answers (the reporter's private answers) and backup_events (research Keep §7, §8, §13, §14)

Revision ID: c4f8a2d6e913
Revises: d3a7c9e15b48
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f8a2d6e913"
down_revision = "d3a7c9e15b48"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("outbound_log",
        sa.Column("id", sa.String(), nullable=False), sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False), sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("value_sent", sa.Text(), nullable=False), sa.Column("value_kind", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False), sa.Column("started_by", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.String(length=255), nullable=True), sa.Column("documents_sent", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_outbound_log_investigation_id"), "outbound_log", ["investigation_id"], unique=False)
    op.create_index(op.f("ix_outbound_log_service"), "outbound_log", ["service"], unique=False)
    op.create_index(op.f("ix_outbound_log_created_at"), "outbound_log", ["created_at"], unique=False)

    op.create_table("service_modes",
        sa.Column("id", sa.String(), nullable=False), sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False), sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "service", name="uq_service_mode_investigation_service"))
    op.create_index(op.f("ix_service_modes_investigation_id"), "service_modes", ["investigation_id"], unique=False)

    op.create_table("safety_answers",
        sa.Column("id", sa.String(), nullable=False), sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("question", sa.String(length=32), nullable=False), sa.Column("answer", sa.String(length=16), nullable=False),
        sa.Column("answered_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id", "question", name="uq_safety_answer_investigation_question"))
    op.create_index(op.f("ix_safety_answers_investigation_id"), "safety_answers", ["investigation_id"], unique=False)

    op.create_table("backup_events",
        sa.Column("id", sa.String(), nullable=False), sa.Column("investigation_id", sa.String(), nullable=False),
        sa.Column("made_at", sa.DateTime(), nullable=False), sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False), sa.Column("record_total", sa.Integer(), nullable=False),
        sa.Column("document_files", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_backup_events_investigation_id"), "backup_events", ["investigation_id"], unique=False)
    op.create_index(op.f("ix_backup_events_made_at"), "backup_events", ["made_at"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_backup_events_made_at"), table_name="backup_events")
    op.drop_index(op.f("ix_backup_events_investigation_id"), table_name="backup_events")
    op.drop_table("backup_events")
    op.drop_index(op.f("ix_safety_answers_investigation_id"), table_name="safety_answers")
    op.drop_table("safety_answers")
    op.drop_index(op.f("ix_service_modes_investigation_id"), table_name="service_modes")
    op.drop_table("service_modes")
    op.drop_index(op.f("ix_outbound_log_created_at"), table_name="outbound_log")
    op.drop_index(op.f("ix_outbound_log_service"), table_name="outbound_log")
    op.drop_index(op.f("ix_outbound_log_investigation_id"), table_name="outbound_log")
    op.drop_table("outbound_log")
