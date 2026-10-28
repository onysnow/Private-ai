"""Watches on facts (Settings › Notifications, "Watches on facts"): "tell me if this claim's status changes", "tell me
if this Red Flag's level changes". Nothing is pushed: each read compares the record's value now with the value when
the watch was last seen, so a change made by any path shows, and a change undone stops showing.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Claim, Entity, FactWatch, PatternFlag
from app.patterns.engine import indicator

RECORD_TYPES = ("claim", "red_flag")

CLAIM_WORDS = {"lead": "Lead", "unverified": "Not yet shown", "supported": "Supported", "confirmed": "Confirmed",
               "disputed": "Disputed", "rejected": "Rejected"}
FLAG_WORDS = {"faint": "Faint", "strong": "Strong", "textbook": "Textbook", "set_aside": "Set aside", "gone": "No longer fires"}


def _flag_value(flag: PatternFlag) -> str:
    if flag.gone_at is not None:
        return "gone"
    if flag.status == "dismissed":
        return "set_aside"
    return flag.level


def current(db: Session, record_type: str, record_id: str) -> tuple[str, str, str] | None:
    """(investigation id, the value now, what the record is called), or None when it is not there."""
    if record_type == "claim":
        claim = db.get(Claim, record_id)
        if claim is None:
            return None
        return claim.investigation_id, claim.status, claim.text if len(claim.text) <= 120 else claim.text[:119] + "…"
    if record_type == "red_flag":
        flag = db.get(PatternFlag, record_id)
        if flag is None:
            return None
        found = indicator(flag.indicator_id)
        name = found[0].name if found else flag.indicator_id
        parties = [e.caption for e in db.scalars(select(Entity).where(Entity.id.in_(list(flag.parties or [])[:3])))]
        return flag.investigation_id, _flag_value(flag), f"{name}" + (f" · {', '.join(parties)}" if parties else "")
    return None


def words(record_type: str, value: str) -> str:
    table = CLAIM_WORDS if record_type == "claim" else FLAG_WORDS
    return table.get(value, value.replace("_", " ").capitalize())


def describe(db: Session, watch: FactWatch) -> dict[str, Any]:
    now = current(db, watch.record_type, watch.record_id)
    value = now[1] if now else "deleted"
    return {
        "id": watch.id, "investigation_id": watch.investigation_id, "record_type": watch.record_type,
        "record_id": watch.record_id, "label": now[2] if now else "(deleted)",
        "baseline": watch.baseline, "baseline_words": words(watch.record_type, watch.baseline),
        "value": value, "value_words": "Deleted" if not now else words(watch.record_type, value),
        "changed": value != watch.baseline, "created_at": watch.created_at, "seen_at": watch.seen_at,
    }


def create(db: Session, owner: str, record_type: str, record_id: str) -> FactWatch:
    if record_type not in RECORD_TYPES:
        raise ValueError("Only a claim or a Red Flag can be watched")
    now = current(db, record_type, record_id)
    if now is None:
        raise LookupError("Record not found")
    row = db.scalar(select(FactWatch).where(FactWatch.owner == owner, FactWatch.record_type == record_type,
                                            FactWatch.record_id == record_id))
    if row is None:
        row = FactWatch(investigation_id=now[0], owner=owner, record_type=record_type, record_id=record_id, baseline=now[1])
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def listing(db: Session, owner: str, investigation_id: str | None = None) -> list[dict[str, Any]]:
    query = select(FactWatch).where(FactWatch.owner == owner)
    if investigation_id:
        query = query.where(FactWatch.investigation_id == investigation_id)
    return [describe(db, w) for w in db.scalars(query.order_by(FactWatch.created_at))]


def seen(db: Session, watch: FactWatch) -> dict[str, Any]:
    now = current(db, watch.record_type, watch.record_id)
    watch.baseline = now[1] if now else "deleted"
    watch.seen_at = utcnow_naive()
    db.commit()
    return describe(db, watch)
