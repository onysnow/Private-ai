from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.jobs.corpus import request_corpus_sync
from app.models.domain import (
    CanonicalEntityMergeAudit, ConnectorRun, CrossProviderDecision, Entity, Evidence,
    EnrichmentSession, EnrichmentSessionFinding, EnrichmentSessionRun,
    ExternalRelationshipPromotion, Investigation, PropertyConflictDecision,
    RelationshipEdge, Source, Statement, StatementPromotion,
)
from app.schemas.api import EntityCreate, EntityUpdate, PropertyConflictDecisionRequest
from app.services.connectors import log_connector_send, persist_connector_findings
from app.services.consolidation import get_enrichment_session_detail
from app.services.ftm import make_ftm_entity
from app.services.provenance import entity_statement_history
from app.services.timeline import _normalize_date

ALLOWED_CONFLICT_DECISIONS = {"preferred", "superseded", "temporal_change", "both_valid", "unresolved"}


def create_entity(db: Session, body: EntityCreate) -> Entity:
    if db.get(Investigation, body.investigation_id) is None:
        raise LookupError("Investigation not found")
    ftm = make_ftm_entity(body.schema, body.caption, body.properties)
    row = Entity(
        investigation_id=body.investigation_id, ftm_id=ftm["id"], schema=ftm["schema"],
        caption=body.caption, properties=ftm["properties"],
    )
    db.add(row)
    db.flush()
    for prop, values in ftm["properties"].items():
        for value in values:
            db.add(Statement(entity_id=row.id, prop=prop, value=value, dataset=body.dataset, origin=body.origin, original_value=value))
    db.commit()
    db.refresh(row)
    # A confirmed entity goes to the investigation's OpenAleph collection
    # (ADR-0006, Wave B); queued after the commit, so it can never undo it.
    request_corpus_sync(db, row.investigation_id)
    return row


def update_entity(db: Session, entity: Entity, body: EntityUpdate) -> Entity:
    """Rename an entity and/or add new property values, as new Statements.

    Additive only, matching the ledger everywhere else in this codebase:
    a property value is never removed or overwritten here. Two statements
    disagreeing on a value (old vs. new) is exactly what
    decide_property_conflict already exists to resolve, so this function
    does not attempt to pick a "winner" itself.
    """
    if entity.merged_into_entity_id is not None:
        raise ValueError("Entity has been merged into another entity; edit that entity instead")
    if body.caption is None and not body.properties:
        raise ValueError("update must set caption and/or properties")
    if body.caption is not None:
        entity.caption = body.caption
    if body.properties:
        ftm = make_ftm_entity(entity.schema, entity.caption, body.properties)
        merged = {k: list(v) for k, v in (entity.properties or {}).items()}
        for prop, values in ftm["properties"].items():
            current = merged.setdefault(prop, [])
            for value in values:
                if value in current:
                    continue
                current.append(value)
                db.add(Statement(entity_id=entity.id, prop=prop, value=value, dataset=body.dataset, origin=body.origin, original_value=value))
        entity.properties = merged
    db.commit()
    db.refresh(entity)
    request_corpus_sync(db, entity.investigation_id)
    return entity


def list_entities(
    db: Session, investigation_id: str, include_relationships: bool, *, limit: int | None = None, offset: int = 0,
) -> list[Entity]:
    """List an investigation's canonical entities.

    limit/offset apply at the SQL level (STRUCT-0018) so a large investigation
    doesn't force a full-table scan-and-serialize on every list call. Both
    default to "no limit" to preserve existing callers' behavior unchanged;
    wiring a default page size plus frontend pagination controls is tracked
    separately since it changes what an unpaginated caller sees.
    """
    stmt = select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))
    if not include_relationships:
        relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
        stmt = stmt.where(~Entity.id.in_(relationship_ids))
    stmt = stmt.order_by(Entity.caption)
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())


def decide_property_conflict(db: Session, entity: Entity, prop: str, body: PropertyConflictDecisionRequest) -> PropertyConflictDecision:
    if body.decision not in ALLOWED_CONFLICT_DECISIONS:
        raise ValueError(f"decision must be one of: {', '.join(sorted(ALLOWED_CONFLICT_DECISIONS))}")
    ledger = entity_statement_history(db, entity.id)
    available = {row["value"] for row in ledger if row["prop"] == prop}
    values = list(dict.fromkeys(body.values))
    if len(values) < 2 or not set(values).issubset(available):
        raise ValueError("values must identify at least two current ledger values for this property")
    if body.decision == "preferred":
        if body.preferred_value not in values:
            raise ValueError("preferred decisions require preferred_value from the reviewed values")
    elif body.preferred_value is not None:
        raise ValueError("preferred_value is only valid for a preferred decision")
    intervals = [item.model_dump() for item in body.temporal_intervals]
    if intervals and body.decision != "temporal_change":
        raise ValueError("temporal_intervals are only valid for a temporal_change decision")
    for interval in intervals:
        if interval["value"] not in values:
            raise ValueError("temporal interval values must be among the reviewed values")
        if not interval.get("date_start") and not interval.get("date_end"):
            raise ValueError("temporal intervals require date_start and/or date_end; dates are never inferred")
        for key in ("date_start", "date_end"):
            if interval.get(key) and _normalize_date(interval[key]) is None:
                raise ValueError(f"{key} must be YYYY, YYYY-MM, or YYYY-MM-DD")
        if interval.get("evidence_id"):
            evidence = db.get(Evidence, interval["evidence_id"])
            source = db.get(Source, evidence.source_id) if evidence else None
            if evidence is None or source is None or source.investigation_id != entity.investigation_id:
                raise ValueError("temporal interval evidence must belong to this investigation")
    row = PropertyConflictDecision(
        investigation_id=entity.investigation_id, entity_id=entity.id, prop=prop,
        decision=body.decision, values_json=values, preferred_value=body.preferred_value, rationale=body.rationale,
        temporal_intervals_json=intervals,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_property_conflict_decisions(db: Session, entity_id: str, prop: str) -> list[PropertyConflictDecision]:
    return list(db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.entity_id == entity_id, PropertyConflictDecision.prop == prop
    ).order_by(PropertyConflictDecision.created_at.desc())).all())


