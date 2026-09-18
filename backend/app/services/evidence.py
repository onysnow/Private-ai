from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.domain import Evidence


def create_evidence(db: Session, payload: dict) -> Evidence:
    """Create an Evidence row from a request payload already known to
    reference a valid Source (the caller checks that; this function
    doesn't touch the database except to persist the new row).

    Trims quote/locator/notes and requires at least one to be
    non-empty after trimming. Raises ValueError if the payload has no
    substantive content, mirroring the 400 this previously raised
    inline in the route handler.
    """
    for field in ("quote", "locator", "notes"):
        if payload.get(field) is not None:
            payload[field] = payload[field].strip() or None
    if not any(payload.get(field) for field in ("quote", "locator", "notes")):
        raise ValueError("Evidence requires a quote, locator, or note")
    row = Evidence(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
