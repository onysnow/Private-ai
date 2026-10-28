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

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import authorize_request_resource, read_upload_limited
from app.core.authorization import require_scope_investigation, scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.jobs.handlers import ANALYZE_DOCUMENT, EXTRACT_DOCUMENT, FIND_CHILDREN
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Document, IngestionBatch, Investigation
from app.schemas.api import IngestionBatchCreate
from app.schemas.responses import file_response
from app.schemas.responses import (
    BackgroundJobOut, DocumentDetailOut, DocumentEmailOut, DocumentFormatsOut, DocumentReadFailedOut, DocumentUploadOut,
    DocumentTranslationOut, DuplicateDocumentOut, ErrorOut, IngestionBatchesOut, IngestionBatchOut,
    ExtractionCandidateOut, OpenAlephDocumentSyncOut, OpenAlephEntityImportOut, OpenAlephEvidenceImportOut,
    OpenAlephReviewRefreshOut, OpenAlephReviewStatusOut, SimilarDocumentsOut, ValidationErrorOut, upstream,
)
from app.services.document_formats import UnsupportedFormat, accepted_formats, check_upload
from app.services.email_documents import document_email
from app.services.openaleph_children import is_container
from app.services.openaleph_search import similar_documents
from app.services.openaleph_translation import document_translation
from app.services.documents import (
    get_document_detail, list_document_candidates, serialize_document, sha256_bytes, store_document,
)
from app.services.ingestion_batches import (
    batch_for_upload, create_batch, find_duplicate, list_batches, record_item, serialize_batch,
)
from app.services.openaleph_corpus import (
    get_document_sync, get_openaleph_review_status, import_openaleph_entity_candidates,
    import_openaleph_evidence_candidates, record_openaleph_operation_failure,
    refresh_openaleph_review_candidates, serialize_sync, sync_document_to_openaleph,
)
from app.services.image_reader import NotAPicture, stored_picture
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
        logger.exception("OpenAleph document synchronization failed")
        raise HTTPException(503, "OpenAleph synchronization failed; details are in the server log.") from exc
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


