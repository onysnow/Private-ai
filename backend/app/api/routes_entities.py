"""Entity endpoints: /entities/*, and entity listing under /investigations/*.

Group 7 of the Stage E routes.py split. Covers entity creation and
listing, property-conflict decisions, statement/statement-history
reads, entity-scoped relationships, connector enrichment (single and
multi-provider), enrichment-session/cross-provider-decision reads,
external-relationship-promotion reads, canonical duplicate detection
and resolution, entity merge preview/execute/history, post-merge
reconciliation, and statement-promotion reads.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Entity
from app.schemas.api import (
    CanonicalMergeExecuteRequest, CanonicalResolutionRequest, EntityCreate,
    MultiEnrichmentRequest, PostMergeReconciliationRequest, PropertyConflictDecisionRequest,
)
from app.services.connectors import enrich_entity as _enrich_entity_single
from app.services.dossier import entity_dossier
from app.services.entity_merge import execute_entity_merge, preview_entity_merge
from app.services.post_merge_reconciliation import (
    detect_post_merge_reconciliation,
    record_post_merge_reconciliation,
)
from app.services.provenance import entity_statement_history
from app.services.relationships import entity_relationships
from app.services.resolution import canonical_duplicate_candidates, record_canonical_resolution
from app.services.entities import (
    create_entity as _create_entity,
    decide_property_conflict as _decide_property_conflict,
    entity_merge_history as _entity_merge_history,
    list_cross_provider_decisions as _list_cross_provider_decisions,
    list_entities as _list_entities,
    list_entity_enrichment_sessions as _list_entity_enrichment_sessions,
    list_entity_promotions as _list_entity_promotions,
    list_entity_statements as _list_entity_statements,
    list_external_relationship_promotions as _list_external_relationship_promotions,
    list_property_conflict_decisions as _list_property_conflict_decisions,
    run_multi_enrichment as _run_multi_enrichment,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/entities")
def create_entity(body: EntityCreate, db: Session = Depends(get_db)):
    try:
        return _create_entity(db, body)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/investigations/{investigation_id}/entities")
def list_entities(
    investigation_id: str,
    include_relationships: bool = False,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return _list_entities(db, investigation_id, include_relationships, limit=limit, offset=offset)


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
    try:
        return _decide_property_conflict(db, entity, prop, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/entities/{entity_id}/property-conflicts/{prop}/decisions")
def list_property_conflict_decisions(entity_id: str, prop: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return _list_property_conflict_decisions(db, entity_id, prop)


@router.get("/entities/{entity_id}/statements")
def list_entity_statements(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return _list_entity_statements(db, entity_id)


@router.get("/entities/{entity_id}/statement-history")
def list_entity_statement_history(entity_id: str, db: Session = Depends(get_db)):
    try:
        return entity_statement_history(db, entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/entities/{entity_id}/relationships")
def list_entity_relationships(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return entity_relationships(db, entity_id)


@router.post("/entities/{entity_id}/enrich/{provider}")
async def enrich_entity(entity_id: str, provider: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return await _enrich_entity_single(provider, entity, db)


@router.post("/entities/{entity_id}/enrich")
async def enrich_entity_multi(entity_id: str, body: MultiEnrichmentRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    try:
        return await _run_multi_enrichment(db, entity, body.providers)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/entities/{entity_id}/enrichment-sessions")
def list_entity_enrichment_sessions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return _list_entity_enrichment_sessions(db, entity_id)


@router.get("/entities/{entity_id}/cross-provider-decisions")
def list_cross_provider_decisions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return _list_cross_provider_decisions(db, entity_id)


@router.get("/entities/{entity_id}/external-relationship-promotions")
def list_external_relationship_promotions(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return _list_external_relationship_promotions(db, entity)


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
    entity = db.get(Entity, entity_id)
    other = db.get(Entity, body.other_entity_id)
    if entity is None or other is None:
        raise HTTPException(404, "Entity not found")
    try:
        return record_canonical_resolution(db, entity, other, decision=body.decision, confidence=body.confidence, rationale=body.rationale)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/entities/{entity_id}/merge-preview")
def entity_merge_preview(entity_id: str, target_entity_id: str = Query(...), db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id)
    target = db.get(Entity, target_entity_id)
    if source is None or target is None:
        raise HTTPException(404, "Entity not found")
    try:
        return preview_entity_merge(db, source, target)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/entities/{entity_id}/merge")
def entity_merge_execute(entity_id: str, body: CanonicalMergeExecuteRequest, db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id)
    target = db.get(Entity, body.target_entity_id)
    if source is None or target is None:
        raise HTTPException(404, "Entity not found")
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
    return _entity_merge_history(db, entity)


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
    return _list_entity_promotions(db, entity_id)
