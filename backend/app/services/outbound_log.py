"""The outbound log: every request that carried case data to an outside service, word for word (ADR-0015, mockup
KEEP-safety-and-data "Outbound log · append-only").

What is written here is only what the app itself sends from a case: an outside lookup (OpenSanctions, Aleph,
Firecrawl) and a call to an AI model. A request to a local service is kept, marked `local`, and is not counted as
leaving. What is NOT logged yet (so the screen never claims more than it knows): traffic to OpenAleph (its calls are
made in several places), the watchlist check and the corpus push. ADR-0015 lists them.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.safety import OutboundRequest

logger = logging.getLogger("journalism.outbound_log")

PERIODS = {"today": timedelta(days=1), "7d": timedelta(days=7), "30d": timedelta(days=30), "all": None}
ACTOR_CLICK = "you clicked"
ACTOR_AUTOMATIC = "automatic check"
# "sent" and "failed" both count: a failed call may still have reached the service. "not_sent" never left.
LEFT = ("sent", "failed")


def period_start(period: str) -> datetime | None:
    if period not in PERIODS:
        raise ValueError(f"Unknown period: {period}")
    delta = PERIODS[period]
    return None if delta is None else utcnow_naive() - delta


def record_outbound(
    db: Session, *, investigation_id: str, service: str, destination: str, local: bool, value_sent: str,
    value_kind: str, reason: str, actor: str = ACTOR_CLICK, status: str = "sent", error: str | None = None,
    run_id: str | None = None, detail: dict | None = None,
) -> OutboundRequest | None:
    """Write one log row. Never raises: the request has already gone (or failed), and losing the lookup's answer
    because its log line could not be written would be worse. A failure to log is itself logged."""
    try:
        row = OutboundRequest(
            investigation_id=investigation_id, service=service, destination=destination[:255], local=local,
            value_sent=value_sent, value_kind=value_kind[:64], reason=reason[:64], actor=actor, status=status,
            error=(error or None) and error[:2000], run_id=run_id, detail=detail,
        )
        db.add(row)
        db.commit()
        return row
    except Exception:  # pragma: no cover - exercised by test_outbound_log_failure_does_not_break
        db.rollback()
        logger.exception("could not write the outbound log for %s", service)
        return None


def _filtered(investigation_id: str, period: str, service: str | None) -> Select[Any]:
    query = select(OutboundRequest).where(OutboundRequest.investigation_id == investigation_id)
    start = period_start(period)
    if start is not None:
        query = query.where(OutboundRequest.at >= start)
    if service:
        query = query.where(OutboundRequest.service == service)
    return query


def list_outbound(db: Session, investigation_id: str, *, period: str = "7d", service: str | None = None,
                  limit: int = 200, outside_only: bool = True) -> dict[str, Any]:
    """The log newest first. By default only requests that left this computer: the log is what left."""
    query = _filtered(investigation_id, period, service)
    if outside_only:
        query = query.where(OutboundRequest.local.is_(False))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(db.scalars(query.order_by(OutboundRequest.at.desc(), OutboundRequest.id.desc()).limit(max(1, min(limit, 1000)))).all())
    return {"period": period, "service": service, "total": total, "entries": rows}


def outbound_totals(db: Session, investigation_id: str, *, period: str = "7d") -> dict[str, int]:
    """The summary line: requests that left this computer, services reached, AI calls outside."""
    sub = _filtered(investigation_id, period, None).where(OutboundRequest.local.is_(False), OutboundRequest.status.in_(LEFT)).subquery()
    rows = db.execute(select(sub.c.service, func.count()).group_by(sub.c.service)).all()
    by_service = {service: count for service, count in rows}
    return {
        "requests_left": sum(by_service.values()),
        "services_reached": len(by_service),
        "ai_calls_outside": by_service.get("ai", 0),
    }


def per_service_counts(db: Session, investigation_id: str, *, period: str = "7d") -> dict[str, dict[str, Any]]:
    query = _filtered(investigation_id, period, None).where(OutboundRequest.local.is_(False), OutboundRequest.status.in_(LEFT))
    sub = query.subquery()
    rows = db.execute(select(sub.c.service, func.count(), func.max(sub.c.at)).group_by(sub.c.service)).all()
    kinds = db.execute(select(sub.c.service, sub.c.value_kind).distinct()).all()
    by_kind: dict[str, list[str]] = {}
    for service, kind in kinds:
        by_kind.setdefault(service, []).append(kind)
    return {service: {"count": count, "last": last, "kinds": sorted(by_kind.get(service, []))} for service, count, last in rows}


CSV_COLUMNS = ["time_utc", "service", "destination", "left_this_computer", "value_sent", "kind_of_value", "reason", "who_started_it", "status", "error", "run_id"]


def outbound_csv(db: Session, investigation_id: str, *, period: str = "all", service: str | None = None) -> str:
    """The log as CSV, every row (including requests to local services, marked) for a source-protection file."""
    rows = db.scalars(_filtered(investigation_id, period, service).order_by(OutboundRequest.at.asc(), OutboundRequest.id.asc())).all()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow([_csv_safe(v) for v in (
            r.at.isoformat(timespec="seconds") + "Z", r.service, r.destination, "no" if r.local else "yes", r.value_sent,
            r.value_kind, r.reason, r.actor, r.status, r.error or "", r.run_id or "",
        )])
    return out.getvalue()


def _csv_safe(value: str) -> str:
    """A cell that starts with = + - @ would run as a formula in a spreadsheet; the value sent is outside text."""
    text = str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text
