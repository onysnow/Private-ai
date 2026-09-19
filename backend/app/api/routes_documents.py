"""Document endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E
group 5). OpenAleph-corpus sync/review endpoints already delegated
fully to app/services/openaleph_corpus.py. Detail/candidates queries
moved into app/services/documents.py (get_document_detail,
list_document_candidates) alongside ingest_document/serialize_document.

GET /investigations/{investigation_id}/documents stays in routes.py:
its URL prefix is /investigations, so it belongs with group 8.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource, read_upload_limited
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import Document, Investigation
from app.services.documents import (
    get_document_detail, ingest_document, list_document_candidates, serialize_document,
)
from app.services.openaleph_corpus import (
    get_document_sync, get_openaleph_review_status, import_openaleph_entity_candidates,
    import_openaleph_evidence_candidates, record_openaleph_operation_failure,
    refresh_openaleph_review_candidates, serialize_sync, sync_document_to_openaleph,
)
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/documents/{document_id}/corpus/openaleph")
def get_openaleph_document_sync(document_id: str, db: Session = Depends(get_db)):
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return {"sync": serialize_sync(get_document_sync(db, document_id))}


@router.get("/documents/{document_id}/corpus/openaleph/review-status")
def get_openaleph_document_review_status(document_id: str, db: Session = Depends(get_db)):
    """Report provider sync plus human-review queue progress for one document."""
    try:
        return get_openaleph_review_status(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/documents/{document_id}/corpus/openaleph/sync")
def sync_openaleph_document(document_id: str, db: Session = Depends(get_db)):
    try:
        row = sync_document_to_openaleph(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"sync": serialize_sync(row)}


@router.post("/documents/{document_id}/corpus/openaleph/refresh-review")
def refresh_openaleph_document_review(document_id: str, request: Request, db: Session = Depends(get_db)):
    """Refresh OpenAleph Page + Mention candidates without auto-accepting either."""
    try:
        return refresh_openaleph_review_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        db.rollback()
        doc = db.get(Document, document_id)
        if doc is not None:
            record_openaleph_operation_failure(
                db, investigation_id=doc.investigation_id, document_id=document_id,
                operation="refresh_review", error=f"{exc.__class__.__name__}: {exc}",
            )
        raise HTTPException(502, f"OpenAleph review refresh failed. Details were logged server-side (request {request.state.request_id}).")


@router.post("/documents/{document_id}/corpus/openaleph/import-evidence")
def import_openaleph_document_evidence(document_id: str, request: Request, db: Session = Depends(get_db)):
    """Stage OpenAleph page text as review-required evidence candidates."""
    try:
        return import_openaleph_evidence_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        db.rollback()
        doc = db.get(Document, document_id)
        if doc is not None:
            record_openaleph_operation_failure(
                db, investigation_id=doc.investigation_id, document_id=document_id,
                operation="import_evidence", error=f"{exc.__class__.__name__}: {exc}",
            )
        raise HTTPException(502, f"OpenAleph extraction import failed. Details were logged server-side (request {request.state.request_id}).")


@router.post("/documents/{document_id}/corpus/openaleph/import-entities")
def import_openaleph_document_entities(document_id: str, request: Request, db: Session = Depends(get_db)):
    """Stage OpenAleph/ftm-analyze Mention entities for explicit reporter review."""
    try:
        return import_openaleph_entity_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        db.rollback()
        doc = db.get(Document, document_id)
        if doc is not None:
            record_openaleph_operation_failure(
                db, investigation_id=doc.investigation_id, document_id=document_id,
                operation="import_entities", error=f"{exc.__class__.__name__}: {exc}",
            )
        raise HTTPException(502, f"OpenAleph entity import failed. Details were logged server-side (request {request.state.request_id}).")


@router.post("/documents/upload")
async def upload_document(
    investigation_id: str = Form(...),
    title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    data = await read_upload_limited(file, settings.max_document_bytes)
    if not data:
        raise HTTPException(400, "Document is empty")
    try:
        doc = ingest_document(
            db, investigation_id=investigation_id, title=title or file.filename or "Document",
            filename=file.filename or "document", mime_type=file.content_type, data=data,
            storage_dir=resolve_storage_root(settings.document_storage_dir),
        )
    except ValueError as exc:
        if str(exc) == "Investigation not found":
            raise HTTPException(404, str(exc))
        raise
    if doc.extraction_status == "failed":
        raise HTTPException(422, jsonable_encoder({
                "message": "Document saved but extraction failed",
                "document": serialize_document(db, doc),
                "error": doc.extraction_error,
            }))
    result = serialize_document(db, doc)
    if settings.openaleph_enabled and settings.openaleph_auto_sync_documents:
        sync_row = sync_document_to_openaleph(db, doc.id)
        result["openaleph_sync"] = serialize_sync(sync_row)
    else:
        result["openaleph_sync"] = serialize_sync(get_document_sync(db, doc.id))
    return result


@router.get("/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)):
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    return get_document_detail(db, row)


@router.get("/documents/{document_id}/candidates")
def list_document_candidates_endpoint(document_id: str, status: str | None = None, candidate_type: str | None = None, db: Session = Depends(get_db)):
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return list_document_candidates(db, document_id, status, candidate_type)
