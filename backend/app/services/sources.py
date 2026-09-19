from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Evidence, Source


def create_source(db: Session, payload: dict) -> Source:
    """Persist a new Source from a request payload already known to reference
    a valid, lockable Investigation (the caller handles the investigation-scoped
    lock and the 404 existence check before calling this).

    Trims title and url; raises ValueError if title is empty after trimming,
    mirroring the 400 this previously raised inline in the route handler.
    """
    title = (payload.get("title") or "").strip()
    if not title:
        raise ValueError("Source title is required")
    payload = dict(payload)
    payload["title"] = title
    if payload.get("url") is not None:
        payload["url"] = payload["url"].strip() or None
    row = Source(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_source_evidence(db: Session, source_id: str) -> list[Evidence]:
    """Return all Evidence rows attached to a Source (the caller confirms the
    Source exists first -- a 404 concern, not this function's)."""
    # db.scalars(...).all() is typed Sequence[Evidence]; wrap for the declared list[Evidence] return type.
    return list(db.scalars(select(Evidence).where(Evidence.source_id == source_id)).all())
