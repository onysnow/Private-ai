"""The log of what leaves this computer (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 1): every request sent to
an outside source, a remote AI model, a mail or push service or a public download, recorded by the code that sends
it, in words that say what went. Written in its own session, so a failed lookup or a rolled-back request still
leaves its line, and kept 90 days like the security log.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.time import utcnow_naive
from app.models.domain import Investigation, OutboundRequest

logger = logging.getLogger("journalism.outbound")

KINDS = ("lookup", "ai", "mail", "push", "key_check", "source_check", "download")
KEEP_DAYS = 90


def host_of(url_or_host: str) -> str:
    text = (url_or_host or "").strip()
    return (urlparse(text).hostname or text) if "://" in text else text


def record_outbound(db: Session | None, *, kind: str, service: str, destination: str, sent: str,
                    investigation_id: str | None = None, outcome: str = "sent", detail: str | None = None,
                    actor: str | None = None) -> None:
    """Write one line. Never raises: the log must not stop the work it records (a failure is logged instead)."""
    from app.db.session import SessionLocal

    try:
        factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False) if db is not None else SessionLocal
        with factory() as own:
            own.add(OutboundRequest(kind=kind, service=service, destination=host_of(destination)[:255], sent=sent[:4000],
                                    investigation_id=investigation_id, outcome=outcome, detail=(detail or None) and detail[:2000],
                                    actor=actor))
            own.commit()
    except Exception:
        logger.warning("could not record an outbound request (%s to %s)", kind, service, exc_info=True)


def recent(db: Session, *, days: int = 7, kinds: tuple[str, ...] | None = None,
           investigation_ids: frozenset[str] | None = None, limit: int = 100) -> list[dict[str, Any]]:
    """What left in the last ``days``, newest first, with each case's name."""
    query = select(OutboundRequest, Investigation.name).outerjoin(Investigation, Investigation.id == OutboundRequest.investigation_id) \
        .where(OutboundRequest.at > utcnow_naive() - timedelta(days=days))
    if kinds:
        query = query.where(OutboundRequest.kind.in_(kinds))
    if investigation_ids is not None:
        query = query.where(OutboundRequest.investigation_id.in_(investigation_ids))
    rows = db.execute(query.order_by(OutboundRequest.at.desc()).limit(limit)).all()
    return [{"id": r.id, "at": r.at, "kind": r.kind, "service": r.service, "destination": r.destination, "sent": r.sent,
             "outcome": r.outcome, "investigation_id": r.investigation_id, "case": name or ""} for r, name in rows]


def prune(db: Session, *, keep_days: int = KEEP_DAYS) -> int:
    result = db.execute(delete(OutboundRequest).where(OutboundRequest.at < utcnow_naive() - timedelta(days=keep_days)))
    db.commit()
    return int(getattr(result, "rowcount", 0) or 0)
