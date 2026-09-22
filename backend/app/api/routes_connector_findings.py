"""Connector-finding endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 5). Relationship-candidate/review logic already lived in
app/services/external_relationships.py; added list_relationship_reviews
there. Review-status/resolution/assessment logic moved into a new
app/services/connector_findings.py.

Also includes POST /external-relationship-reviews/{review_id}/promote:
its URL prefix differs from /connector-findings, but it promotes the
same ExternalRelationshipReview workflow this module's other endpoints
manage, so it's grouped here by domain rather than left stranded in
routes.py or split into a one-endpoint module of its own.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import ConnectorFinding, Entity, ExternalRelationshipReview
from app.schemas.api import (
    ExternalRelationshipReviewRequest, FindingReviewRequest, ResolutionRequest, StatementAssessmentRequest,
)
from app.services.connector_findings import (
    create_resolution_decision, create_statement_assessment, list_statement_assessments,
    update_finding_review_status,
)
from app.services.external_relationships import (
    create_review, list_relationship_reviews, promote_review, relationship_endpoint_candidates,
)
from app.services.resolution import candidate_entities

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/connector-findings/{finding_id}/relationship-candidates", response_model=None)
def external_relationship_candidates(finding_id: str, db: Session = Depends(get_db)) -> Any:
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    try:
        return relationship_endpoint_candidates(db, finding)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/connector-findings/{finding_id}/relationship-reviews", response_model=None)
def list_external_relationship_reviews(finding_id: str, db: Session = Depends(get_db)) -> Any:
    if db.get(ConnectorFinding, finding_id) is None:
        raise HTTPException(404, "Finding not found")
    return list_relationship_reviews(db, finding_id)


@router.post("/connector-findings/{finding_id}/relationship-reviews", response_model=None)
def review_external_relationship(finding_id: str, body: ExternalRelationshipReviewRequest, db: Session = Depends(get_db)) -> Any:
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    try:
        return create_review(db, finding, body.source_entity_id, body.target_entity_id, body.decision, body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/external-relationship-reviews/{review_id}/promote", response_model=None)
def promote_external_relationship(review_id: str, db: Session = Depends(get_db)) -> Any:
    review = db.get(ExternalRelationshipReview, review_id)
    if review is None:
        raise HTTPException(404, "Relationship review not found")
    try:
        return promote_review(db, review)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.patch("/connector-findings/{finding_id}/review", response_model=None)
def review_finding(finding_id: str, body: FindingReviewRequest, db: Session = Depends(get_db)) -> Any:
    row = db.get(ConnectorFinding, finding_id)
    if row is None:
        raise HTTPException(404, "Finding not found")
    try:
        return update_finding_review_status(db, row, body.status)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/connector-findings/{finding_id}/candidates", response_model=None)
def finding_candidates(finding_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(ConnectorFinding, finding_id)
    if row is None:
        raise HTTPException(404, "Finding not found")
    return candidate_entities(db, row.investigation_id, row.caption, row.schema)


@router.post("/connector-findings/{finding_id}/resolution", response_model=None)
def resolve_finding(finding_id: str, body: ResolutionRequest, db: Session = Depends(get_db)) -> Any:
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    if body.entity_id and db.get(Entity, body.entity_id) is None:
        raise HTTPException(404, "Entity not found")
    try:
        return create_resolution_decision(db, finding, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/connector-findings/{finding_id}/assessments", response_model=None)
def list_assessments(finding_id: str, db: Session = Depends(get_db)) -> Any:
    return list_statement_assessments(db, finding_id)


@router.post("/connector-findings/{finding_id}/assessments", response_model=None)
def assess_statement(finding_id: str, body: StatementAssessmentRequest, db: Session = Depends(get_db)) -> Any:
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    if body.entity_id and db.get(Entity, body.entity_id) is None:
        raise HTTPException(404, "Entity not found")
    try:
        return create_statement_assessment(db, finding, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
