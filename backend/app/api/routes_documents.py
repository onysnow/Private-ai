"""Document endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E
group 5). OpenAleph-corpus sync/review endpoints already delegated
fully to app/services/openaleph_corpus.py. Detail/candidates queries
moved into app/services/documents.py (get_document_detail,
list_document_candidates) alongside store_document/serialize_document.
Reading an upload runs as a background job (app/jobs, ADR-0004).

GET /investigations/{investigation_id}/documents stays in routes.py:
its URL prefix is /investigations, so it belongs with group 8.
"""
from typing import Any
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import authorize_request_resource, read_upload_limited
from app.core.config import settings
from app.db.session import get_db
from app.jobs.handlers import EXTRACT_DOCUMENT
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Document, Investigation
from app.schemas.responses import (
    DocumentDetailOut, DocumentUploadOut, ExtractionCandidateOut, OpenAlephDocumentSyncOut, OpenAlephEntityImportOut,
    OpenAlephEvidenceImportOut, OpenAlephReviewRefreshOut, OpenAlephReviewStatusOut,
)
from app.services.documents import (
    get_document_detail, list_document_candidates, serialize_document, store_document,
)
from app.services.openaleph_corpus import (
    get_document_sync, get_openaleph_review_status, import_openaleph_entity_candidates,
    import_openaleph_evidence_candidates, record_openaleph_operation_failure,
    refresh_openaleph_review_candidates, serialize_sync, sync_document_to_openaleph,
)
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])
logger = logging.getLogger("journalism.jobs")


@router.get("/documents/{document_id}/corpus/openaleph", response_model=OpenAlephDocumentSyncOut)
def get_openaleph_document_sync(document_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return {"sync": serialize_sync(get_document_sync(db, document_id))}


@router.get("/documents/{document_id}/corpus/openaleph/review-status", response_model=OpenAlephReviewStatusOut)
def get_openaleph_document_review_status(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Report provider sync plus human-review queue progress for one document."""
    try:
        return get_openaleph_review_status(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/documents/{document_id}/corpus/openaleph/sync", response_model=OpenAlephDocumentSyncOut)
def sync_openaleph_document(document_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        row = sync_document_to_openaleph(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"sync": serialize_sync(row)}


@router.post("/documents/{document_id}/corpus/openaleph/refresh-review", response_model=OpenAlephReviewRefreshOut)
def refresh_openaleph_document_review(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
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


@router.post("/documents/{document_id}/corpus/openaleph/import-evidence", response_model=OpenAlephEvidenceImportOut)
def import_openaleph_document_evidence(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
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


@router.post("/documents/{document_id}/corpus/openaleph/import-entities", response_model=OpenAlephEntityImportOut)
def import_openaleph_document_entities(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
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


@router.post("/documents/upload", response_model=DocumentUploadOut)
async def upload_document(
    request: Request,
    response: Response,
    investigation_id: str = Form(...),
    title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Any:
    """Save the file, then read it as a background job.

    On PostgreSQL (the product) this answers 202 as soon as the file is saved:
    the document is ``queued`` and ``job`` says how to follow it
    (GET /api/jobs/{id}). In developer mode (SQLite) the job runs before the
    reply, off the event loop, so the answer is the read document as before.
    """
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    data = await read_upload_limited(file, settings.max_document_bytes)
    if not data:
        raise HTTPException(400, "Document is empty")
    try:
        doc = await run_in_threadpool(
            store_document,
            db, investigation_id=investigation_id, title=title or file.filename or "Document",
            filename=file.filename or "document", mime_type=file.content_type, data=data,
            storage_dir=resolve_storage_root(settings.document_storage_dir),
        )
    except ValueError as exc:
        if str(exc) == "Investigation not found":
            raise HTTPException(404, str(exc))
        raise
    runner = job_runner(request)
    job = create_job(
        db, kind=EXTRACT_DOCUMENT, investigation_id=doc.investigation_id,
        subject_type="document", subject_id=doc.id, runner=runner.mode,
    )
    try:
        await runner.submit(job, db)
    except Exception as exc:
        # The file is saved; record why reading it could not start so the
        # reporter can retry from the screen instead of re-uploading.
        logger.error("could not queue document job", exc_info=(type(exc), exc, exc.__traceback__),
                     extra={"job_id": job.id})
        db.rollback()
        row = db.get(BackgroundJob, job.id)
        if row is not None:
            row.status, row.error, row.message = "failed", f"Could not queue the job: {type(exc).__name__}", "Not started"
            db.commit()
    db.expire_all()
    doc = db.get(Document, doc.id) or doc
    job_row = db.get(BackgroundJob, job.id)
    job_out = serialize_job(job_row) if job_row is not None else None
    if doc.extraction_status == "failed":
        raise HTTPException(422, jsonable_encoder({
                "message": "Document saved but extraction failed",
                "document": serialize_document(db, doc),
                "error": doc.extraction_error,
                "job": job_out,
            }))
    result = serialize_document(db, doc)
    result["job"] = job_out
    result["openaleph_sync"] = serialize_sync(get_document_sync(db, doc.id))
    if job_out is None or not job_out["finished"]:
        response.status_code = 202
    return result


@router.get("/documents/{document_id}", response_model=DocumentDetailOut)
def get_document(document_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    return get_document_detail(db, row)


@router.get("/documents/{document_id}/candidates", response_model=list[ExtractionCandidateOut])
def list_document_candidates_endpoint(document_id: str, status: str | None = None, candidate_type: str | None = None, explain: bool = False, db: Session = Depends(get_db)) -> Any:
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return list_document_candidates(db, document_id, status, candidate_type, explain=explain)
