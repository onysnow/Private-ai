"""Extraction-candidate endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 3). All three already delegate fully to
app/services/documents.py; this module just wires 404s and the
review-validation ValueError to HTTP status codes.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import ExtractionCandidate
from app.schemas.api import ExtractionCandidateReviewRequest
from app.services.documents import preview_entity_candidate_matches, review_candidate, serialize_extraction_lineage

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/extraction-candidates/{candidate_id}/entity-matches", response_model=None)
def get_extraction_entity_matches(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return preview_entity_candidate_matches(db, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/extraction-candidates/{candidate_id}/lineage", response_model=None)
def get_extraction_candidate_lineage(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    return serialize_extraction_lineage(db, row)


@router.post("/extraction-candidates/{candidate_id}/review", response_model=None)
def review_extraction_candidate(candidate_id: str, body: ExtractionCandidateReviewRequest, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return review_candidate(db, row, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
