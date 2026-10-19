from __future__ import annotations

from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Evidence, Source


# The kinds of source the capture form offers (frontend features/source-capture).
SOURCE_TYPES = ("web", "document", "interview", "public_record", "social", "other")


def is_web_address(text: str) -> bool:
    """An http or https address with a host, and no spaces in it."""
    parts = urlsplit(text)
    return parts.scheme in ("http", "https") and bool(parts.hostname) and not any(c.isspace() for c in text)


def create_source(db: Session, payload: dict) -> Source:
    """Persist a new Source from a request payload already known to reference
    a valid, lockable Investigation (the caller handles the investigation-scoped
    lock and the 404 existence check before calling this).

    Trims title and url; raises ValueError if title is empty after trimming,
    mirroring the 400 this previously raised inline in the route handler, or
    if a url is given that is not a web address (http or https, with a host).
    """
    title = (payload.get("title") or "").strip()
    if not title:
        raise ValueError("Source title is required")
    payload = dict(payload)
    payload["title"] = title
    if payload.get("url") is not None:
        payload["url"] = payload["url"].strip() or None
    if payload.get("url") is not None and not is_web_address(payload["url"]):
        raise ValueError(f"“{payload['url']}” is not a web address: give one that starts with http:// or https://")
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
