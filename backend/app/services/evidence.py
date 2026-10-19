from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Document, Evidence, Source
from app.services.image_reader import NotAPicture, stored_picture
from app.services.security import resolve_storage_root
from app.visuals.data_service import date_bounds


def _require_picture(db: Session, source_id: str, document_id: str) -> None:
    """A picture evidence points at an uploaded picture of its own investigation."""
    document, source = db.get(Document, document_id), db.get(Source, source_id)
    if document is None or source is None or document.investigation_id != source.investigation_id:
        raise ValueError("The picture must be a document of this investigation")
    try:
        stored_picture(document.storage_path, resolve_storage_root(settings.document_storage_dir))
    except NotAPicture as exc:
        raise ValueError(f"The document is not a picture: {exc}") from exc
    except OSError as exc:
        raise ValueError("The picture's stored file is not available") from exc


def create_evidence(db: Session, payload: dict) -> Evidence:
    """Create an Evidence row from a request payload already known to
    reference a valid Source (the caller checks that; this function
    doesn't touch the database except to persist the new row).

    Trims quote/locator/notes and requires at least one to be
    non-empty after trimming. A picture as evidence names an uploaded
    picture of the same investigation (document_id) and may say when it
    was taken (captured_on), which needs the picture. Raises ValueError if the payload has no
    substantive content, mirroring the 400 this previously raised
    inline in the route handler.
    """
    for field in ("quote", "locator", "notes"):
        if payload.get(field) is not None:
            payload[field] = payload[field].strip() or None
    if not any(payload.get(field) for field in ("quote", "locator", "notes")):
        raise ValueError("Evidence requires a quote, locator, or note")
    if payload.get("captured_on") and not payload.get("document_id"):
        raise ValueError("A date taken belongs to a picture: give the picture (document_id) it was taken on")
    if payload.get("captured_on") and date_bounds(payload["captured_on"]) is None:
        raise ValueError(f"{payload['captured_on']!r} is not a date (YYYY, YYYY-MM or YYYY-MM-DD)")
    if payload.get("document_id"):
        _require_picture(db, payload["source_id"], payload["document_id"])
    row = Evidence(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