@router.post("/documents/{document_id}/openaleph/children", response_model=BackgroundJobOut)
async def find_openaleph_children(document_id: str, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """"Look for files inside again": list an archive's or an email's files
    in OpenAleph once more and add, as documents under it, those the
    Workbench does not hold yet (ADR-0006, Wave A). A background job, like
    "Find names again"."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    sync = get_document_sync(db, document_id)
    if sync is None or sync.status != "synced" or not sync.provider_record_id:
        raise HTTPException(409, "This document is not in OpenAleph, so OpenAleph holds no files inside it")
    if not is_container(str((sync.response_json or {}).get("schema") or "")):
        raise HTTPException(409, "Only an archive or an email has files inside")
    runner = job_runner(request)
    job = create_job(
        db, kind=FIND_CHILDREN, investigation_id=doc.investigation_id,
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


@router.get("/documents/{document_id}/similar", response_model=SimilarDocumentsOut)
def get_similar_documents(document_id: str, limit: int = Query(default=10, ge=1, le=50), db: Session = Depends(get_db)) -> Any:
    """Documents of the same investigation whose text is like this one's,
    from OpenAleph's more_like_this (ADR-0006, Wave A), each linked to its
    Workbench document. A document OpenAleph does not hold, or OpenAleph
    not answering, is a ``state`` of the reply."""
    try:
        return similar_documents(db, document_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/documents/{document_id}/email", response_model=DocumentEmailOut)
def get_document_email(document_id: str, db: Session = Depends(get_db)) -> Any:
    """An email document's headers (as OpenAleph read them) and its thread
    from OpenAleph, each message linked to its Workbench document when the
    Workbench holds it. 404 for a document that is not an email."""
    try:
        return document_email(db, document_id)
    except ValueError as exc:   # NotAnEmail is one
        raise HTTPException(404, str(exc))


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


@router.get("/document-formats", response_model=DocumentFormatsOut)
def get_document_formats() -> Any:
    """The kinds of file an upload accepts now: every format OpenAleph's
    ingest-file reads while OpenAleph reads uploads, else the Workbench's
    own reader's list. ``accept`` is ready for a file picker."""
    return accepted_formats()


@router.post("/investigations/{investigation_id}/ingestion-batches", response_model=IngestionBatchOut)
def create_ingestion_batch(investigation_id: str, body: IngestionBatchCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Start a bulk import; each upload then names it (``batch_id``)."""
    try:
        batch = create_batch(db, investigation_id, label=body.label, created_by=scope_for_request(request).actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    return serialize_batch(db, batch)


@router.get("/investigations/{investigation_id}/ingestion-batches", response_model=IngestionBatchesOut)
def list_ingestion_batches(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The investigation's recent bulk imports, newest first, with how many files each saved, found already there, or refused."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"batches": list_batches(db, investigation_id)}


@router.get("/ingestion-batches/{batch_id}", response_model=IngestionBatchOut)
def get_ingestion_batch(batch_id: str, db: Session = Depends(get_db)) -> Any:
    """A bulk import: what happened to each file, every document to review with its live status, and the order to review them in."""
    batch = db.get(IngestionBatch, batch_id)
    if batch is None:
        raise HTTPException(404, "Import batch not found")
    return serialize_batch(db, batch)


@router.post("/documents/upload", response_model=DocumentUploadOut, responses={
    202: {"model": DocumentUploadOut, "description": "Saved; the document is read by a background job (follow `job`)"},
    409: {"model": DuplicateDocumentOut, "description": "The same bytes are already a document of this investigation (send allow_duplicate to keep a second copy)"},
    415: {"model": ErrorOut, "description": "The reader this deployment uses cannot read this kind of file (GET /api/document-formats)"},
    422: {"model": ValidationErrorOut | DocumentReadFailedOut,
          "description": "The input does not match the route, or the file was saved but could not be read"},
})
async def upload_document(
    request: Request,
    response: Response,
    investigation_id: str = Form(...),
    title: str = Form(""),
    file: UploadFile = File(...),
    batch_id: str | None = Form(None),
    allow_duplicate: bool = Form(False),
    db: Session = Depends(get_db),
) -> Any:
    """Save the file, then read it as a background job.

    On PostgreSQL (the product) this answers 202 as soon as the file is saved:
    the document is ``queued`` and ``job`` says how to follow it
    (GET /api/jobs/{id}). In developer mode (SQLite) the job runs before the
    reply, off the event loop, so the answer is the read document as before.
    """
    # investigation_id is a form field, not a path id, so the router's read check
    # does not see it; without this a caller could learn what another case holds
    # (a duplicate upload answers with that case's document record).
    require_scope_investigation(scope_for_request(request), investigation_id)
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        batch = batch_for_upload(db, batch_id, investigation_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    filename = file.filename or "document"

    def refused(status: int, message: str) -> HTTPException:
        # A file the batch could not take is listed with why (Phase 2).
        if batch is not None:
            record_item(db, batch, filename=filename, outcome="refused", error=message)
        return HTTPException(status, message)

    try:
        check_upload(file.filename, file.content_type)
    except UnsupportedFormat as exc:
        raise refused(415, str(exc))
    try:
        data = await read_upload_limited(file, settings.max_document_bytes)
    except HTTPException as exc:
        raise refused(exc.status_code, str(exc.detail))
    if not data:
        raise refused(400, "Document is empty")
    if not allow_duplicate:
        existing = find_duplicate(db, investigation_id, sha256_bytes(data))
        if existing is not None:
            if batch is not None:
                record_item(db, batch, filename=filename, outcome="duplicate", document_id=existing.id)
            raise HTTPException(409, jsonable_encoder({
                "message": f"Already in this investigation as “{existing.filename}”",
                "document": serialize_document(db, existing),
            }))
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
    if batch is not None:
        record_item(db, batch, filename=filename, outcome="saved", document_id=doc.id)
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


@router.get("/documents/{document_id}/picture", response_class=Response,
            responses=file_response("image/png", "The picture this document is, as uploaded (PNG or JPEG)"))
def get_document_picture(document_id: str, db: Session = Depends(get_db)) -> Response:
    """The picture a document is (app/services/image_reader.py), for the app to
    show beside its evidence. Its type is read from its bytes; it is sent so
    a browser shows it and never runs it as anything else."""
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    try:
        data, picture = stored_picture(row.storage_path, resolve_storage_root(settings.document_storage_dir))
    except NotAPicture as exc:
        raise HTTPException(415, f"This document is not a picture: {exc}") from exc
    except OSError as exc:
        raise HTTPException(404, "The document's stored file is not available") from exc
    return Response(content=data, media_type=picture.mime_type, headers={
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline"})


@router.get("/documents/{document_id}/page-image", response_class=Response,
            responses=file_response("image/png", "One page of the document drawn as a picture, the passage marked"))
def get_document_page_image(document_id: str, page: int = Query(1, ge=1), width: int = Query(360, ge=120, le=1600),
                            highlight: str = Query("", max_length=2000), crop: bool = Query(False), db: Session = Depends(get_db)) -> Response:
    """A page of a PDF as PNG, with the passage's words highlighted where they are
    found (X-Passage-Found says whether they were), for Next up's page beside the question.
    With `crop`, only the band of the page around the words is drawn."""
    from app.services.page_image import NoPage, page_png

    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    try:
        data, pages, found = page_png(row.storage_path, resolve_storage_root(settings.document_storage_dir), page, width=width, highlight=highlight, crop=crop)
    except NoPage as exc:
        raise HTTPException(415 if "Only a PDF" in str(exc) else 404, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(404, "The document's stored file is not available") from exc
    return Response(content=data, media_type="image/png", headers={
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline", "X-Page-Count": str(pages), "X-Passage-Found": "1" if found else "0"})


@router.get("/documents/{document_id}/translation", response_model=DocumentTranslationOut)
def get_document_translation(document_id: str, db: Session = Depends(get_db)) -> Any:
    """OpenAleph's machine translation of the document, page by page beside the
    original, when the optional translation service made one (ADR-0006, Wave C)."""
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    return document_translation(db, row)


@router.get("/documents/{document_id}/candidates", response_model=list[ExtractionCandidateOut])
def list_document_candidates_endpoint(document_id: str, status: str | None = None, candidate_type: str | None = None, explain: bool = False, db: Session = Depends(get_db)) -> Any:
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return list_document_candidates(db, document_id, status, candidate_type, explain=explain)
