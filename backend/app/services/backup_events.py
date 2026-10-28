"""When a backup file was made from a case (ADR-0015): when, its size and SHA-256. The file itself goes to the person
who asked for it; this keeps only the note that it was made."""

from __future__ import annotations

import hashlib
from typing import Any

from sqlalchemy.orm import Session

from app.models.safety import BackupEvent


def record_backup_event(db: Session, investigation_id: str, payload: bytes, manifest: dict[str, Any], with_documents: bool,
                        *, encrypted: bool = False) -> BackupEvent | None:
    """Note that a backup file was made from this case. Called by the export route after the file is built. Never
    raises: the file is the thing the reporter asked for."""
    try:
        row = BackupEvent(
            investigation_id=investigation_id, size_bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
            with_documents=with_documents, record_total=sum(int(v) for v in (manifest.get("record_counts") or {}).values()),
            document_count=len(manifest.get("document_files") or []), encrypted=encrypted,
        )
        db.add(row)
        db.commit()
        return row
    except Exception:  # pragma: no cover
        db.rollback()
        return None
