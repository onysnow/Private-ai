"""what the app could only work out each time, now kept: each quote's anchor in its passage (ADR-0015), who made
each decision, how legible each OCR'd page was, and when the case was last backed up (mockups CHECK_2, KEEP_2)

Revision ID: b3f7d2a9c615
Revises: b7d4e2a9c615
"""
from alembic import op
import sqlalchemy as sa

revision = "b3f7d2a9c615"
down_revision = "b7d4e2a9c615"
branch_labels = None
depends_on = None

DECISIONS = ("claim_review_events", "claim_evidence_links", "extraction_candidates")


def upgrade():
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(sa.Column("anchor", sa.JSON(), nullable=True))
    with op.batch_alter_table("document_chunks") as batch:
        batch.add_column(sa.Column("ocr_legibility", sa.Float(), nullable=True))
    with op.batch_alter_table("investigations") as batch:
        batch.add_column(sa.Column("last_backup", sa.JSON(), nullable=True))
    for table in DECISIONS:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("decided_by_id", sa.String(), nullable=True))
            batch.add_column(sa.Column("decided_by_name", sa.String(length=255), nullable=True))
    _anchor_existing_quotes()


def downgrade():
    for table in reversed(DECISIONS):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("decided_by_name")
            batch.drop_column("decided_by_id")
    with op.batch_alter_table("investigations") as batch:
        batch.drop_column("last_backup")
    with op.batch_alter_table("document_chunks") as batch:
        batch.drop_column("ocr_legibility")
    with op.batch_alter_table("evidence") as batch:
        batch.drop_column("anchor")


def _anchor_existing_quotes():
    """Anchor the quotes already in the case, the same way a new one is anchored (app/services/anchor_text.py)."""
    from datetime import datetime, timezone

    from app.services.anchor_text import find_anchor

    bind = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    rows = bind.execute(sa.text(
        "SELECT e.id, e.quote, e.locator, e.document_id, s.id AS source_id, s.source_type FROM evidence e "
        "LEFT JOIN sources s ON s.id = e.source_id WHERE e.quote IS NOT NULL AND e.quote <> ''")).mappings().all()
    for row in rows:
        document_id = row["document_id"]
        if document_id is None and row["source_type"] == "document":
            document_id = bind.execute(sa.text("SELECT id FROM documents WHERE source_id = :s ORDER BY created_at LIMIT 1"),
                                       {"s": row["source_id"]}).scalar()
        if document_id is None:
            continue
        chunks = bind.execute(sa.text("SELECT id, locator, page_number, text FROM document_chunks WHERE document_id = :d ORDER BY ordinal"),
                              {"d": document_id}).mappings().all()
        anchor = find_anchor([dict(c) for c in chunks], row["quote"], locator=row["locator"])
        if anchor is None:
            continue
        anchor = {**anchor, "document_id": document_id, "anchored_at": now}
        bind.execute(sa.text("UPDATE evidence SET anchor = :a WHERE id = :i").bindparams(sa.bindparam("a", type_=sa.JSON)),
                     {"a": anchor, "i": row["id"]})
