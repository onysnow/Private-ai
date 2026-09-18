from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.models.domain import (
    Investigation, Entity, Statement, Source, Evidence, Claim, Lead, ReportingTask, ConnectorRun, ConnectorFinding, CanonicalEntityMergeAudit, PropertyConflictDecision, StatementPromotion,
    EnrichmentSession, EnrichmentSessionRun, EnrichmentSessionFinding, CrossProviderDecision, RelationshipEdge,
    ExternalRelationshipPromotion, Document,
)
from app.schemas.api import (
    InvestigationCreate, EntityCreate, CanonicalResolutionRequest, CanonicalMergeExecuteRequest, PostMergeReconciliationRequest, PropertyConflictDecisionRequest, MultiEnrichmentRequest, InvestigationQuestionContextRequest,
    CaseSynthesisRequest, HypothesisTestRequest,
)
from app.services.ftm import make_ftm_entity
from app.services.resolution import canonical_duplicate_candidates, record_canonical_resolution
from app.services.entity_merge import preview_entity_merge, execute_entity_merge
from app.services.post_merge_reconciliation import detect_post_merge_reconciliation, record_post_merge_reconciliation
from app.services.provenance import entity_statement_history
from app.services.relationships import (
    RELATIONSHIP_SCHEMAS, investigation_relationships,
    entity_relationships, investigation_graph,
)
from app.connectors.registry import registry
from app.services.assistant_context import build_question_context
from app.ai.reasoning import run_reasoning_module, ReasoningInputError, CitationValidationError, SchemaValidationError
from app.services.dossier import entity_dossier
from app.services.timeline import investigation_timeline, _normalize_date
from app.services.documents import serialize_document
from app.services.exports import build_investigation_export
from app.services.lifecycle import preview_investigation_deletion, delete_investigation
from app.services.openaleph_corpus import ensure_openaleph_collection, get_binding, serialize_binding
from app.core.config import settings
from app.core.authorization import (
    scope_for_request,
    require_scope_investigation_admin,
)
from app.services.leads import (
    LEAD_STATUSES, serialize_lead, serialize_task,
)

from app.api.dependencies import authorize_request_resource
from app.services.connectors import (
    persist_connector_findings as _persist_connector_findings,
    enrich_entity as _enrich_entity,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/corpus/openaleph")
def get_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"binding": serialize_binding(get_binding(db, investigation_id))}


@router.post("/investigations/{investigation_id}/corpus/openaleph/ensure")
def ensure_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)):
    try:
        binding = ensure_openaleph_collection(db, investigation_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"OpenAleph collection setup failed: {exc.__class__.__name__}: {exc}")
    return {"binding": serialize_binding(binding)}


@router.post("/investigations/{investigation_id}/assistant/context")
def investigation_question_context(
    investigation_id: str, body: InvestigationQuestionContextRequest, db: Session = Depends(get_db),
):
    """Build a provenance-bearing retrieval packet for the local AI layer."""
    try:
        return build_question_context(
            db, investigation_id=investigation_id, question=body.question,
            max_results=body.max_results, include_external_leads=body.include_external_leads,
            include_reconciled_duplicates=body.include_reconciled_duplicates,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


def _run_reasoning_endpoint(db: Session, *, investigation_id: str, module: str, question: str, max_results: int, include_external_leads: bool, working_theory: str | None = None):
    if not settings.enable_ai_features or not (settings.ai_provider or "").strip():
        raise HTTPException(400, "AI reasoning endpoints are not enabled on this deployment (enable_ai_features and ai_provider must both be set)")
    try:
        candidate = run_reasoning_module(
            db, investigation_id=investigation_id, module=module, question=question,
            working_theory=working_theory, max_results=max_results, include_external_leads=include_external_leads,
        )
        return {"candidate_id": candidate.id, "review_status": candidate.review_status, "payload": candidate.payload}
    except ReasoningInputError as exc:
        raise HTTPException(400, str(exc))
    except CitationValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: referenced evidence not present in the retrieval packet.", "invalid_citations": exc.bad_refs})
    except SchemaValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: did not match the required output schema.", "schema_errors": exc.errors})
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/investigations/{investigation_id}/assistant/case-synthesis")
def investigation_case_synthesis(
    investigation_id: str, body: CaseSynthesisRequest, db: Session = Depends(get_db),
):
    """TAS Module 08 (Case Synthesis) as a real, citation-validated LLM call.

    Never writes to canonical records — the result is persisted as a
    review_status="proposed" AIAnalysisCandidate. See app/ai/reasoning.py.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="case_synthesis", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
    )


@router.post("/investigations/{investigation_id}/assistant/hypothesis-test")
def investigation_hypothesis_test(
    investigation_id: str, body: HypothesisTestRequest, db: Session = Depends(get_db),
):
    """TAS Module 06 (Hypothesis and Contradiction Testing) as a real,
    citation-validated LLM call. Same non-canonical-write guarantee as
    /assistant/case-synthesis above.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="hypothesis_test", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        working_theory=body.working_theory,
    )


