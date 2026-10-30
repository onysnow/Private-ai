"""documents.kind and documents.language, each with how it was set (BACKLOG "Documents have no kind or language
field"; app/services/document_facts.py). Documents already in a case get them where the app knows: the kind and
language their source's record states, else the kind their file type gives, and the language detected in their text.

Revision ID: a8d2f6c4e913
Revises: e6c1b4d8a352
"""
import re

import sqlalchemy as sa

from alembic import op

revision = "a8d2f6c4e913"
down_revision = "e6c1b4d8a352"
branch_labels = None
depends_on = None

COLUMNS = (
    ("kind", sa.String(length=32)), ("kind_set_by", sa.String(length=16)), ("kind_by", sa.String(length=255)),
    ("language", sa.String(length=16)), ("language_set_by", sa.String(length=16)), ("language_by", sa.String(length=255)),
    ("language_confidence", sa.Float()),
)


def upgrade():
    with op.batch_alter_table("documents") as batch:
        for name, type_ in COLUMNS:
            batch.add_column(sa.Column(name, type_, nullable=True))
        batch.create_index("ix_documents_kind", ["kind"])
        batch.create_index("ix_documents_language", ["language"])
    _fill_existing()


def downgrade():
    with op.batch_alter_table("documents") as batch:
        batch.drop_index("ix_documents_language")
        batch.drop_index("ix_documents_kind")
        for name, _ in reversed(COLUMNS):
            batch.drop_column(name)


def _fill_existing():
    from app.services.document_facts import (
        DETECTOR,
        detect_language,
        kind_from_file,
        kind_word,
    )

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT d.id, d.filename, d.mime_type, s.metadata_json FROM documents d "
                                "LEFT JOIN sources s ON s.id = d.source_id")).mappings().all()
    for row in rows:
        meta = row["metadata_json"]
        if isinstance(meta, str):
            import json

            try:
                meta = json.loads(meta)
            except ValueError:
                meta = {}
        meta = meta if isinstance(meta, dict) else {}
        values: dict = {}
        stated = kind_word(meta.get("kind"))
        found = None if stated else kind_from_file(row["filename"], row["mime_type"], capture=bool(meta.get("capture_id")))
        if stated or found:
            values.update(kind=stated or found, kind_set_by="source" if stated else "reader")
        language = meta.get("language")
        if isinstance(language, str) and re.fullmatch(r"[A-Za-z]{2}([-_][A-Za-z0-9]+)?", language.strip()):
            values.update(language=language.strip()[:2].lower(), language_set_by="source")
        else:
            texts = bind.execute(sa.text("SELECT text FROM document_chunks WHERE document_id = :d ORDER BY ordinal LIMIT 40"),
                                 {"d": row["id"]}).scalars().all()
            detected = detect_language(texts) if texts else None
            if detected:
                values.update(language=detected[0], language_set_by="detected", language_by=DETECTOR,
                              language_confidence=round(detected[1], 3))
        if values:
            sets = ", ".join(f"{k} = :{k}" for k in values)
            bind.execute(sa.text(f"UPDATE documents SET {sets} WHERE id = :id"), {**values, "id": row["id"]})
