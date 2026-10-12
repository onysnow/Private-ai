"""The work each job kind does."""

from __future__ import annotations

import logging

from typing import TYPE_CHECKING, NoReturn

from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.records import Handler, JobFailed, Report
from app.models.jobs import BackgroundJob

if TYPE_CHECKING:
    from app.services.openaleph_reader import OpenAlephText, OpenAlephUnavailable

logger = logging.getLogger("journalism.jobs")

EXTRACT_DOCUMENT = "extract_document"
ANALYZE_DOCUMENT = "openaleph_analyze"
FIND_CHILDREN = "openaleph_children"


def _record_openaleph_details(db: Session, document_id: str, read: OpenAlephText) -> None:
    """Keep what OpenAleph said the document is: its schema on the sync row
    (an email or an archive is shown as one), an email's headers on the
    document's Source, so they stay with the document."""
    from app.models.domain import Document, Source
    from app.services.openaleph_corpus import get_document_sync

    sync = get_document_sync(db, document_id)
    if sync is not None:
        sync.response_json = {**(sync.response_json or {}), "schema": read.schema}
    doc = db.get(Document, document_id)
    source = db.get(Source, doc.source_id) if doc is not None else None
    if source is not None and read.headers:
        source.metadata_json = {**(source.metadata_json or {}), "email": read.headers}
    db.commit()


def _add_and_read_children(db: Session, document_id: str, *, collection_id: str, container_id: str,
                           report: Report, runner: str) -> tuple[str, dict[str, int]]:
    """Make each file inside an archive or email a document under it, and
    read each one as a job of its own, so a child that fails can be retried
    from its row (app/services/openaleph_children.py). Returns a sentence
    for the job's message and the counts."""
    from sqlalchemy import Engine

    from app.db.session import build_session_factory
    from app.jobs.records import create_job, execute_job
    from app.models.domain import Document
    from app.services.openaleph_children import NOT_ADDED, NOT_LISTED, STILL_READING, add_children
    from app.services.openaleph_reader import NO_TEXT_ISSUE

    parent = db.get(Document, document_id)
    if parent is None:
        return "the document was deleted", {}
    result = add_children(db, parent, collection_id=collection_id, container_id=container_id, report=report)
    bind = db.get_bind()
    # Each child's job runs on the same database as this one, in its own session.
    factory = build_session_factory(bind if isinstance(bind, Engine) else bind.engine)
    unread = 0
    for number, child_id in enumerate(result.added, 1):
        report(None, f"Reading the files inside: {number} of {len(result.added)}")
        child_job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=parent.investigation_id,
                               subject_type="document", subject_id=child_id, runner=runner)
        if execute_job(factory, child_job.id, HANDLERS) != "succeeded":
            unread += 1
    db.expire_all()
    parent = db.get(Document, document_id)
    if parent is not None:
        kept = [issue for issue in parent.extraction_issues or [] if not issue.startswith((NOT_ADDED, NOT_LISTED, STILL_READING))]
        if result.found:   # an archive's text is its files
            kept = [issue for issue in kept if issue != NO_TEXT_ISSUE]
        parent.extraction_issues = [*kept, *result.issues()] or None
        db.commit()
    parts: list[str] = []
    if result.added:
        parts.append(f"{len(result.added)} file(s) inside added as documents"
                     + (f", {unread} of which could not be read" if unread else ""))
    if result.already:
        parts.append(f"{result.already} file(s) inside were already added")
    if result.not_added:
        parts.append(f"{len(result.not_added)} file(s) inside not added")
    if result.error:
        parts.append("the files inside could not be listed")
    counts = {"added": len(result.added), "already": result.already, "not_added": len(result.not_added), "unread": unread}
    return "; ".join(parts) or "no files inside", counts


def _finish_openaleph_read(db: Session, document_id: str, read: OpenAlephText, report: Report, runner: str = "inline") -> str:
    """Wait for OpenAleph's name-finding, make the document's chunks and
    proposals from OpenAleph's text, and stage the names it found. An
    archive's or an email's files become documents under it.

    The Workbench's own pattern name-finder runs only when OpenAleph gave no
    analysis (ADR-0004, decision 5; ADR-0006).
    """
    message = _read_openaleph_text(db, document_id, read, report)
    if message is None:
        return "The document was deleted before it was read"
    _record_openaleph_details(db, document_id, read)
    from app.services.openaleph_children import is_container

    if is_container(read.schema):
        children, _counts = _add_and_read_children(db, document_id, collection_id=read.collection_id,
                                                   container_id=read.provider_document_id, report=report, runner=runner)
        message = f"{message}; {children}"
    return message


def _read_openaleph_text(db: Session, document_id: str, read: OpenAlephText, report: Report) -> str | None:
    """The document's chunks and proposals from OpenAleph's text and names;
    the job's message, or None when the document was deleted meanwhile."""
    from app.services.documents import extract_document
    from app.services.openaleph_analysis import describe_import, find_names, import_analysis_proposals

    analysis = find_names(read.collection_id, read.provider_document_id, read.schema, report)
    report(85, "Making proposals from OpenAleph's text")
    issue = analysis.issue() if read.chunks else None
    issues = [*read.issues, issue] if issue else list(read.issues)
    doc = extract_document(db, document_id, text=(read.chunks, issues), find_names=not analysis.analysed)
    if doc is None:
        return None
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


