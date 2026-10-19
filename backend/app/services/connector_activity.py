"""What each outside source has been sent, from the connector runs the app already records (Settings › Outside
lookups "Sent this week", Settings › Connector keys "Last used"). A run keeps the words it sent, or "entity:<id>" for
a party lookup, which is shown as that party's name.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import ConnectorRun, Entity, Investigation


def _refused(error: str | None) -> bool:
    """The source turned the key down (HTTP 401 or 403), as opposed to not answering."""
    text = error or ""
    return any(code in text for code in ("401", "403", "Unauthorized", "Forbidden"))


def _what_was_sent(db: Session, runs: list[ConnectorRun]) -> dict[str, str]:
    """A party lookup is shown by the party's name in the run's own case: the same FtM id can stand for a
    different party in another case, whose name this caller may not be allowed to see."""
    party_runs = [r for r in runs if r.query.startswith("entity:")]
    refs = {r.query[7:] for r in party_runs}
    cases = {r.investigation_id for r in party_runs}
    names: dict[tuple[str, str], str] = {}
    if refs:
        for inv, ftm_id, entity_id, caption in db.execute(
                select(Entity.investigation_id, Entity.ftm_id, Entity.id, Entity.caption)
                .where(Entity.investigation_id.in_(cases), (Entity.ftm_id.in_(refs)) | (Entity.id.in_(refs)))):
            names[(inv, ftm_id or entity_id)] = caption
            names[(inv, entity_id)] = caption
    return {r.id: (names.get((r.investigation_id, r.query[7:]), "a party") if r.query.startswith("entity:") else r.query)
            for r in runs}


def _run_out(r: ConnectorRun, sent: str, case: str | None) -> dict[str, Any]:
    status = "refused" if r.status == "failed" and _refused(r.error) else r.status
    return {"id": r.id, "provider": r.provider, "sent": sent, "is_party": r.query.startswith("entity:"),
            "investigation_id": r.investigation_id, "case": case or "", "status": status,
            "results": r.result_count, "at": r.started_at}


def activity(db: Session, providers: list[str], *, investigation_ids: frozenset[str] | None = None) -> dict[str, Any]:
    """Per source: its last run and the cases it served this month; and every run this week, newest first.
    ``investigation_ids`` limits both to the cases the caller may see."""
    now = utcnow_naive()
    scoped = select(ConnectorRun)
    if investigation_ids is not None:
        scoped = scoped.where(ConnectorRun.investigation_id.in_(investigation_ids))
    names = dict(db.execute(select(Investigation.id, Investigation.name)).all())
    out: dict[str, Any] = {}
    for p in providers:
        last = db.scalar(scoped.where(ConnectorRun.provider == p).order_by(ConnectorRun.started_at.desc()).limit(1))
        cases = db.scalar(select(func.count(func.distinct(ConnectorRun.investigation_id))).where(
            ConnectorRun.provider == p, ConnectorRun.started_at > now - timedelta(days=30),
            *([ConnectorRun.investigation_id.in_(investigation_ids)] if investigation_ids is not None else [])))
        out[p] = {"last": _run_out(last, _what_was_sent(db, [last])[last.id], names.get(last.investigation_id)) if last else None,
                  "cases_this_month": int(cases or 0)}
    week = list(db.scalars(scoped.where(ConnectorRun.provider.in_(providers), ConnectorRun.started_at > now - timedelta(days=7))
                           .order_by(ConnectorRun.started_at.desc()).limit(50)))
    sent = _what_was_sent(db, week)
    return {"providers": out, "week": [_run_out(r, sent[r.id], names.get(r.investigation_id)) for r in week]}
