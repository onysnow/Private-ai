from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.models.domain import (
    CanonicalEntityMergeAudit, ConnectorRun, CrossProviderDecision, Entity, Evidence,
    EnrichmentSession, EnrichmentSessionFinding, EnrichmentSessionRun,
    ExternalRelationshipPromotion, Investigation, PropertyConflictDecision,
    RelationshipEdge, Source, Statement, StatementPromotion,
)
from app.schemas.api import EntityCreate, PropertyConflictDecisionRequest
from app.services.connectors import persist_connector_findings
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
    return row


def list_entities(db: Session, investigation_id: str, include_relationships: bool) -> list[Entity]:
    stmt = select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))
    if not include_relationships:
        relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
        stmt = stmt.where(~Entity.id.in_(relationship_ids))
    return db.scalars(stmt.order_by(Entity.caption)).all()


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
    return db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.entity_id == entity_id, PropertyConflictDecision.prop == prop
    ).order_by(PropertyConflictDecision.created_at.desc())).all()


def list_entity_statements(db: Session, entity_id: str) -> list[Statement]:
    return db.scalars(select(Statement).where(Statement.entity_id == entity_id)).all()


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

    provider_results = []
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
        try:
            findings = await connector.enrich({
                "id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption,
                "properties": entity.properties or {},
            })
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
            provider_results.append({"provider": provider, "status": "completed", "result_count": len(rows), "run_id": run.id})
        except Exception as exc:
            failures += 1
            run.status = "failed"; run.error = str(exc); run.finished_at = utcnow_naive()
            session_run.status = "failed"; session_run.error = str(exc); session_run.finished_at = utcnow_naive()
            provider_results.append({"provider": provider, "status": "failed", "result_count": 0, "run_id": run.id, "error": str(exc)})
        db.commit()

    session.total_results = total_results
    session.status = "failed" if providers and failures == len(providers) else ("partial" if failures else "completed")
    session.finished_at = utcnow_naive()
    db.commit()
    db.refresh(session)
    return {
        "id": session.id, "entity_id": session.entity_id, "investigation_id": session.investigation_id,
        "status": session.status, "providers": providers, "total_results": total_results,
        "started_at": session.started_at, "finished_at": session.finished_at, "runs": provider_results,
    }


def list_entity_enrichment_sessions(db: Session, entity_id: str) -> list[EnrichmentSession]:
    return db.scalars(select(EnrichmentSession).where(EnrichmentSession.entity_id == entity_id).order_by(EnrichmentSession.started_at.desc())).all()


def list_cross_provider_decisions(db: Session, entity_id: str) -> list[CrossProviderDecision]:
    return db.scalars(select(CrossProviderDecision).where(CrossProviderDecision.entity_id == entity_id).order_by(CrossProviderDecision.created_at.desc())).all()


def list_external_relationship_promotions(db: Session, entity: Entity) -> list[ExternalRelationshipPromotion]:
    return db.scalars(select(ExternalRelationshipPromotion).where(
        (ExternalRelationshipPromotion.investigation_id == entity.investigation_id),
        ((ExternalRelationshipPromotion.relationship_entity_id == entity.id))
    ).order_by(ExternalRelationshipPromotion.promoted_at.desc())).all()


def entity_merge_history(db: Session, entity: Entity) -> list[CanonicalEntityMergeAudit]:
    return db.scalars(select(CanonicalEntityMergeAudit).where(
        CanonicalEntityMergeAudit.investigation_id == entity.investigation_id,
        ((CanonicalEntityMergeAudit.source_entity_id == entity.id) | (CanonicalEntityMergeAudit.target_entity_id == entity.id))
    ).order_by(CanonicalEntityMergeAudit.created_at.desc())).all()


def list_entity_promotions(db: Session, entity_id: str) -> list[StatementPromotion]:
    return db.scalars(select(StatementPromotion).where(StatementPromotion.entity_id == entity_id).order_by(StatementPromotion.promoted_at.desc())).all()
