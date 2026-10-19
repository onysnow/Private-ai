"""Extraction-candidate endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 3). All three already delegate fully to
app/services/documents.py; this module just wires 404s and the
review-validation ValueError to HTTP status codes.
"""
from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import Entity, ExtractionCandidate
from app.schemas.api import ExtractionCandidateReviewRequest
from app.services.connectors import queue_automatic_lookups
from app.services.documents import preview_entity_candidate_matches, review_candidate, serialize_extraction_lineage
from app.services.extraction_explanations import explain_extraction_candidate
from app.schemas.responses import EntityMatchPreviewOut, SameAnswerOut, OpenAlephMatchesOut, ExtractionExplanationOut, ExtractionLineageOut, ExtractionReviewOut, IdentifierTargetsOut
from app.services.identifier_proposals import identifier_targets
from app.services.openaleph_match import openaleph_matches
from app.services.same_answer import same_answer_candidates

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/extraction-candidates/{candidate_id}/openaleph-matches", response_model=OpenAlephMatchesOut)
def get_extraction_openaleph_matches(candidate_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """What OpenAleph holds that looks like this proposed name, across every
    collection the reader may see (ADR-0006, POST /api/2/match). OpenAleph
    being off or unreachable is a state in the reply, not an error."""
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return openaleph_matches(db, row, scope=scope_for_request(request))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/extraction-candidates/{candidate_id}/entity-matches", response_model=EntityMatchPreviewOut)
def get_extraction_entity_matches(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return preview_entity_candidate_matches(db, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/extraction-candidates/{candidate_id}/same-answer", response_model=SameAnswerOut)
def get_same_answer_candidates(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    """The other waiting proposals of the same name in this proposal's drop (else the case), so one answer can
    be offered to all of them (reading room, "Answer once, apply to the batch")."""
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return same_answer_candidates(db, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/extraction-candidates/{candidate_id}/identifier-targets", response_model=IdentifierTargetsOut)
def get_identifier_targets(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    """The entities an email or phone proposal can belong to, this
    document's own first (ADR-0006). Accepting it needs one of them."""
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        return identifier_targets(db, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/extraction-candidates/{candidate_id}/lineage", response_model=ExtractionLineageOut)
def get_extraction_candidate_lineage(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    return serialize_extraction_lineage(db, row)


@router.get("/extraction-candidates/{candidate_id}/explanation", response_model=ExtractionExplanationOut)
def get_extraction_candidate_explanation(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    """Per-part reasoning and sources behind one proposal (#190). Read-only."""
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    return explain_extraction_candidate(db, row)


@router.post("/extraction-candidates/{candidate_id}/review", response_model=ExtractionReviewOut)
def review_extraction_candidate(candidate_id: str, body: ExtractionCandidateReviewRequest, request: Request,
                                background: BackgroundTasks, db: Session = Depends(get_db)) -> Any:
    row = db.get(ExtractionCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "Extraction candidate not found")
    try:
        result = review_candidate(db, row, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    # A party accepted into the case is looked up in the sources set to Automatic (Settings › Outside lookups).
    if row.accepted_record_type == "entity" and row.accepted_record_id:
        entity = db.get(Entity, row.accepted_record_id)
        if entity is not None:
            queue_automatic_lookups(db, entity, request, background)
    return result