@router.get("/investigations/{investigation_id}/timeline")
def get_investigation_timeline(
    investigation_id: str,
    kind: list[str] | None = Query(default=None),
    verification_status: list[str] | None = Query(default=None),
    include_record_activity: bool = False,
    db: Session = Depends(get_db),
):
    try:
        return investigation_timeline(
            db, investigation_id, kinds=set(kind or []) or None,
            verification_statuses=set(verification_status or []) or None,
            include_record_activity=include_record_activity,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/export")
def export_investigation(
    investigation_id: str,
    include_documents: bool = True,
    db: Session = Depends(get_db),
):
    try:
        payload, manifest = build_investigation_export(db, investigation_id, include_documents=include_documents)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    inv = manifest["investigation"]
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in inv["name"]).strip("_") or "investigation"
    filename = f"{safe_name}.jwbackup.zip"
    return Response(
        content=payload, media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-JW-Backup-Version": str(manifest["version"]),
        },
    )


@router.post("/investigations")
def create_investigation(body: InvestigationCreate, db: Session = Depends(get_db)):
    row = Investigation(name=body.name, description=body.description)
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.get("/investigations")
def list_investigations(request: Request, db: Session = Depends(get_db)):
    rows = db.scalars(select(Investigation).order_by(Investigation.created_at.desc())).all()
    scope = scope_for_request(request)
    if scope.unrestricted:
        return rows
    return [row for row in rows if scope.allows(row.id)]

@router.get("/investigations/{investigation_id}/deletion-preview")
def investigation_deletion_preview(investigation_id: str, db: Session = Depends(get_db)):
    try:
        return preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.delete("/investigations/{investigation_id}")
def remove_investigation(investigation_id: str, request: Request, confirmation: str = Query(...), db: Session = Depends(get_db)):
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        return delete_investigation(db, investigation_id, settings.document_storage_dir, confirmation=confirmation)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.post("/entities")
def create_entity(body: EntityCreate, db: Session = Depends(get_db)):
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        ftm = make_ftm_entity(body.schema, body.caption, body.properties)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    row = Entity(investigation_id=body.investigation_id, ftm_id=ftm["id"], schema=ftm["schema"], caption=body.caption, properties=ftm["properties"])
    db.add(row); db.flush()
    for prop, values in ftm["properties"].items():
        for value in values:
            db.add(Statement(entity_id=row.id, prop=prop, value=value, dataset=body.dataset, origin=body.origin, original_value=value))
    db.commit(); db.refresh(row)
    return row

@router.get("/investigations/{investigation_id}/entities")
def list_entities(investigation_id: str, include_relationships: bool = False, db: Session = Depends(get_db)):
    stmt = select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))
    if not include_relationships:
        relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
        stmt = stmt.where(~Entity.id.in_(relationship_ids))
    return db.scalars(stmt.order_by(Entity.caption)).all()

