"""Checking a key without a search, and knowing when an outside source has new data
(docs/project-notes/PLATFORM_NEEDS_PLAN.md, parts 6 and 7). Neither sends a name.

Key check: each connector's check_key() calls an endpoint that needs the key and sends no query (OpenSanctions
/catalog, OpenAleph /api/2/notifications, Firecrawl /v2/team/credit-usage); the result is kept and shown on the
Connector keys card.

Source freshness: every six hours the scheduler asks OpenSanctions for its catalogue (If-None-Match, so an unchanged
catalogue costs a 304) and keeps the version of the dataset the app searches. When it changes, the inbox says so,
and in each case whose OpenSanctions mode is Automatic the parties already looked up there are looked up again,
once, in the background.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.models.domain import ConnectorRun, Entity, Investigation
from app.services import preferences

logger = logging.getLogger("journalism.sources")

MAX_RECHECKS_PER_CASE = 200


# --- Key checks ------------------------------------------------------------------------------------------------

def check_key(db: Session, provider: str) -> dict[str, Any]:
    from app.services.outbound import record_outbound

    connector = registry.get(provider)
    if connector is None:
        raise LookupError("Connector not found")
    try:
        result = asyncio.run(connector.check_key())
        state, detail, credits = result.state, result.detail, result.credits
    except Exception as exc:
        state, detail, credits = "failed", f"The source did not answer: {exc}", None
    if state not in ("no_key", "not_supported"):
        record_outbound(db, kind="key_check", service=provider, destination=preferences.provider_host(connector) or provider,
                        sent="the key only; no search and no names", outcome={"works": "sent", "refused": "refused"}.get(state, "failed"),
                        detail=None if state == "works" else detail)
    value = {"state": state, "detail": detail, "credits": credits, "at": utcnow_naive().isoformat()}
    preferences._put(db, "server", "", f"keycheck:{provider}", value)
    return value


def last_key_check(db: Session, provider: str) -> dict[str, Any] | None:
    row = preferences._get(db, "server", "", f"keycheck:{provider}")
    return dict(row.value) if row and row.value else None


# --- Source freshness ------------------------------------------------------------------------------------------

def _state(db: Session, source: str) -> dict[str, Any]:
    row = preferences._get(db, "server", "", f"source:{source}")
    return dict(row.value or {}) if row else {}


def recent_changes(db: Session, after: datetime) -> list[dict[str, Any]]:
    """The source updates recorded since ``after``, for the inbox."""
    row = preferences._get(db, "server", "", "source_changes")
    out = []
    for c in (row.value or {}).get("changes", []) if row else []:
        try:
            at = datetime.fromisoformat(c["at"])
        except (KeyError, ValueError):
            continue
        if at > after:
            out.append({**c, "at": at})
    return out


def _note_change(db: Session, source: str, label: str, version: str) -> None:
    row = preferences._get(db, "server", "", "source_changes")
    changes = list((row.value or {}).get("changes", [])) if row else []
    changes = (changes + [{"source": source, "label": label, "version": version, "at": utcnow_naive().isoformat()}])[-50:]
    preferences._put(db, "server", "", "source_changes", {"changes": changes})


def check_opensanctions(db: Session) -> str | None:
    """Ask for the catalogue; returns the new version when the searched dataset changed since the last check."""
    from app.services.outbound import record_outbound

    connector = registry.get("opensanctions")
    if connector is None or not getattr(connector, "api_key", "") or not hasattr(connector, "catalog"):
        return None
    state = _state(db, "opensanctions")
    host = preferences.provider_host(connector) or "opensanctions"
    try:
        status, body, etag = asyncio.run(connector.catalog(state.get("etag")))
    except Exception as exc:
        record_outbound(db, kind="source_check", service="opensanctions", destination=host, outcome="failed", detail=str(exc),
                        sent="a request for the list of datasets and their versions; no names")
        return None
    record_outbound(db, kind="source_check", service="opensanctions", destination=host,
                    outcome="sent" if status in (200, 304) else ("refused" if status in (401, 403) else "failed"),
                    sent="a request for the list of datasets and their versions; no names")
    if status != 200:
        return None
    dataset = getattr(connector, "dataset", "default")
    version = next((str(d.get("version") or "") for d in body.get("datasets", []) if isinstance(d, dict) and d.get("name") == dataset), "")
    previous = state.get("version")
    preferences._put(db, "server", "", "source:opensanctions",
                     {"version": version, "etag": etag, "checked_at": utcnow_naive().isoformat(), "dataset": dataset})
    if previous and version and version != previous:
        _note_change(db, "opensanctions", "OpenSanctions", version)
        return version
    return None


def recheck_after_update(db: Session, provider: str) -> list[str]:
    """In each case whose mode for ``provider`` is Automatic, look the parties already looked up there up again."""
    from app.jobs.handlers import OUTSIDE_LOOKUP
    from app.jobs.records import create_job
    from app.services.connectors import entity_query_label
    from app.services.saved_questions import _start

    queued: list[str] = []
    for inv in db.scalars(select(Investigation.id)):
        if preferences.lookup_mode(db, inv, provider) != "automatic":
            continue
        labels = set(db.scalars(select(ConnectorRun.query).where(ConnectorRun.investigation_id == inv, ConnectorRun.provider == provider,
                                                                   ConnectorRun.status == "completed", ConnectorRun.query.like("entity:%"))))
        entities = [e for e in db.scalars(select(Entity).where(Entity.investigation_id == inv)) if entity_query_label(e) in labels]
        for entity in entities[:MAX_RECHECKS_PER_CASE]:
            job = create_job(db, kind=OUTSIDE_LOOKUP, investigation_id=inv, subject_type="entity", subject_id=entity.id,
                             payload={"recheck": [provider]}, message="Waiting to look up again")
            _start(db, job.id)
            queued.append(job.id)
    return queued


def check_sources(db: Session) -> dict[str, Any]:
    changed = check_opensanctions(db)
    queued = recheck_after_update(db, "opensanctions") if changed else []
    return {"opensanctions": changed, "rechecks": len(queued)}
