"""The work each job kind does."""

from __future__ import annotations

from typing import TYPE_CHECKING, NoReturn

from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.records import Handler, JobFailed, Report
from app.models.jobs import BackgroundJob

if TYPE_CHECKING:
    from app.services.openaleph_reader import OpenAlephText, OpenAlephUnavailable

EXTRACT_DOCUMENT = "extract_document"
ANALYZE_DOCUMENT = "openaleph_analyze"


def _finish_openaleph_read(db: Session, document_id: str, read: OpenAlephText, report: Report) -> str:
    """Wait for OpenAleph's name-finding, make the document's chunks and
    proposals from OpenAleph's text, and stage the names it found.

    The Workbench's own pattern name-finder runs only when OpenAleph gave no
    analysis (ADR-0004, decision 5; ADR-0006).
    """
    from app.services.documents import extract_document
    from app.services.openaleph_analysis import describe_import, find_names, import_analysis_proposals

    analysis = find_names(read.collection_id, read.provider_document_id, read.schema, report)
    report(85, "Making proposals from OpenAleph's text")
    issue = analysis.issue() if read.chunks else None
    issues = [*read.issues, issue] if issue else list(read.issues)
    doc = extract_document(db, document_id, text=(read.chunks, issues), find_names=not analysis.analysed)
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status == "failed":
        raise RuntimeError(doc.extraction_error or "The document could not be read")
    report(92, "Staging the names OpenAleph found")
    made = describe_import(import_analysis_proposals(db, doc.id, analysis))
    if not read.chunks:   # a file only OpenAleph reads, in which it found no text
        return f"Read by OpenAleph (no text){'; ' + made if made else ''}"
    unit = "page" if read.chunks[0]["page_number"] is not None else "paragraph"
    message = f"Read by OpenAleph ({len(read.chunks)} {unit}(s))"
    if analysis.analysed:
        return f"{message}; {made or 'OpenAleph found no names'}"
    # Header names of an email can arrive without an analysis of its text.
    finder = ("so the Workbench's own name-finder looked for names" if settings.enable_local_entity_suggestions
              else "and the Workbench's own name-finder is switched off")
    return f"{message}; {made + '; ' if made else ''}OpenAleph gave no analysis, {finder}"


def _fail_openaleph_only_read(db: Session, document_id: str, filename: str, exc: OpenAlephUnavailable) -> NoReturn:
    """A file the Workbench's own reader cannot read (an email, an archive,
    a spreadsheet...) and OpenAleph did not read: record why on the document
    and fail the job, so the reporter can retry it from the document row
    (ADR-0006, Wave A). Nothing else can read it, so there is no fallback."""
    from app.models.domain import Document
    from app.services.document_formats import kind_of

    kind = exc.kind
    if kind == "unreachable":
        message = f"{filename} needs OpenAleph to read; retry when it is running ({exc})"
    else:
        extension = kind_of(filename, None).extension
        named = f".{extension} files" if extension else "this kind of file"
        message = f"{exc}; the Workbench's own reader cannot read {named}"
    db.rollback()
    doc = db.get(Document, document_id)
    if doc is not None:
        doc.extraction_status = "failed"
        doc.extraction_error = message
        db.commit()
    raise JobFailed(message, {"reason": "needs_openaleph" if kind == "unreachable" else f"openaleph_{kind}"})


def extract_document_job(db: Session, job: BackgroundJob, report: Report) -> str | None:
    """Read an uploaded document into chunks and proposals.

    OpenAleph reads it when that is configured (app/services/openaleph_reader.py)
    and finds its names (app/services/openaleph_analysis.py); the
    Workbench's own reader is the fallback when OpenAleph cannot deliver,
    and the job's message says which one read it and why. A failed read
    fails the job, with the reason the document also records.
    """
    from app.models.domain import Document
    from app.services.document_formats import needs_openaleph
    from app.services.documents import extract_document
    from app.services.openaleph_corpus import sync_document_to_openaleph
    from app.services.openaleph_reader import OpenAlephUnavailable, read_with_openaleph, reading_with_openaleph

    document_id = job.subject_id
    if not document_id:
        raise ValueError("Job has no document")

    fallback_reason: str | None = None
    if reading_with_openaleph():
        stored = db.get(Document, document_id)
        openaleph_only = stored is not None and needs_openaleph(stored.filename)
        try:
            read = read_with_openaleph(db, document_id, report, allow_empty=openaleph_only)
        except OpenAlephUnavailable as exc:
            if stored is not None and openaleph_only:
                _fail_openaleph_only_read(db, document_id, stored.filename, exc)
            fallback_reason = str(exc)
        else:
            return _finish_openaleph_read(db, document_id, read, report)

    report(5, "Reading the document")
    doc = extract_document(db, document_id)
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status == "failed":
        raise RuntimeError(doc.extraction_error or "The document could not be read")
    message = "Document read" if fallback_reason is None else f"Read by the Workbench's own reader; {fallback_reason}"
    if fallback_reason is None and settings.openaleph_enabled and settings.openaleph_auto_sync_documents:
        report(80, "Sending the document to OpenAleph")
        try:
            sync = sync_document_to_openaleph(db, doc.id)
        except Exception as exc:  # OpenAleph down must not undo a finished read
            db.rollback()
            return f"Document read; sending it to OpenAleph failed: {type(exc).__name__}: {exc}"
        if sync.status == "failed":
            return f"Document read; sending it to OpenAleph failed: {sync.error}"
        message = "Document read and sent to OpenAleph"
    return message


