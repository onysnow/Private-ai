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
from app.core.time import utcnow_naive
from app.models.domain import (
    ConnectorFinding, ConnectorRun, Entity, Investigation, Lead, LeadProfile, LeadWorkflowEvent,
)
from app.schemas.api import ConnectorSearchRequest
from app.services.outbound import enrich_sent_text, mark_outbound_failed, record_outbound, send_outcome


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


# Parties worth looking up by name on their own (an address or a payment is not).
NAMED_SCHEMAS = {"Person", "Company", "Organization", "LegalEntity", "PublicBody"}


def require_lookup_allowed(db: Session, investigation_id: str, provider: str) -> None:
    """Settings › Outside lookups: a source set to Off for this case is never asked, whoever asks."""
    from app.services.preferences import lookup_mode, provider_label

    if lookup_mode(db, investigation_id, provider) == "off":
        raise HTTPException(403, f"Outside lookups to {provider_label(provider)} are off for this case. "
                                 "Change it in Settings › Outside lookups.")


def entity_query_label(entity: Entity) -> str:
    """How a run made for a party is recorded (ConnectorRun.query), so a later run can find it."""
    return f"entity:{entity.ftm_id or entity.id}"


def automatic_lookups_due(db: Session, entity: Entity) -> list[str]:
    """The sources set to Automatic for this case that have not yet looked this party up."""
    from app.services.preferences import lookup_modes

    if entity.schema not in NAMED_SCHEMAS:
        return []
    modes = lookup_modes(db, entity.investigation_id, registry.names())
    done = set(db.scalars(select(ConnectorRun.provider).where(
        ConnectorRun.investigation_id == entity.investigation_id, ConnectorRun.query == entity_query_label(entity),
        ConnectorRun.status != "failed")))
    return [p for p, mode in modes.items() if mode == "automatic" and p not in done]


async def run_connector(provider: str, body: ConnectorSearchRequest, db: Session) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    connector = registry.get(provider)
    if connector is None:
        raise HTTPException(404, "Connector not found")
    require_lookup_allowed(db, body.investigation_id, provider)
    run = ConnectorRun(investigation_id=body.investigation_id, provider=provider, query=body.query)
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    sent_id = record_outbound(db, body.investigation_id, service=provider, kind="search text", value=body.query,
                              reason="A search you ran", actor="you", outcome=send_outcome(connector), source={"connector_run_id": run_id})
    try:
        findings = await connector.search(body.query)
        return persist_connector_findings(db, run, body.investigation_id, provider, findings)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        mark_outbound_failed(db, sent_id)
        # Full exception text/class is persisted on the ConnectorRun row (run.error) rather than
        # echoed into the client-facing response (STRUCT-0028).
        raise HTTPException(
            502, f"{provider} connector failed. Details were logged server-side (connector run {run_id})."
        ) from exc


async def enrich_entity(provider: str, entity: Entity, db: Session, *, automatic: bool = False) -> Any:
    """Look one party up at one source. ``automatic`` is a lookup the case's Automatic setting started, not a click."""
    connector = registry.get(provider)
    if connector is None:
        raise HTTPException(404, "Connector not found")
    require_lookup_allowed(db, entity.investigation_id, provider)
    query_label = entity_query_label(entity)
    run = ConnectorRun(
        investigation_id=entity.investigation_id, provider=provider, query=query_label,
    )
    db.add(run); db.commit(); db.refresh(run)
    run_id = run.id
    payload = {"id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption, "properties": entity.properties or {}}
    sent_id = record_outbound(db, entity.investigation_id, service=provider, kind="details of a record",
                              value=enrich_sent_text(connector, payload),
                              reason=f"Automatic lookup of {entity.caption}" if automatic else f"Look up {entity.caption}",
                              actor="automatic" if automatic else "you", outcome=send_outcome(connector),
                              source={"connector_run_id": run_id, "entity_id": entity.id})
    try:
        findings = await connector.enrich(payload)
        return persist_connector_findings(db, run, entity.investigation_id, provider, findings)
    except Exception as exc:
        _fail_run(db, run_id, exc)
        mark_outbound_failed(db, sent_id)
        # Full exception text/class is persisted on the ConnectorRun row (run.error) rather than
        # echoed into the client-facing response (STRUCT-0028).
        raise HTTPException(
            502, f"{provider} enrichment failed. Details were logged server-side (connector run {run_id})."
        ) from exc


def queue_automatic_lookups(db: Session, entity: Entity, request: Any, background: Any) -> None:
    """Start the Automatic lookups for a party just added to a case, after the answer has gone back: the person who
    added it does not wait on outside sources. Nothing is queued when no source is set to Automatic."""
    from app.jobs.handlers import OUTSIDE_LOOKUP
    from app.jobs.records import create_job
    from app.jobs.runner import job_runner

    if not automatic_lookups_due(db, entity):
        return
    runner = job_runner(request)
    job = create_job(db, kind=OUTSIDE_LOOKUP, investigation_id=entity.investigation_id, subject_type="entity",
                     subject_id=entity.id, runner=runner.mode, message="Waiting to look up")
    background.add_task(runner.submit, job)
