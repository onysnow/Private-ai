"""Enrichment-session endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 3). Detail/clusters/decision logic moved into
app/services/consolidation.py alongside the session_findings/
consolidate_findings/cluster_key helpers it already depends on.

GET /entities/{entity_id}/enrichment-sessions and GET
/entities/{entity_id}/cross-provider-decisions stay in routes.py: their
URL prefix is /entities, so they belong with group 7 per the plan's
prefix-based grouping.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.schemas.api import CrossProviderDecisionRequest
from app.services.consolidation import (
    create_cross_provider_decision, get_enrichment_session_clusters, get_enrichment_session_detail,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/enrichment-sessions/{session_id}")
def enrichment_session_detail(session_id: str, db: Session = Depends(get_db)):
    try:
        return get_enrichment_session_detail(db, session_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@router.get("/enrichment-sessions/{session_id}/clusters")
def enrichment_session_clusters(session_id: str, db: Session = Depends(get_db)):
    try:
        return get_enrichment_session_clusters(db, session_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@router.post("/enrichment-sessions/{session_id}/clusters/decision")
def decide_cross_provider_cluster(session_id: str, body: CrossProviderDecisionRequest, db: Session = Depends(get_db)):
    try:
        return create_cross_provider_decision(db, session_id, body)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
