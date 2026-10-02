"""System, search, and small single-endpoint domains.

First extraction group out of app/api/routes.py (STRUCT-0002/0008):
health, capabilities, the OpenAleph integration status probe, search,
timeline-event creation, relationship schemas, the AI-analysis-candidate
review endpoint, evidence creation, and statement-assessment promotion.
These were bundled together because each is a single endpoint with no
natural larger domain of its own -- see REMEDIATION_PROMPT.md Stage E
group 1 for why this grouping was chosen (smallest/lowest-risk first).

Each handler below is a thin HTTP adapter: existence/404 checks happen
here, and any real validation or persistence logic lives in the
matching app/services/ module, following the pattern app/ai/reasoning.py
already established for issue #36.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import AIAnalysisCandidate, Investigation, Source, StatementAssessment
from app.schemas.responses import EvidenceOut
from app.schemas.api import (
    AIAnalysisCandidateReviewRequest,
    EvidenceCreate,
    PromoteToDeckRequest,
    PromoteToWriteupRequest,
    StatementPromotionRequest,
    TimelineEventCreate,
)
from app.ai.reasoning import review_ai_analysis_candidate, serialize_ai_analysis_candidate
from app.services.decks import serialize_deck
from app.services.evidence import create_evidence
from app.services.openaleph import probe_openaleph
from app.services.assistant_context import describe_record_refs
from app.services.presentation import PROMOTABLE_MODULE, deck_slides_from_payload, payload_citation_refs, promote_candidate_to_deck, promote_candidate_to_writeup
from app.services.promotion import promote_assessment
from app.services.presentation_style import catalog as presentation_style_catalog
from app.services.relationships import RELATIONSHIP_SCHEMAS
from app.services.search import investigation_search
from app.services.timeline import create_timeline_event
from app.services.writeups import serialize_writeup

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/health", response_model=None)
def health() -> dict[str, Any]:
    return {"status": "ok"}


@router.get("/capabilities", response_model=None)
def capabilities() -> dict[str, Any]:
    """Describe the runnable core preview without making AI a startup dependency."""
    return {
        "product": "Journalism Workbench",
        "mode": "integrated_preview" if settings.openaleph_enabled else "core_preview",
        "ai_features_enabled": settings.enable_ai_features,
        "core": {
            "investigations": True,
            "documents": True,
            "sources": True,
            "evidence": True,
            "claims": True,
            "relationships": True,
            "search": True,
            "dossiers": True,
            "timeline": True,
            "leads_and_tasks": True,
            "provenance": True,
            "connectors": True,
            "backup_restore": True,
        },
        "platforms": {
            "openaleph": {
                "enabled": settings.openaleph_enabled,
                "role": "local_corpus_search_ingestion_platform",
            },
        },
        "note": "AI is optional and is not required for the core investigative application to run.",
    }


@router.get("/integrations/openaleph/status", response_model=None)
async def openaleph_integration_status() -> Any:
    """Report whether the local OpenAleph corpus platform is actually reachable."""
    return (await probe_openaleph()).to_dict()


@router.get("/search", response_model=None)
def search_workbench(
    request: Request,
    q: str = Query(..., min_length=1),
    investigation_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    include_reconciled_duplicates: bool = False,
    db: Session = Depends(get_db),
) -> Any:
    """Search canonical and evidentiary records without conflating external findings with facts."""
    scope = scope_for_request(request)
    allowed_ids = None if scope.unrestricted else scope.investigation_ids
    try:
        return investigation_search(
            db, q, investigation_id=investigation_id, limit=limit,
            allowed_investigation_ids=allowed_ids, include_reconciled_duplicates=include_reconciled_duplicates,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/timeline-events", response_model=None)
def create_timeline_event_endpoint(body: TimelineEventCreate, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return create_timeline_event(db, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/presentation-styles", response_model=None)
def presentation_styles() -> dict[str, Any]:
    """Themes, font pairings and per-visual presets/options for decks --
    the one catalogue both the .pptx export and the in-app preview read."""
    return presentation_style_catalog()


@router.get("/relationship-schemas", response_model=None)
def relationship_schemas() -> dict[str, Any]:
    return {"schemas": RELATIONSHIP_SCHEMAS}


@router.get("/ai-analysis-candidates/{candidate_id}", response_model=None)
def get_ai_analysis_candidate_endpoint(candidate_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(AIAnalysisCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "AI analysis candidate not found")
    data = serialize_ai_analysis_candidate(row)
    if row.module == PROMOTABLE_MODULE:
        # Readable labels for every ref the draft cites, so the review panel
        # can show "Ex. 14, p. 3" + the quote instead of a UUID.
        data["citation_details"] = describe_record_refs(db, investigation_id=row.investigation_id, refs=payload_citation_refs(row.payload))
        # The exact slides a promotion would create, for the panel's preview.
        data["deck_preview"] = deck_slides_from_payload(row.payload or {})
    return data


@router.post("/ai-analysis-candidates/{candidate_id}/review", response_model=None)
def review_ai_analysis_candidate_endpoint(candidate_id: str, body: AIAnalysisCandidateReviewRequest, db: Session = Depends(get_db)) -> Any:
    row = db.get(AIAnalysisCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "AI analysis candidate not found")
    try:
        return review_ai_analysis_candidate(db, row, decision=body.decision, note=body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/ai-analysis-candidates/{candidate_id}/promote-to-writeup", response_model=None)
def promote_ai_analysis_candidate_to_writeup_endpoint(candidate_id: str, body: PromoteToWriteupRequest, db: Session = Depends(get_db)) -> Any:
    """Turn an accepted presentation_draft candidate into a reporter-editable
    Writeup (see app/services/presentation.py). Not idempotent -- each call
    creates a new write-up, since a reporter may want more than one brief
    from the same underlying draft."""
    row = db.get(AIAnalysisCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "AI analysis candidate not found")
    try:
        writeup = promote_candidate_to_writeup(db, row, title=body.title)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_writeup(writeup)


@router.post("/ai-analysis-candidates/{candidate_id}/promote-to-deck", response_model=None)
def promote_ai_analysis_candidate_to_deck_endpoint(candidate_id: str, body: PromoteToDeckRequest, db: Session = Depends(get_db)) -> Any:
    """Turn an accepted presentation_draft candidate into a reporter-editable
    Deck (see app/services/presentation.py). Not idempotent, for the same
    reason as the write-up promotion endpoint above."""
    row = db.get(AIAnalysisCandidate, candidate_id)
    if row is None:
        raise HTTPException(404, "AI analysis candidate not found")
    try:
        deck = promote_candidate_to_deck(
            db, row, title=body.title,
            style=body.style.model_dump() if body.style else None,
            visual_styles={key: value.model_dump() for key, value in body.visual_styles.items()},
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_deck(deck)


@router.post("/evidence", response_model=EvidenceOut)
def create_evidence_endpoint(body: EvidenceCreate, db: Session = Depends(get_db)) -> Any:
    source = db.get(Source, body.source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    try:
        return create_evidence(db, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/statement-assessments/{assessment_id}/promote", response_model=None)
def promote_statement_assessment(assessment_id: str, body: StatementPromotionRequest, db: Session = Depends(get_db)) -> Any:
    assessment = db.get(StatementAssessment, assessment_id)
    if assessment is None:
        raise HTTPException(404, "Statement assessment not found")
    try:
        return promote_assessment(db, assessment, body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