@router.get("/entities/{entity_id}/dossier")
def get_entity_dossier(entity_id: str, db: Session = Depends(get_db)):
    try:
        return entity_dossier(db, entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/entities/{entity_id}/property-conflicts/{prop}/decisions")
def decide_property_conflict(entity_id: str, prop: str, body: PropertyConflictDecisionRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    allowed = {"preferred", "superseded", "temporal_change", "both_valid", "unresolved"}
    if body.decision not in allowed:
        raise HTTPException(400, f"decision must be one of: {', '.join(sorted(allowed))}")
    ledger = entity_statement_history(db, entity_id)
    available = {row["value"] for row in ledger if row["prop"] == prop}
    values = list(dict.fromkeys(body.values))
    if len(values) < 2 or not set(values).issubset(available):
        raise HTTPException(400, "values must identify at least two current ledger values for this property")
    if body.decision == "preferred":
        if body.preferred_value not in values:
            raise HTTPException(400, "preferred decisions require preferred_value from the reviewed values")
    elif body.preferred_value is not None:
        raise HTTPException(400, "preferred_value is only valid for a preferred decision")
    intervals = [item.model_dump() for item in body.temporal_intervals]
    if intervals and body.decision != "temporal_change":
        raise HTTPException(400, "temporal_intervals are only valid for a temporal_change decision")
    for interval in intervals:
        if interval["value"] not in values:
            raise HTTPException(400, "temporal interval values must be among the reviewed values")
        if not interval.get("date_start") and not interval.get("date_end"):
            raise HTTPException(400, "temporal intervals require date_start and/or date_end; dates are never inferred")
        for key in ("date_start", "date_end"):
            if interval.get(key) and _normalize_date(interval[key]) is None:
                raise HTTPException(400, f"{key} must be YYYY, YYYY-MM, or YYYY-MM-DD")
        if interval.get("evidence_id"):
            evidence = db.get(Evidence, interval["evidence_id"]); source = db.get(Source, evidence.source_id) if evidence else None
            if evidence is None or source is None or source.investigation_id != entity.investigation_id:
                raise HTTPException(400, "temporal interval evidence must belong to this investigation")
    row = PropertyConflictDecision(
        investigation_id=entity.investigation_id, entity_id=entity.id, prop=prop,
        decision=body.decision, values_json=values, preferred_value=body.preferred_value, rationale=body.rationale,
        temporal_intervals_json=intervals,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.get("/entities/{entity_id}/property-conflicts/{prop}/decisions")
def list_property_conflict_decisions(entity_id: str, prop: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.entity_id == entity_id, PropertyConflictDecision.prop == prop
    ).order_by(PropertyConflictDecision.created_at.desc())).all()

@router.get("/entities/{entity_id}/statements")
def list_entity_statements(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(Statement).where(Statement.entity_id == entity_id)).all()


@router.get("/entities/{entity_id}/statement-history")
def list_entity_statement_history(entity_id: str, db: Session = Depends(get_db)):
    try:
        return entity_statement_history(db, entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/relationships")
def list_investigation_relationships(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_relationships(db, investigation_id)


@router.get("/investigations/{investigation_id}/graph")
def get_investigation_graph(
    investigation_id: str,
    schema: list[str] | None = Query(default=None),
    include_reconciled_duplicates: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    requested = set(schema or [])
    unsupported = requested - set(RELATIONSHIP_SCHEMAS)
    if unsupported:
        raise HTTPException(400, f"Unsupported relationship schema(s): {', '.join(sorted(unsupported))}")
    return investigation_graph(
        db, investigation_id, requested or None,
        include_reconciled_duplicates=include_reconciled_duplicates,
    )


@router.get("/entities/{entity_id}/relationships")
def list_entity_relationships(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return entity_relationships(db, entity_id)


@router.get("/investigations/{investigation_id}/documents")
def list_documents(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at.desc())).all()
    return [serialize_document(db, row) for row in rows]


@router.get("/investigations/{investigation_id}/evidence")
def list_investigation_evidence(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    sources = db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all()
    source_by_id = {source.id: source for source in sources}
    if not source_by_id:
        return []
    evidence_rows = db.scalars(
        select(Evidence)
        .where(Evidence.source_id.in_(source_by_id.keys()))
        .order_by(Evidence.id)
    ).all()
    return [{"evidence": evidence, "source": source_by_id[evidence.source_id]} for evidence in evidence_rows]


@router.get("/investigations/{investigation_id}/sources")
def list_sources(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(Source).where(Source.investigation_id == investigation_id).order_by(Source.created_at.desc())).all()

@router.get("/investigations/{investigation_id}/claims")
def list_claims(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(Claim).where(Claim.investigation_id == investigation_id).order_by(Claim.created_at.desc())).all()


@router.get("/investigations/{investigation_id}/leads")
def list_leads(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    return [serialize_lead(db, row) for row in rows]


@router.get("/investigations/{investigation_id}/leads/queue")
def lead_queue(
    investigation_id: str,
    status: list[str] | None = Query(default=None),
    priority: list[str] | None = Query(default=None),
    owner: str | None = None,
    unresolved_only: bool = True,
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    items = [serialize_lead(db, row) for row in rows]
    requested_status = set(status or [])
    requested_priority = set(priority or [])
    if unresolved_only and not requested_status:
        requested_status = {"unreviewed", "active", "blocked"}
    if requested_status:
        items = [item for item in items if item["status"] in requested_status]
    if requested_priority:
        items = [item for item in items if item["priority"] in requested_priority]
    if owner is not None:
        items = [item for item in items if (item["owner"] or "") == owner]
    priority_rank = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    # Reporter-set priority remains authoritative. Within the same priority bucket,
    # surface leads with explicit contradiction/dispute pressure first.
    items.sort(key=lambda item: (
        priority_rank.get(item["priority"], 9),
        -item.get("triage", {}).get("attention_score", 0),
        item["created_at"],
    ))
    counts = {key: sum(1 for item in items if item["status"] == key) for key in sorted(LEAD_STATUSES)}
    return {"investigation_id": investigation_id, "total": len(items), "counts": counts, "items": items}


@router.get("/investigations/{investigation_id}/reporting-tasks")
def list_reporting_tasks(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(ReportingTask).where(ReportingTask.investigation_id == investigation_id).order_by(ReportingTask.created_at.desc())).all()
    return [serialize_task(db, row) for row in rows]


@router.post("/entities/{entity_id}/enrich/{provider}")
async def enrich_entity(entity_id: str, provider: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return await _enrich_entity(provider, entity, db)


@router.post("/entities/{entity_id}/enrich")
async def enrich_entity_multi(entity_id: str, body: MultiEnrichmentRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")

    providers = body.providers or registry.names()
    providers = list(dict.fromkeys(providers))
    unknown = [name for name in providers if registry.get(name) is None]
    if unknown:
        raise HTTPException(400, f"Unknown connectors: {', '.join(unknown)}")

    session = EnrichmentSession(
        investigation_id=entity.investigation_id, entity_id=entity.id, providers=providers, status="running",
    )
    db.add(session); db.commit(); db.refresh(session)

    provider_results = []
    total_results = 0
    failures = 0
    for provider in providers:
        session_run = EnrichmentSessionRun(
            session_id=session.id, provider=provider, status="running", started_at=utcnow_naive(),
        )
        db.add(session_run); db.commit(); db.refresh(session_run)
        connector = registry.get(provider)
        run = ConnectorRun(
            investigation_id=entity.investigation_id, provider=provider, query=f"entity:{entity.ftm_id or entity.id}",
        )
        db.add(run); db.commit(); db.refresh(run)
        session_run.run_id = run.id; db.commit()
        try:
            findings = await connector.enrich({
                "id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption,
                "properties": entity.properties or {},
            })
            rows = _persist_connector_findings(db, run, entity.investigation_id, provider, findings)
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
    db.commit(); db.refresh(session)
    return {
        "id": session.id, "entity_id": session.entity_id, "investigation_id": session.investigation_id,
        "status": session.status, "providers": providers, "total_results": total_results,
        "started_at": session.started_at, "finished_at": session.finished_at, "runs": provider_results,
    }


@router.get("/entities/{entity_id}/enrichment-sessions")
def list_entity_enrichment_sessions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(EnrichmentSession).where(EnrichmentSession.entity_id == entity_id).order_by(EnrichmentSession.started_at.desc())).all()


@router.get("/entities/{entity_id}/cross-provider-decisions")
def list_cross_provider_decisions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(CrossProviderDecision).where(CrossProviderDecision.entity_id == entity_id).order_by(CrossProviderDecision.created_at.desc())).all()


@router.get("/investigations/{investigation_id}/connector-runs")
def list_connector_runs(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorRun).where(ConnectorRun.investigation_id == investigation_id).order_by(ConnectorRun.started_at.desc())).all()

@router.get("/investigations/{investigation_id}/connector-findings")
def list_connector_findings(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorFinding).where(ConnectorFinding.investigation_id == investigation_id).order_by(ConnectorFinding.created_at.desc())).all()


@router.get("/entities/{entity_id}/external-relationship-promotions")
def list_external_relationship_promotions(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(ExternalRelationshipPromotion).where(
        (ExternalRelationshipPromotion.investigation_id == entity.investigation_id),
        ((ExternalRelationshipPromotion.relationship_entity_id == entity_id))
    ).order_by(ExternalRelationshipPromotion.promoted_at.desc())).all()


@router.get("/entities/{entity_id}/duplicate-candidates")
def entity_duplicate_candidates(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return canonical_duplicate_candidates(db, entity)

@router.post("/entities/{entity_id}/canonical-resolution")
def canonical_entity_resolution(entity_id: str, body: CanonicalResolutionRequest, db: Session = Depends(get_db)):
    if body.decision not in {"same", "different", "unsure"}:
        raise HTTPException(400, "Decision must be same, different, or unsure")
    entity = db.get(Entity, entity_id); other = db.get(Entity, body.other_entity_id)
    if entity is None or other is None:
        raise HTTPException(404, "Entity not found")
    try:
        return record_canonical_resolution(db, entity, other, decision=body.decision, confidence=body.confidence, rationale=body.rationale)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.get("/entities/{entity_id}/merge-preview")
def entity_merge_preview(entity_id: str, target_entity_id: str = Query(...), db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id); target = db.get(Entity, target_entity_id)
    try:
        return preview_entity_merge(db, source, target)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.post("/entities/{entity_id}/merge")
def entity_merge_execute(entity_id: str, body: CanonicalMergeExecuteRequest, db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id); target = db.get(Entity, body.target_entity_id)
    try:
        audit = execute_entity_merge(db, source, target, preview_digest=body.preview_digest, rationale=body.rationale)
        return {"audit": audit, "source_entity_id": entity_id, "target_entity_id": body.target_entity_id}
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.get("/entities/{entity_id}/merge-history")
def entity_merge_history(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(CanonicalEntityMergeAudit).where(
        CanonicalEntityMergeAudit.investigation_id == entity.investigation_id,
        ((CanonicalEntityMergeAudit.source_entity_id == entity_id) | (CanonicalEntityMergeAudit.target_entity_id == entity_id))
    ).order_by(CanonicalEntityMergeAudit.created_at.desc())).all()

@router.get("/entities/{entity_id}/post-merge-reconciliation")
def entity_post_merge_reconciliation(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    try:
        return detect_post_merge_reconciliation(db, entity)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.post("/entities/{entity_id}/post-merge-reconciliation")
def decide_entity_post_merge_reconciliation(entity_id: str, body: PostMergeReconciliationRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    try:
        return record_post_merge_reconciliation(
            db, entity, record_type=body.record_type, record_a_id=body.record_a_id, record_b_id=body.record_b_id,
            decision=body.decision, rationale=body.rationale, preferred_record_id=body.preferred_record_id,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/entities/{entity_id}/promotions")
def list_entity_promotions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(StatementPromotion).where(StatementPromotion.entity_id == entity_id).order_by(StatementPromotion.promoted_at.desc())).all()
