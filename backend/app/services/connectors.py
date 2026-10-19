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

from app.connectors.base import ExternalFinding
from app.connectors.registry import registry
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import (
    ConnectorFinding, ConnectorRun, Entity, Investigation, Lead, LeadProfile, LeadWorkflowEvent,
)
from app.schemas.api import ConnectorSearchRequest
from app.services import outbound


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


async def run_connector(provider: str, body: ConnectorSearchRequest, db: Session) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    connector = registry.get(provider)
    if connector is None:
        raise HTTPException(404, "Connector not found")
    # The case's mode for this service, then the outbound log, before anything is sent (app/services/outbound.py).
    try:
        outbound.require_allowed(db, body.investigation_id, provider, settings)
    except outbound.ServiceRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    if outbound.connector_will_send(connector):
        outbound.record(db, body.investigation_id, provider, kind="lookup", value=body.query, value_kind="search text",
                        reason="lookup")
    run = ConnectorRun(investigation_id=body.investigation_id, provider=provider, query=body.query)
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    try:
        findings = await connector.search(body.query)
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
    try:
        outbound.require_allowed(db, entity.investigation_id, provider, settings)
    except outbound.ServiceRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    sent_entity = {"id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption, "properties": entity.properties or {}}
    if outbound.connector_will_send(connector):
        value, value_kind = outbound.enrichment_value(connector, sent_entity)
        outbound.record(db, entity.investigation_id, provider, kind="lookup", value=value, value_kind=value_kind,
                        reason=f"enrich {entity.caption}")
    query_label = f"entity:{entity.ftm_id or entity.id}"
    run = ConnectorRun(
        investigation_id=entity.investigation_id, provider=provider, query=query_label,
    )
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    try:
        findings = await connector.enrich({
            "id": entity.ftm_id,
            "schema": entity.schema,
            "caption": entity.caption,
            "properties": entity.properties or {},
        })
        return persist_connector_findings(db, run, entity.investigation_id, provider, findings)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        # Full exception text/class is persisted on the ConnectorRun row (run.error) rather than
        # echoed into the client-facing response (STRUCT-0028).
        raise HTTPException(
            502, f"{provider} enrichment failed. Details were logged server-side (connector run {run_id})."
        ) from exc