def _openaleph_package(schema: str | None) -> bool:
    """OpenAleph holds the file as a package (a .zip, a mailbox): each file
    or message in it becomes a document of its own under it."""
    from followthemoney import model as ftm_model

    found = ftm_model.get(schema or "")
    return found is not None and found.is_a("Package")


def _with_local_text(read: OpenAlephText, storage_path: str) -> OpenAlephText:
    """OpenAleph read an email or a workbook and returned no text (it often
    gives an email none), so its proposals would have no passage to show.
    Use the Workbench's own reading of the file as the text instead, and keep
    everything else OpenAleph gave (its names, headers and files inside).
    Not done for a package: its files are read as documents of their own, and
    reading them into the package too would propose everything twice. When
    the Workbench cannot read it either, OpenAleph's empty read stands."""
    from dataclasses import replace
    from pathlib import Path

    from app.services.document_reader import read_chunks
    from app.services.openaleph_reader import NO_TEXT_ISSUE

    try:
        chunks, issues = read_chunks(Path(storage_path))
    except Exception:
        logger.warning("the Workbench's own reader could not read a file OpenAleph found no text in", exc_info=True)
        return read
    if not chunks:
        return read
    return replace(read, chunks=chunks, issues=[*(issue for issue in read.issues if issue != NO_TEXT_ISSUE), *issues])


def extract_document_job(db: Session, job: BackgroundJob, report: Report) -> str | None:
    """Read an uploaded document into chunks and proposals.

    OpenAleph reads it when that is configured (app/services/openaleph_reader.py)
    and finds its names (app/services/openaleph_analysis.py); the
    Workbench's own reader is the fallback when OpenAleph cannot deliver,
    and the job's message says which one read it and why. A failed read
    fails the job, with the reason the document also records.
    """
    from app.models.domain import Document
    from app.services.container_readers import is_container_file
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
        # An email, mailbox, .zip or workbook: OpenAleph may read it and find no text (its files
        # become documents of their own), which is a read, not a reason to fall back.
        container = stored is not None and is_container_file(stored.filename)
        try:
            read = read_with_openaleph(db, document_id, report, allow_empty=openaleph_only or container)
        except OpenAlephUnavailable as exc:
            if stored is not None and openaleph_only:
                _fail_openaleph_only_read(db, document_id, stored.filename, exc)
            fallback_reason = str(exc)
        else:
            local_text = container and not read.chunks and not _openaleph_package(read.schema)
            if local_text and stored is not None:
                read = _with_local_text(read, stored.storage_path)
                local_text = bool(read.chunks)
            message = _finish_openaleph_read(db, document_id, read, report, runner=job.runner)
            if local_text and message:
                message = f"{message}; OpenAleph found no text, so the text is the Workbench's own reading"
            return _check_watchlist_after_read(db, document_id, message)

    report(5, "Reading the document")
    from app.services.pdf_ocr import PAGE_PROGRESS

    def page_read(page_no: int, total: int, ocr: bool) -> None:
        report(5 + int(70 * page_no / max(total, 1)), f"Reading{' with OCR' if ocr else ''} · page {page_no} of {total}")

    token = PAGE_PROGRESS.set(page_read)
    try:
        doc = extract_document(db, document_id)
    finally:
        PAGE_PROGRESS.reset(token)
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


def _check_watchlist_after_read(db: Session, document_id: str, message: str | None) -> str | None:
    """OpenAleph has read and indexed the document: search the investigation's
    watched names (app/services/watchlists.py). A watchlist problem never
    fails the read; it only goes unmentioned."""
    from app.models.domain import Document
    from app.services.watchlists import check_watchlist

    doc = db.get(Document, document_id)
    if doc is None:
        return message
    try:
        found = check_watchlist(db, doc.investigation_id)
    except Exception:
        db.rollback()
        logger.warning("watchlist check after a read failed", exc_info=True, extra={"document_id": document_id})
        return message
    if not found["new_hits"]:
        return message
    return f"{message or 'Document read'}; the watchlist found {found['new_hits']} new document(s)"


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


def children_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """"Look for files inside again": list an archive's or an email's files
    in OpenAleph once more and add those the Workbench does not hold yet
    (ADR-0006, Wave A). Files already added are not added twice."""
    from app.models.domain import Document
    from app.services.openaleph_children import is_container
    from app.services.openaleph_corpus import get_document_sync

    document_id = job.subject_id
    doc = db.get(Document, document_id) if document_id else None
    if doc is None:
        raise ValueError("The document no longer exists")
    sync = get_document_sync(db, doc.id)
    if sync is None or sync.status != "synced" or not sync.provider_record_id:
        raise JobFailed("This document is not in OpenAleph, so OpenAleph holds no files inside it",
                        {"reason": "not_in_openaleph"})
    if not is_container(str((sync.response_json or {}).get("schema") or "")):
        raise JobFailed("Only an archive or an email has files inside", {"reason": "not_a_container"})
    message, counts = _add_and_read_children(db, doc.id, collection_id=sync.collection_id,
                                             container_id=str(sync.provider_record_id), report=report, runner=job.runner)
    return {"message": message[0].upper() + message[1:], "result": counts}


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
    FIND_CHILDREN: children_job,
    AI_REASONING: ai_reasoning_job,
}