def analyze_document_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """"Find names again": ask OpenAleph to analyse a document it has read,
    wait for the result, and stage what it found as proposals (ADR-0006).
    Values already proposed for the document are not proposed again."""
    import httpx

    from app.models.domain import Document
    from app.services.openaleph_analysis import (
        AnalysisRefused, describe_import, import_analysis_proposals, request_analysis, wait_for_analysis,
    )
    from app.services.openaleph_corpus import get_document_sync

    document_id = job.subject_id
    doc = db.get(Document, document_id) if document_id else None
    if doc is None:
        raise ValueError("The document no longer exists")
    sync = get_document_sync(db, doc.id)
    if sync is None or sync.status != "synced" or not sync.provider_record_id:
        raise JobFailed("This document is not in OpenAleph, so OpenAleph cannot look for names in it",
                        {"reason": "not_in_openaleph"})
    report(10, "Asking OpenAleph to find names again")
    try:
        request_analysis(sync.provider_record_id)
    except AnalysisRefused as exc:
        raise JobFailed(str(exc), {"reason": "refused"}) from exc
    except httpx.HTTPError as exc:
        raise JobFailed(f"Could not reach OpenAleph ({type(exc).__name__}); try again when it is running",
                        {"reason": "unreachable"}) from exc
    analysis = wait_for_analysis(sync.collection_id, sync.provider_record_id, report, fresh=True)
    if analysis.error:
        raise JobFailed(f"Could not finish: {analysis.error}", {"reason": "unreachable"})
    report(90, "Staging the names OpenAleph found")
    counts = import_analysis_proposals(db, doc.id, analysis)
    message = describe_import(counts) or "OpenAleph found no new names"
    message = message[0].upper() + message[1:]
    if not analysis.settled:
        minutes = max(1, round(settings.openaleph_analysis_timeout_seconds / 60))
        message += f"; OpenAleph had not finished after {minutes} minute(s), so this is what it had found by then"
    return {"message": message, "result": counts}


AI_REASONING = "ai_reasoning"


def ai_reasoning_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """One AI reasoning run (case synthesis, hypothesis test, presentation
    draft). The request was validated before it was queued; the result is a
    review-queue candidate, never a change to the investigation."""
    from app.ai.reasoning import describe_reasoning_failure, run_reasoning_module

    request = dict(job.payload or {})
    report(10, "The model is working on it")
    try:
        candidate = run_reasoning_module(
            db, investigation_id=str(job.investigation_id), module=request["module"], question=request["question"],
            working_theory=request.get("working_theory"), max_results=request.get("max_results", 30),
            include_external_leads=request.get("include_external_leads", True), control_flags=request.get("control_flags"),
            record_refs=request.get("record_refs"), actor_id=request.get("actor_id"),
        )
    except Exception as exc:
        described = describe_reasoning_failure(exc)
        if described is None:
            raise
        status, detail, headers = described
        message = detail if isinstance(detail, str) else str(detail.get("message") or exc)
        raise JobFailed(message, {"status_code": status, "detail": detail, "headers": headers}) from exc
    return {
        "message": "Proposed for review",
        "result": {"candidate_id": candidate.id, "review_status": candidate.review_status, "payload": candidate.payload},
    }


HANDLERS: dict[str, Handler] = {
    EXTRACT_DOCUMENT: extract_document_job,
    ANALYZE_DOCUMENT: analyze_document_job,
    AI_REASONING: ai_reasoning_job,
}
