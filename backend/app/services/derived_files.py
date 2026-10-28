"""Files made from case files, and their edit trail (ADR-0021).

An evidence file is never written over: whatever the Workbench makes from it is a new file under
`<storage>/<case id>/derived/<document id>/` (in the case's own folder, so it goes with the case and its backup), named by its own SHA-256, with a `derived_files` row that names the exact bytes it was
made from, the operation and every setting, the code (and any model) that made it, who asked and when. The same result
made twice is the same file; its row is kept once per request, so the trail shows every time it was asked for.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.derived import DerivedFile
from app.models.documents import Document
from app.services.security import contained_path, resolve_storage_root


class WouldOverwrite(RuntimeError):
    """A derived file would land on a case file."""


def derived_folder(storage_root: str | Path, investigation_id: str, document_id: str) -> Path:
    return contained_path(resolve_storage_root(storage_root), investigation_id, "derived", document_id)


def write_derived(db: Session, *, document: Document, data: bytes, filename: str, mime_type: str, operation: str,
                  params: dict[str, Any], tool: str, parent: DerivedFile | None = None, parent_sha256: str | None = None,
                  model: str | None = None, model_sha256: str | None = None, job_id: str | None = None,
                  created_by: str | None = None) -> DerivedFile:
    """Keep `data` as a file made from `document` (or from `parent`, a file made from it) and add its trail row.
    Never writes over the document's own file. Commits."""
    if parent_sha256 is None:
        parent_sha256 = parent.sha256 if parent is not None else document.sha256
    digest = hashlib.sha256(data).hexdigest()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name) or "derived"
    folder = derived_folder(settings.document_storage_dir, document.investigation_id, document.id)
    folder.mkdir(parents=True, exist_ok=True)
    target = contained_path(folder, f"{digest[:16]}_{safe}")
    if target.resolve() == Path(document.storage_path).resolve():
        raise WouldOverwrite("A derived file may not be written over the case file it was made from")
    if not target.exists():
        staged = target.with_name(f".{target.name}.part")
        staged.write_bytes(data)
        staged.replace(target)
    row = DerivedFile(investigation_id=document.investigation_id, document_id=document.id,
                      parent_id=parent.id if parent is not None else None, parent_sha256=parent_sha256, sha256=digest,
                      size=len(data), mime_type=mime_type, storage_path=str(target), operation=operation, params=params,
                      tool=tool, model=model, model_sha256=model_sha256, job_id=job_id, created_by=created_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def latest(db: Session, document_id: str, operation: str) -> DerivedFile | None:
    from sqlalchemy import select

    return db.scalars(select(DerivedFile).where(DerivedFile.document_id == document_id, DerivedFile.operation == operation)
                      .order_by(DerivedFile.created_at.desc())).first()


def serialize(row: DerivedFile) -> dict[str, Any]:
    return {"id": row.id, "document_id": row.document_id, "parent_id": row.parent_id, "parent_sha256": row.parent_sha256,
            "sha256": row.sha256, "size": row.size, "mime_type": row.mime_type, "operation": row.operation,
            "params": row.params or {}, "tool": row.tool, "model": row.model, "model_sha256": row.model_sha256,
            "job_id": row.job_id, "created_by": row.created_by, "created_at": row.created_at}
