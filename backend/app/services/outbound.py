"""The outbound log (ADR-0015): one row for every request that carries case data to a service, written by the code that
sends it and before it goes, so a request that dies on the way is still there. Reading it back is app/services/safety_data.py."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.connectors.base import entity_sent_value
from app.core.time import utcnow_naive
from app.models.domain import Investigation, OutboundRequest

logger = logging.getLogger("journalism.outbound")


def record_outbound(db: Session, investigation_id: str, *, service: str, kind: str, value: str, reason: str = "",
                    actor: str = "you", leaves_computer: bool = True, documents: int = 0,
                    outcome: str = "sent", source: dict[str, Any] | None = None) -> str:
    row = OutboundRequest(investigation_id=investigation_id, service=service, kind=kind, value=value, reason=reason[:500],
                          actor=actor, leaves_computer=leaves_computer, documents=documents, outcome=outcome, source=source)
    db.add(row)
    db.commit()
    return row.id


def mark_outbound_failed(db: Session, request_id: str | None) -> None:
    """The request went and an error came back (or never did): the row stays, saying so. A request the app blocked first stays blocked."""
    row = db.get(OutboundRequest, request_id) if request_id else None
    if row is not None and row.outcome == "sent":
        row.outcome = "failed"
        db.commit()


def record_model_call(db: Session, investigation_id: str, *, provider: str, model: str, module_title: str, records: int,
                      prompt_chars: int, leaves_computer: bool, run_id: str | None) -> str:
    """A call to the AI. The words themselves are on the run's trace; the log says how much went and where."""
    return record_outbound(
        db, investigation_id, service=f"ai:{provider}" if provider else "ai", kind="case text",
        value=f"{records} records from this case, {prompt_chars:,} characters, to {model or provider}",
        reason=module_title, actor="you", leaves_computer=leaves_computer, source={"run_id": run_id} if run_id else None)


def enrich_sent_text(connector: Any, payload: dict) -> str:
    """What an enrichment sends, from the connector itself; a connector that does not say is logged by the record's name and details."""
    say = getattr(connector, "enrich_sent", None)
    return say(payload) if callable(say) else entity_sent_value(payload.get("caption"), payload.get("properties"))


def destination_of(connector: Any) -> str:
    """The host a connector's requests go to, kept in a line's `source` so the log can say where it went."""
    return host_of(str(getattr(connector, "base_url", "") or getattr(connector, "host", "") or ""))


def send_outcome(connector: Any) -> str:
    """"blocked" when the connector will refuse before any request is made (it needs a key and has none): the attempt is logged, but nothing left."""
    return "blocked" if getattr(connector, "requires_key", False) and not getattr(connector, "configured", True) else "sent"


# --- What is not about one case (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 1) -------------------------------
# A mail or push notice, a key or source-update check, a public download: the same table with no case, written in its
# own session so a failed request or a rolled-back transaction still leaves its line, and kept 90 days.

KINDS = ("mail", "push", "key_check", "source_check", "download")
KEEP_DAYS = 90


def host_of(url_or_host: str) -> str:
    text = (url_or_host or "").strip()
    return (urlparse(text).hostname or text) if "://" in text else text


def record_platform_request(db: Session | None, *, kind: str, service: str, destination: str, sent: str,
                            outcome: str = "sent", detail: str | None = None, investigation_id: str | None = None) -> None:
    """Write one line. Never raises: the log must not stop the work it records (a failure is logged instead)."""
    from app.db.session import SessionLocal

    try:
        factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False) if db is not None else SessionLocal
        with factory() as own:
            own.add(OutboundRequest(investigation_id=investigation_id, service=service, kind=kind, value=sent[:4000],
                                    reason=(detail or "")[:500], actor="automatic", leaves_computer=True, outcome=outcome[:16],
                                    source={"destination": host_of(destination)[:255]}))
            own.commit()
    except Exception:
        logger.warning("could not record an outbound request (%s to %s)", kind, service, exc_info=True)


def recent(db: Session, *, days: int = 7, kinds: tuple[str, ...] | None = None,
           investigation_ids: frozenset[str] | None = None, limit: int = 100) -> list[dict[str, Any]]:
    """What left in the last ``days``, newest first, with each case's name. A model on this computer is not counted."""
    query = select(OutboundRequest, Investigation.name).outerjoin(Investigation, Investigation.id == OutboundRequest.investigation_id) \
        .where(OutboundRequest.at > utcnow_naive() - timedelta(days=days), OutboundRequest.leaves_computer.is_(True),
               OutboundRequest.outcome != "blocked")
    if kinds:
        query = query.where(OutboundRequest.kind.in_(kinds))
    if investigation_ids is not None:
        query = query.where(OutboundRequest.investigation_id.in_(investigation_ids))
    rows = db.execute(query.order_by(OutboundRequest.at.desc(), OutboundRequest.id.desc()).limit(limit)).all()
    return [{"id": r.id, "at": r.at, "kind": r.kind, "service": r.service, "destination": (r.source or {}).get("destination") or r.service,
             "sent": r.value, "outcome": r.outcome, "investigation_id": r.investigation_id, "case": name or ""} for r, name in rows]


def prune(db: Session, *, keep_days: int = KEEP_DAYS) -> int:
    """Lines older than ``keep_days`` that belong to no case. A case's own lines travel with the case (ADR-0015)."""
    result = db.execute(delete(OutboundRequest).where(OutboundRequest.investigation_id.is_(None),
                                                      OutboundRequest.at < utcnow_naive() - timedelta(days=keep_days)))
    db.commit()
    return int(getattr(result, "rowcount", 0) or 0)