def list_entity_statements(db: Session, entity_id: str) -> list[Statement]:
    return list(db.scalars(select(Statement).where(Statement.entity_id == entity_id)).all())


async def run_multi_enrichment(db: Session, entity: Entity, providers: list[str] | None) -> dict:
    providers = providers or registry.names()
    providers = list(dict.fromkeys(providers))
    unknown = [name for name in providers if registry.get(name) is None]
    if unknown:
        raise ValueError(f"Unknown connectors: {', '.join(unknown)}")

    session = EnrichmentSession(
        investigation_id=entity.investigation_id, entity_id=entity.id, providers=providers, status="running",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    total_results = 0
    failures = 0
    for provider in providers:
        session_run = EnrichmentSessionRun(
            session_id=session.id, provider=provider, status="running", started_at=utcnow_naive(),
        )
        db.add(session_run)
        db.commit()
        db.refresh(session_run)
        connector = registry.get(provider)
        run = ConnectorRun(
            investigation_id=entity.investigation_id, provider=provider, query=f"entity:{entity.ftm_id or entity.id}",
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        session_run.run_id = run.id
        db.commit()
        sent_entity = {
            "id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption,
            "properties": entity.properties or {},
        }
        logged = False
        try:
            findings = await connector.enrich(sent_entity)
            logged = True
            log_connector_send(db, connector, provider, entity.investigation_id, run_id=run.id, reason="matched all services", entity=sent_entity)
            rows = persist_connector_findings(db, run, entity.investigation_id, provider, findings)
            for finding_row in rows:
                link = db.scalar(select(EnrichmentSessionFinding).where(
                    EnrichmentSessionFinding.session_id == session.id,
                    EnrichmentSessionFinding.finding_id == finding_row.id,
                ))
                if link is None:
                    db.add(EnrichmentSessionFinding(session_id=session.id, finding_id=finding_row.id, provider=provider))
            db.commit()
            session_run.status = "completed"
            session_run.result_count = len(rows)
            session_run.finished_at = utcnow_naive()
            total_results += len(rows)
        except Exception as exc:
            failures += 1
            if not logged:  # a failure after the request went out (saving the findings) is not a second request
                log_connector_send(db, connector, provider, entity.investigation_id, run_id=run.id, reason="matched all services", entity=sent_entity, error=exc)
            run.status = "failed"; run.error = str(exc); run.finished_at = utcnow_naive()
            session_run.status = "failed"; session_run.error = str(exc); session_run.finished_at = utcnow_naive()
        db.commit()

    session.total_results = total_results
    session.status = "failed" if providers and failures == len(providers) else ("partial" if failures else "completed")
    session.finished_at = utcnow_naive()
    db.commit()
    # The session as GET /enrichment-sessions/{id} reports it: one shape for
    # its runs (they used to differ between the run and a later read).
    return get_enrichment_session_detail(db, session.id)


def list_entity_enrichment_sessions(db: Session, entity_id: str) -> list[EnrichmentSession]:
    return list(db.scalars(select(EnrichmentSession).where(EnrichmentSession.entity_id == entity_id).order_by(EnrichmentSession.started_at.desc())).all())


def list_cross_provider_decisions(db: Session, entity_id: str) -> list[CrossProviderDecision]:
    return list(db.scalars(select(CrossProviderDecision).where(CrossProviderDecision.entity_id == entity_id).order_by(CrossProviderDecision.created_at.desc())).all())


def list_external_relationship_promotions(db: Session, entity: Entity) -> list[ExternalRelationshipPromotion]:
    return list(db.scalars(select(ExternalRelationshipPromotion).where(
        (ExternalRelationshipPromotion.investigation_id == entity.investigation_id),
        ((ExternalRelationshipPromotion.relationship_entity_id == entity.id))
    ).order_by(ExternalRelationshipPromotion.promoted_at.desc())).all())


def entity_merge_history(db: Session, entity: Entity) -> list[CanonicalEntityMergeAudit]:
    return list(db.scalars(select(CanonicalEntityMergeAudit).where(
        CanonicalEntityMergeAudit.investigation_id == entity.investigation_id,
        ((CanonicalEntityMergeAudit.source_entity_id == entity.id) | (CanonicalEntityMergeAudit.target_entity_id == entity.id))
    ).order_by(CanonicalEntityMergeAudit.created_at.desc())).all())


def list_entity_promotions(db: Session, entity_id: str) -> list[StatementPromotion]:
    return list(db.scalars(select(StatementPromotion).where(StatementPromotion.entity_id == entity_id).order_by(StatementPromotion.promoted_at.desc())).all())
