"""Relationship endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage
E group 4). All 5 already delegated fully to app/services/relationships.py
and app/services/leads.py; this module just wires 404s and ValueErrors
to HTTP status codes.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, RelationshipEdge
from app.schemas.api import (
    RelationshipCreate, RelationshipEvidenceAttachRequest, RelationshipEvidenceReviewRequest,
)
from app.services.leads import create_relationship_context_lead, serialize_lead
from app.services.relationships import (
    attach_relationship_evidence, create_relationship, relationship_evidence_review_history,
    review_relationship_evidence, serialize_relationship,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/relationships", response_model=None)
def create_canonical_relationship(body: RelationshipCreate, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        edge = create_relationship(
            db, investigation_id=body.investigation_id, schema=body.schema,
            source_entity_id=body.source_entity_id, target_entity_id=body.target_entity_id,
            properties=body.properties, dataset=body.dataset, origin=body.origin, evidence_id=body.evidence_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_relationship(db, edge)


@router.post("/relationships/{relationship_id}/evidence", response_model=None)
def attach_relationship_evidence_endpoint(relationship_id: str, body: RelationshipEvidenceAttachRequest, db: Session = Depends(get_db)) -> Any:
    edge = db.get(RelationshipEdge, relationship_id)
    if edge is None:
        raise HTTPException(404, "Relationship not found")
    try:
        attach_relationship_evidence(db, edge, evidence_id=body.evidence_id, note=body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_relationship(db, edge)


@router.get("/relationships/{relationship_id}/evidence-reviews", response_model=None)
def list_relationship_evidence_reviews(relationship_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    edge = db.get(RelationshipEdge, relationship_id)
    if edge is None:
        raise HTTPException(404, "Relationship not found")
    return {"relationship_id": edge.id, "reviews": relationship_evidence_review_history(db, edge)}


@router.post("/relationships/{relationship_id}/evidence/{evidence_id}/reviews", response_model=None)
def review_relationship_evidence_endpoint(relationship_id: str, evidence_id: str, body: RelationshipEvidenceReviewRequest, db: Session = Depends(get_db)) -> Any:
    edge = db.get(RelationshipEdge, relationship_id)
    if edge is None:
        raise HTTPException(404, "Relationship not found")
    try:
        review_relationship_evidence(db, edge, evidence_id=evidence_id, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_relationship(db, edge)


@router.post("/relationships/{relationship_id}/lead-from-context", response_model=None)
def create_lead_from_relationship_context(relationship_id: str, db: Session = Depends(get_db)) -> Any:
    edge = db.get(RelationshipEdge, relationship_id)
    if edge is None:
        raise HTTPException(404, "Relationship not found")
    row = create_relationship_context_lead(db, edge)
    db.commit()
    db.refresh(row)
    return serialize_lead(db, row)
