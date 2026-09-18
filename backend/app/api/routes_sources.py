"""Source endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E group 2).

Existence checks and the investigation-scoped write lock stay here (the
lock must run before the 404 check, exactly as it did inline in
routes.py, so a source can't be created after its investigation's
deletion begins); persistence and validation live in
app/services/sources.py.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.locking import lock_investigation_transaction
from app.db.session import get_db
from app.models.domain import Investigation, Source
from app.schemas.api import SourceCreate
from app.services.sources import create_source, list_source_evidence

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/sources")
def create_source_endpoint(body: SourceCreate, db: Session = Depends(get_db)):
    # Source creation participates in the same investigation-scoped PostgreSQL lock
    # as document ingest/delete/restore so a source cannot commit after deletion.
    lock_investigation_transaction(db, body.investigation_id)
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return create_source(db, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/sources/{source_id}/evidence")
def list_source_evidence_endpoint(source_id: str, db: Session = Depends(get_db)):
    if db.get(Source, source_id) is None:
        raise HTTPException(404, "Source not found")
    return list_source_evidence(db, source_id)
