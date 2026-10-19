"""Documents for tests: store one and read it, in one call.

Moved here from app/services/documents.py, where only tests called it. The
upload route takes the same two steps, store_document and then
extract_document as a background job (ADR-0004, decision 6). Both are looked
up on the module at call time, so a test that monkeypatches either one, or
something they call, still reaches this helper.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.models.domain import Document
from app.services import documents


def ingest_document(db: Session, *, investigation_id: str, title: str, filename: str, mime_type: str | None, data: bytes,
                    storage_dir: Path) -> Document:
    doc = documents.store_document(
        db, investigation_id=investigation_id, title=title, filename=filename,
        mime_type=mime_type, data=data, storage_dir=storage_dir,
    )
    return documents.extract_document(db, doc.id) or doc
