"""Claim endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E group
4). Validation and persistence live in app/services/claims.py
(validate_claim_fields, create_claim, update_claim, link_claim_evidence,
list_claim_evidence), review_claim/claim_review_workspace already did.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Claim, ClaimEvidenceLink, Evidence, Investigation
from app.schemas.api import (
    ClaimCreate, ClaimEvidenceLinkCreate, ClaimEvidenceSupersede, ClaimReviewRequest, ClaimUpdate,
    ExtractedRelationshipProposalCreate,
)
from app.services.claims import (
    claim_review_workspace, create_claim, link_claim_evidence, link_out, list_claim_evidence,
    review_claim, supersede_claim_evidence, unsupersede_claim_evidence, update_claim, validate_claim_fields,
)
from app.schemas.responses import (
    ClaimEvidenceLinkOut, ClaimEvidenceRowOut, ClaimOut, ClaimReviewResultOut, ClaimReviewWorkspaceOut, ExtractionCandidateOut,
)
from app.services.documents import propose_relationship_from_extracted_claim, serialize_candidate

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/claims/{claim_id}/relationship-proposals", response_model=ExtractionCandidateOut)
def create_extracted_relationship_proposal(claim_id: str, body: ExtractedRelationshipProposalCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        row = propose_relationship_from_extracted_claim(db, claim_id=claim_id, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_candidate(row)


@router.post("/claims/{claim_id}/evidence", response_model=ClaimEvidenceLinkOut)
def link_claim_evidence_endpoint(claim_id: str, body: ClaimEvidenceLinkCreate, db: Session = Depends(get_db)) -> Any:
    claim = db.get(Claim, claim_id)
    evidence = db.get(Evidence, body.evidence_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    if evidence is None:
        raise HTTPException(404, "Evidence not found")
    try:
        return link_out(db, link_claim_evidence(db, claim, evidence, stance=body.stance, note=body.note))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


def _claim_and_link(db: Session, claim_id: str, link_id: str) -> tuple[Claim, ClaimEvidenceLink]:
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    link = db.get(ClaimEvidenceLink, link_id)
    if link is None or link.claim_id != claim.id:
        raise HTTPException(404, "Evidence link not found on this claim")
    return claim, link


@router.post("/claims/{claim_id}/evidence/{link_id}/supersede", response_model=ClaimReviewWorkspaceOut)
def supersede_claim_evidence_endpoint(claim_id: str, link_id: str, body: ClaimEvidenceSupersede, db: Session = Depends(get_db)) -> Any:
    """Mark the link superseded by a newer record: it stays on the claim, struck, and no longer counts toward it.
    Marking it again changes the reason or the replacing record. The reply is the claim's workspace as it now stands."""
    claim, link = _claim_and_link(db, claim_id, link_id)
    try:
        supersede_claim_evidence(db, claim, link, reason=body.reason, by_evidence_id=body.by_evidence_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return claim_review_workspace(db, claim)


@router.delete("/claims/{claim_id}/evidence/{link_id}/supersede", response_model=ClaimReviewWorkspaceOut)
def unsupersede_claim_evidence_endpoint(claim_id: str, link_id: str, db: Session = Depends(get_db)) -> Any:
    """Undo the mark: the link counts toward the claim again."""
    claim, link = _claim_and_link(db, claim_id, link_id)
    unsupersede_claim_evidence(db, claim, link)
    return claim_review_workspace(db, claim)


@router.get("/claims/{claim_id}/evidence", response_model=list[ClaimEvidenceRowOut])
def list_claim_evidence_endpoint(claim_id: str, db: Session = Depends(get_db)) -> Any:
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    return list_claim_evidence(db, claim_id)


@router.post("/claims", response_model=ClaimOut)
def create_claim_endpoint(body: ClaimCreate, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    if body.status in {"supported", "confirmed"}:
        # The same rule PATCH holds (services/claims.update_claim): a claim
        # becomes Supported or Confirmed by a review, so the Done rules run and
        # the reason is kept on a ClaimReviewEvent.
        raise HTTPException(400, "Create the claim, then mark it Supported or Confirmed by reviewing it "
                                 "(POST /api/claims/{id}/reviews), so the Done rules run and the reason is kept")
    try:
        return create_claim(db, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/claims/{claim_id}/review-workspace", response_model=ClaimReviewWorkspaceOut)
def get_claim_review_workspace(claim_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    return claim_review_workspace(db, row)


@router.post("/claims/{claim_id}/reviews", response_model=ClaimReviewResultOut)
def create_claim_review(claim_id: str, body: ClaimReviewRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    try:
        validate_claim_fields(status=body.status, confidence=body.confidence)
        claim, event = review_claim(db, row, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"claim": claim, "review": event, "workspace": claim_review_workspace(db, claim)}


@router.patch("/claims/{claim_id}", response_model=ClaimOut)
def update_claim_endpoint(claim_id: str, body: ClaimUpdate, db: Session = Depends(get_db)) -> Any:
    row = db.get(Claim, claim_id)
    if row is None:
        raise HTTPException(404, "Claim not found")
    changes = body.model_dump(exclude_unset=True)
    try:
        return update_claim(db, row, changes)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
