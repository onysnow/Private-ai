"""The OpenAleph corpus copy of confirmed records (ADR-0006, Wave B).

GET .../corpus/sync is the "Corpus sync" line: the last push, what is still
to send or remove, and recent failures. POST asks for a push now: queued for
the background worker in the product, run inside the request in developer
mode (no worker there).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import ensure_scope_can_mutate_ids, scope_for_request
from app.core.config import settings
from app.db.session import build_session_factory, get_db
from app.jobs.corpus import queue_sync_now, runs_in_background, sync_now
from app.models.domain import Investigation
from app.schemas.responses import CorpusSyncNowOut, CorpusSyncOut
from app.services.corpus_push import corpus_sync_status

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _status(db: Session, investigation_id: str) -> dict[str, Any]:
    try:
        return corpus_sync_status(db, investigation_id, background=runs_in_background(db))
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/corpus/sync", response_model=CorpusSyncOut)
def get_corpus_sync(investigation_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _status(db, investigation_id)


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
        return {"queued": True, "ran": False, "sync": _status(db, investigation_id)}
    # Developer mode: no worker, so the push (and what follows it) runs here.
    # Failures are recorded on the sync state, not raised: the line shows them.
    # The request's own read ends first, so it holds no lock while the steps write.
    db.rollback()
    bind = db.get_bind()
    engine = bind if isinstance(bind, Engine) else bind.engine
    sync_now(build_session_factory(engine), investigation_id)
    db.expire_all()
    return {"queued": False, "ran": True, "sync": _status(db, investigation_id)}
