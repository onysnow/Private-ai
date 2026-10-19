"""Connector execution and finding-persistence logic shared by the
/connectors routes (STRUCT-0002/0008 Stage E group 3) and the
/entities/{id}/enrich* routes (app/api/routes_entities.py, group 7)
-- both call into a real external connector and persist its findings
the same way, so this lives here rather than in either route module.

These functions raise HTTPException directly rather than
ValueError/LookupError, unlike most other service functions in this
codebase: `run_connector` and `enrich_entity` need to distinguish a
404 (bad investigation/connector/entity id) from a 502 (the connector
itself failed at runtime), and HTTPException already carries that
distinction cleanly. This is a deliberate, narrow exception to the
project's usual ValueError-based service convention, kept narrow to
this one connector-orchestration concern.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from typing import Sequence

from app.connectors.base import ExternalFinding, host_of, will_send
from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.models.domain import (
    ConnectorFinding, ConnectorRun, Entity, Investigation, Lead, LeadProfile, LeadWorkflowEvent,
)
from app.ai.llm_client import is_local_endpoint
from app.schemas.api import ConnectorSearchRequest
from app.services.outbound_log import record_outbound


def persist_connector_findings(db: Session, run: ConnectorRun, investigation_id: str, provider: str, findings: Sequence[ExternalFinding]) -> list[ConnectorFinding]:
    rows = []
    for finding in findings:
        existing = db.scalar(select(ConnectorFinding).where(
            ConnectorFinding.investigation_id == investigation_id,
            ConnectorFinding.provider == provider,
            ConnectorFinding.provider_record_id == finding.record_id,
        ))
        if existing:
            rows.append(existing)
            continue
        row = ConnectorFinding(
            investigation_id=investigation_id, run_id=run.id, provider=provider,
            provider_record_id=finding.record_id, caption=finding.caption, schema=finding.schema,
            properties=finding.properties or {}, source_url=finding.url, raw=finding.raw or {},
        )
        db.add(row); rows.append(row)
        lead = Lead(
            investigation_id=investigation_id, title=finding.caption, detail=finding.url,
            provider=provider, provider_record_id=finding.record_id,
        )
        db.add(lead); db.flush()
        db.add(LeadProfile(lead_id=lead.id, priority="normal"))
        db.add(LeadWorkflowEvent(lead_id=lead.id, from_status=None, to_status=lead.status, note=f"Created from {provider} connector finding"))
    run.status = "completed"
    run.result_count = len(rows)
    run.finished_at = utcnow_naive()
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def _fail_run(db: Session, run_id: str, exc: Exception) -> None:
    """Mark a run failed after an error, even when the error left the session unusable.

    A failed flush (for example a value longer than its column) poisons the
    session. Committing it here would save the half-built rows and raise again,
    leaving the run stuck at "running". Roll back first, then reload the run.
    """
    db.rollback()
    run = db.get(ConnectorRun, run_id)
    if run is None:
        return
    run.status = "failed"
    run.error = str(exc)[:2000]
    run.finished_at = utcnow_naive()
    db.commit()


def log_connector_send(db: Session, connector: Any, provider: str, investigation_id: str, *, run_id: str, reason: str,
                       query: str | None = None, entity: dict | None = None, error: Exception | None = None) -> None:
    """Write the outbound log line for one connector call, with exactly the value it sent (ADR-0015). Every connector
    call is something the reporter clicked; there is no automatic lookup. A provider that needs a key and has none
    never sends, and an enrichment with nothing to ask sends nothing: both are logged as not sent."""
    # A connector is anything with search/enrich; one that does not describe its request (a test double, a plug-in)
    # is logged by its search words, or by the entity's caption.
    if hasattr(connector, "request_preview"):
        value, kind = connector.request_preview(query=query, entity=entity)
    else:
        value, kind = (query or "", "search words") if entity is None else (str(entity.get("caption") or ""), "name and details")
    destination = host_of(connector, provider)
    if not will_send(connector):
        status, why = "not_sent", "No key is set for this service, so nothing was sent."
    elif not value.strip():
        status, why = "not_sent", "There was nothing to ask, so nothing was sent."
    elif error is not None:
        status, why = "failed", str(error)
    else:
        status, why = "sent", None
    record_outbound(
        db, investigation_id=investigation_id, service=provider, destination=destination,
        local=is_local_endpoint(destination) if destination.startswith("http") else False,
        value_sent=value, value_kind=kind, reason=reason, status=status, error=why, run_id=run_id,
    )


async def run_connector(provider: str, body: ConnectorSearchRequest, db: Session) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    connector = registry.get(provider)
    if connector is None:
        raise HTTPException(404, "Connector not found")
    run = ConnectorRun(investigation_id=body.investigation_id, provider=provider, query=body.query)
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    try:
        findings = await connector.search(body.query)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        log_connector_send(db, connector, provider, body.investigation_id, run_id=run_id, reason="lookup", query=body.query, error=exc)
        raise HTTPException(
            502, f"{provider} connector failed. Details were logged server-side (connector run {run_id})."
        ) from exc
    log_connector_send(db, connector, provider, body.investigation_id, run_id=run_id, reason="lookup", query=body.query)
    try:
        return persist_connector_findings(db, run, body.investigation_id, provider, findings)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        # Full exception text/class is persisted on the ConnectorRun row (run.error) rather than
        # echoed into the client-facing response (STRUCT-0028).
        raise HTTPException(
            502, f"{provider} connector failed. Details were logged server-side (connector run {run_id})."
        ) from exc


async def enrich_entity(provider: str, entity: Entity, db: Session) -> Any:
    connector = registry.get(provider)
    if connector is None:
        raise HTTPException(404, "Connector not found")
    query_label = f"entity:{entity.ftm_id or entity.id}"
    run = ConnectorRun(
        investigation_id=entity.investigation_id, provider=provider, query=query_label,
    )
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    sent_entity = {
        "id": entity.ftm_id,
        "schema": entity.schema,
        "caption": entity.caption,
        "properties": entity.properties or {},
    }
    investigation_id = entity.investigation_id
    try:
        findings = await connector.enrich(sent_entity)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        log_connector_send(db, connector, provider, investigation_id, run_id=run_id, reason="enrich", entity=sent_entity, error=exc)
        raise HTTPException(
            502, f"{provider} enrichment failed. Details were logged server-side (connector run {run_id})."
        ) from exc
    log_connector_send(db, connector, provider, investigation_id, run_id=run_id, reason="enrich", entity=sent_entity)
    try:
        return persist_connector_findings(db, run, investigation_id, provider, findings)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        # Full exception text/class is persisted on the ConnectorRun row (run.error) rather than
        # echoed into the client-facing response (STRUCT-0028).
        raise HTTPException(
            502, f"{provider} enrichment failed. Details were logged server-side (connector run {run_id})."
        ) from exc
