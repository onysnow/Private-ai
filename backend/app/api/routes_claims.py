"""Claim endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E group
4). Validation and persistence live in app/services/claims.py
(validate_claim_fields, create_claim, update_claim, link_claim_evidence,
list_claim_evidence), review_claim/claim_review_workspace already did.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Claim, Evidence, Investigation
from app.schemas.api import (
    ClaimCreate, ClaimEvidenceLinkCreate, ClaimReviewRequest, ClaimUpdate,
    ExtractedRelationshipProposalCreate,
)
from app.services.claims import (
    claim_review_workspace, create_claim, link_claim_evidence, list_claim_evidence,
    review_claim, update_claim, validate_claim_fields,
)
from app.services.documents import propose_relationship_from_extracted_claim

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/claims/{claim_id}/relationship-proposals")
def create_extracted_relationship_proposal(claim_id: str, body: ExtractedRelationshipProposalCreate, db: Session = Depends(get_db)):
    try:
        row = propose_relationship_from_extracted_claim(db, claim_id=claim_id, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {
        'id': row.id, 'investigation_id': row.investigation_id, 'document_id': row.document_id,
        'chunk_id': row.chunk_id, 'candidate_type': row.candidate_type, 'payload': row.payload,
        'confidence': row.confidence, 'review_status': row.review_status,
    }


@router.post("/claims/{claim_id}/evidence")
def link_claim_evidence_endpoint(claim_id: str, body: ClaimEvidenceLinkCreate, db: Session = Depends(get_db)):
    claim = db.get(Claim, claim_id)
    evidence = db.get(Evidence, body.evidence_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    if evidence is None:
        raise HTTPException(404, "Evidence not found")
    try:
        return link_claim_evidence(db, claim, evidence, stance=body.stance, note=body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/claims/{claim_id}/evidence")
def list_claim_evidence_endpoint(claim_id: str, db: Session = Depends(get_db)):
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    return list_claim_evidence(db, claim_id)


@router.post("/claims")
def create_claim_endpoint(body: ClaimCreate, db: Session = Depends(get_db)):
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return create_claim(db, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/claims/{claim_id}/review-workspace")
def get_claim_review_workspace(claim_id: str, db: Session = Depends(get_db)):
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    return claim_review_workspace(db, row)


@router.post("/claims/{claim_id}/reviews")
def create_claim_review(claim_id: str, body: ClaimReviewRequest, db: Session = Depends(get_db)):
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    try:
        validate_claim_fields(status=body.status, confidence=body.confidence)
        claim, event = review_claim(db, row, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"claim": claim, "review": event, "workspace": claim_review_workspace(db, claim)}


@router.patch("/claims/{claim_id}")
def update_claim_endpoint(claim_id: str, body: ClaimUpdate, db: Session = Depends(get_db)):
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    changes = body.model_dump(exclude_unset=True)
    try:
        return update_claim(db, row, changes)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
