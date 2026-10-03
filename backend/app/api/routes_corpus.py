"""The OpenAleph corpus copy of confirmed records (ADR-0006, Wave B).

GET .../corpus/sync is the "Corpus sync" line: the last push, what is still
to send or remove, the last cross-referencing run, and recent failures. POST
asks for a push now: queued for the background worker in the product, run
inside the request in developer mode (no worker there).

GET .../cross-references lists OpenAleph's matches for the investigation's
confirmed entities that wait for a reporter; POST /cross-references/{id}/decision
records "Same entity", "Different" or "Not sure", with a note.

POST /entities/{id}/corpus/expand asks OpenAleph what surrounds a confirmed
entity and proposes it for review (app/services/corpus_expand.py).
"""

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import ensure_scope_can_mutate_ids, scope_for_request
from app.core.config import settings
from app.db.session import build_session_factory, get_db
from app.jobs import corpus as corpus_jobs
from app.jobs.corpus import queue_sync_now, runs_in_background, sync_now
from app.models.domain import CrossReferenceProposal, Entity, Investigation
from app.schemas.api import CrossReferenceDecisionRequest
from app.schemas.responses import CorpusExpandOut, CorpusInsightsOut, CorpusSyncNowOut, CorpusSyncOut, CrossReferenceOut
from app.services.corpus_expand import NotInCorpus, expand_in_corpus
from app.services.corpus_push import corpus_sync_status
from app.services.cross_references import decide_cross_reference, list_cross_references, visible_to
from app.services.openaleph_discover import corpus_insights
from app.services.openaleph_gateway import OpenAlephNotFound

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _status(db: Session, request: Request, investigation_id: str) -> dict[str, Any]:
    try:
        return corpus_sync_status(db, investigation_id, background=runs_in_background(db), scope=scope_for_request(request))
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/corpus/sync", response_model=CorpusSyncOut)
def get_corpus_sync(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _status(db, request, investigation_id)


@router.post("/investigations/{investigation_id}/corpus/sync", response_model=CorpusSyncNowOut)
def sync_corpus_now(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    investigation = db.get(Investigation, investigation_id)
    if investigation is None:
        raise HTTPException(404, "Investigation not found")
    # Reading is not enough: a push writes to the investigation's corpus.
    ensure_scope_can_mutate_ids(scope_for_request(request), [investigation_id])
    if not settings.openaleph_enabled:
        raise HTTPException(409, "OpenAleph integration is disabled on this deployment")
    if investigation.is_demo:
        raise HTTPException(409, "The demo investigation is never sent to OpenAleph")
    if runs_in_background(db):
        queue_sync_now(db, investigation_id)
        return {"queued": True, "ran": False, "sync": _status(db, request, investigation_id)}
    # Developer mode: no worker, so the push (and what follows it) runs here.
    # Failures are recorded on the sync state, not raised: the line shows them.
    # The request's own read ends first, so it holds no lock while the steps write.
    db.rollback()
    bind = db.get_bind()
    engine = bind if isinstance(bind, Engine) else bind.engine
    sync_now(build_session_factory(engine), investigation_id)
    db.expire_all()
    return {"queued": False, "ran": True, "sync": _status(db, request, investigation_id)}


@router.get("/investigations/{investigation_id}/corpus/insights", response_model=CorpusInsightsOut)
def get_corpus_insights(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The names that stand out in the investigation's corpus, from OpenAleph's
    discovery (ADR-0006, Wave C), each marked when it is already a record or a
    lead. OpenAleph being off or unreachable is a state in the reply."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return corpus_insights(db, investigation_id)


@router.get("/investigations/{investigation_id}/cross-references", response_model=list[CrossReferenceOut])
def list_investigation_cross_references(
    investigation_id: str, request: Request, status: Literal["open", "decided", "all"] = "open",
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return list_cross_references(db, investigation_id, scope=scope_for_request(request),
                                 status=None if status == "all" else status)


@router.post("/cross-references/{cross_reference_id}/decision", response_model=CrossReferenceOut)
def decide_investigation_cross_reference(
    cross_reference_id: str, body: CrossReferenceDecisionRequest, request: Request, db: Session = Depends(get_db),
) -> dict[str, Any]:
    proposal = db.get(CrossReferenceProposal, cross_reference_id)
    scope = scope_for_request(request)
    # A match held in an investigation the reader may not see is not there for them.
    if proposal is None or not visible_to(proposal, scope):
        raise HTTPException(404, "Cross-reference not found")
    ensure_scope_can_mutate_ids(scope, [proposal.investigation_id])
    try:
        return decide_cross_reference(db, proposal, decision=body.decision, note=body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/entities/{entity_id}/corpus/expand", response_model=CorpusExpandOut)
def expand_entity_in_corpus(entity_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    # It writes findings and leads into the investigation.
    ensure_scope_can_mutate_ids(scope_for_request(request), [entity.investigation_id])
    if not settings.openaleph_enabled:
        raise HTTPException(409, "OpenAleph integration is disabled on this deployment")
    investigation = db.get(Investigation, entity.investigation_id)
    if investigation is not None and investigation.is_demo:
        raise HTTPException(409, "The demo investigation is never sent to OpenAleph")
    try:
        return expand_in_corpus(db, entity, gateway=corpus_jobs.gateway_factory())
    except (NotInCorpus, ValueError) as exc:
        raise HTTPException(409, str(exc))
    except OpenAlephNotFound as exc:  # recorded by expand_in_corpus
        raise HTTPException(409, f"OpenAleph does not hold this entity yet: {exc}")
    except httpx.HTTPError as exc:  # unreachable or refusing; recorded by expand_in_corpus
        raise HTTPException(502, f"OpenAleph could not expand this entity: {type(exc).__name__}")
