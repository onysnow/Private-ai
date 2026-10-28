"""document_media and transcript_segments: recordings read as documents, transcribed here; who heard a recording's quote (ADR-0020)

Revision ID: c5a9e3b72d14
Revises: b8e2d4f61a07
"""
from alembic import op
import sqlalchemy as sa

revision = "c5a9e3b72d14"
down_revision = "b8e2d4f61a07"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_media",
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("streams", sa.JSON(), nullable=False),
        sa.Column("outline", sa.JSON(), nullable=False),
        sa.Column("outline_step", sa.Float(), nullable=False),
        sa.Column("transcript", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_document_media_investigation_id", "document_media", ["investigation_id"])
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("chunk_id", sa.String(), sa.ForeignKey("document_chunks.id"), nullable=True),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("start", sa.Float(), nullable=False),
        sa.Column("end", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("words", sa.JSON(), nullable=False),
        sa.Column("avg_logprob", sa.Float(), nullable=True),
        sa.Column("no_speech_prob", sa.Float(), nullable=True),
        sa.Column("speaker", sa.String(64), nullable=True),
    )
    op.create_index("ix_transcript_segments_investigation_id", "transcript_segments", ["investigation_id"])
    op.create_index("ix_transcript_segments_document_id", "transcript_segments", ["document_id"])
    op.create_index("ix_transcript_segments_chunk_id", "transcript_segments", ["chunk_id"])
    # A recording's quote is saved only once a person has heard the part: who and when.
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(sa.Column("heard_by", sa.String(255), nullable=True))
        batch.add_column(sa.Column("heard_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("evidence") as batch:
        batch.drop_column("heard_at")
        batch.drop_column("heard_by")
    op.drop_table("transcript_segments")
    op.drop_table("document_media")
