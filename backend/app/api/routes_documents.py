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
from app.jobs.handlers import ANALYZE_DOCUMENT, EXTRACT_DOCUMENT
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Document, Investigation
from app.schemas.responses import (
    BackgroundJobOut, DocumentDetailOut, DocumentReadFailedOut, DocumentUploadOut, ExtractionCandidateOut, OpenAlephDocumentSyncOut,
    OpenAlephEntityImportOut, OpenAlephEvidenceImportOut, OpenAlephReviewRefreshOut, OpenAlephReviewStatusOut,
    ValidationErrorOut, upstream,
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


@router.post("/documents/{document_id}/corpus/openaleph/sync", response_model=OpenAlephDocumentSyncOut, responses=upstream("OpenAleph", 503))
def sync_openaleph_document(document_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        row = sync_document_to_openaleph(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"sync": serialize_sync(row)}


@router.post("/documents/{document_id}/corpus/openaleph/refresh-review", response_model=OpenAlephReviewRefreshOut,
             responses=upstream("OpenAleph", 502))
def refresh_openaleph_document_review(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Refresh OpenAleph page-text and name proposals without auto-accepting either."""
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


@router.post("/documents/{document_id}/corpus/openaleph/import-evidence", response_model=OpenAlephEvidenceImportOut,
             responses=upstream("OpenAleph", 502))
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


@router.post("/documents/{document_id}/corpus/openaleph/import-entities", response_model=OpenAlephEntityImportOut,
             responses=upstream("OpenAleph", 502))
def import_openaleph_document_entities(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Stage the names, IBANs, emails and phones OpenAleph's ftm-analyze left on
    the document for explicit reporter review (ADR-0006). Reads what is
    there now; "Find names again" (…/openaleph/analyze) asks for a new run."""
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


@router.post("/documents/{document_id}/openaleph/analyze", response_model=BackgroundJobOut)
async def analyze_openaleph_document(document_id: str, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """"Find names again": OpenAleph analyses the document again
    (POST /api/2/entities/{id}/analyze) and what it finds becomes proposals,
    as a background job (ADR-0006). Answers 202 with the job while it runs;
    in developer mode (SQLite) the job has finished when this answers."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    sync = get_document_sync(db, document_id)
    if sync is None or sync.status != "synced" or not sync.provider_record_id:
        raise HTTPException(409, "This document is not in OpenAleph, so OpenAleph cannot look for names in it")
    runner = job_runner(request)
    job = create_job(
        db, kind=ANALYZE_DOCUMENT, investigation_id=doc.investigation_id,
        subject_type="document", subject_id=doc.id, runner=runner.mode,
    )
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    row = db.get(BackgroundJob, job.id)
    if row is None:  # its investigation was deleted meanwhile
        raise HTTPException(404, "Document not found")
    job_out = serialize_job(row)
    if not job_out["finished"]:
        response.status_code = 202
    return job_out


async def _submit_or_record_failure(request: Request, job: BackgroundJob, db: Session) -> None:
    """Hand a job to the runner; if it cannot even be queued, record why on
    the job so the reporter can retry it from the screen."""
    try:
        await job_runner(request).submit(job, db)
    except Exception as exc:
        logger.error("could not queue a job", exc_info=(type(exc), exc, exc.__traceback__), extra={"job_id": job.id})
        db.rollback()
        row = db.get(BackgroundJob, job.id)
        if row is not None:
            row.status, row.error, row.message = "failed", f"Could not queue the job: {type(exc).__name__}", "Not started"
            db.commit()


@router.post("/documents/upload", response_model=DocumentUploadOut, responses={
    202: {"model": DocumentUploadOut, "description": "Saved; the document is read by a background job (follow `job`)"},
    422: {"model": ValidationErrorOut | DocumentReadFailedOut,
          "description": "The input does not match the route, or the file was saved but could not be read"},
})
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
    # The file is saved; if reading it cannot start, the job records why so
    # the reporter can retry from the screen instead of re-uploading.
    await _submit_or_record_failure(request, job, db)
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
