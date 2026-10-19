"""Putting a decision off (Workbench-redesign-2026.pdf, Check §3.1 keyboard: "H later (snooze, wakes on new
activity — Linear)"; Needs: "a small decision_snooze table (kind, id, until, wake_on_activity) for H").

A decision put off leaves the queue until the time set passes, or, when it wakes on activity, until the item
changes: what it asks, proposes, rests on, who it names, what its answers do or its flag's level. The item as it
read is kept as a digest when it is put off; the list compares the item as it reads now. Reading never writes: a
decision that woke stays woken (it reads as changed, or its time has passed) until it is put off again."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import DecisionSnooze

# The parts of an item that are its activity (case_home's readers build them).
DIGESTED = ("question", "proposal", "reason", "level", "evidence", "parties", "consequences", "choices")


def digest(item: dict[str, Any]) -> str:
    body = {k: item.get(k) for k in DIGESTED}
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[:32]


def _naive(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def rows(db: Session, investigation_id: str) -> dict[tuple[str, str], DecisionSnooze]:
    return {(r.kind, r.item_id): r for r in db.scalars(select(DecisionSnooze).where(DecisionSnooze.investigation_id == investigation_id))}


def state(row: DecisionSnooze, item: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Asleep, or woke and why."""
    why = None
    if row.until is not None and now >= row.until:
        why = "The time you set has come."
    elif row.wake_on_activity and digest(item) != row.digest:
        why = "It changed since you put it off."
    return {"state": "woke" if why else "asleep", "until": row.until, "wake_on_activity": row.wake_on_activity,
            "snoozed_at": row.created_at, "why": why}


def _item(db: Session, investigation_id: str, kind: str, item_id: str) -> dict[str, Any] | None:
    from app.services.case_home import pending_items

    return next((i for i in pending_items(db, investigation_id, kind) if i["id"] == item_id), None)


def out(row: DecisionSnooze) -> dict[str, Any]:
    return {"investigation_id": row.investigation_id, "kind": row.kind, "item_id": row.item_id, "until": row.until,
            "wake_on_activity": row.wake_on_activity, "snoozed_at": row.created_at, "question": row.question}


def snooze(db: Session, investigation_id: str, kind: str, item_id: str, *, until: datetime | None,
           wake_on_activity: bool) -> dict[str, Any]:
    """Puts a waiting decision off; putting it off again replaces the earlier one."""
    until = _naive(until)
    if until is None and not wake_on_activity:
        raise ValueError("Say when it comes back: at a time, when it changes, or both")
    now = utcnow_naive()
    if until is not None and until <= now:
        raise ValueError("The time it comes back must be later than now")
    item = _item(db, investigation_id, kind, item_id)
    if item is None:
        raise LookupError("Nothing waits under that id; it may already be decided")
    row = db.scalar(select(DecisionSnooze).where(DecisionSnooze.investigation_id == investigation_id, DecisionSnooze.kind == kind,
                                                 DecisionSnooze.item_id == item_id))
    if row is None:
        row = DecisionSnooze(investigation_id=investigation_id, kind=kind, item_id=item_id)
        db.add(row)
    row.until, row.wake_on_activity, row.digest = until, wake_on_activity, digest(item)
    row.question, row.created_at = item["question"], now
    db.commit()
    return out(row)


def wake(db: Session, investigation_id: str, kind: str, item_id: str) -> dict[str, Any]:
    """Brings a decision back now (Restore, or Z after H)."""
    row = db.scalar(select(DecisionSnooze).where(DecisionSnooze.investigation_id == investigation_id, DecisionSnooze.kind == kind,
                                                 DecisionSnooze.item_id == item_id))
    if row is not None:
        db.delete(row)
        db.commit()
    return {"investigation_id": investigation_id, "kind": kind, "item_id": item_id, "woke": row is not None}
