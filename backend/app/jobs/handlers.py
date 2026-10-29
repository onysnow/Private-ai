"""The work each job kind does."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn

from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.records import Handler, JobFailed, Report
from app.models.jobs import BackgroundJob

if TYPE_CHECKING:
    from app.services.openaleph_reader import OpenAlephText, OpenAlephUnavailable

logger = logging.getLogger("journalism.jobs")

EXTRACT_DOCUMENT = "extract_document"
# What a document says when a person stopped its read; reading it again starts over.
STOPPED_READ = "Stopped by you before it was read. Read it again from the Library."
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
                           report: Report, runner: str, parent_job_id: str | None = None) -> tuple[str, dict[str, int]]:
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
        # Run here, not by the queue: the archive's job is what keeps it alive
        # (app/jobs/recovery.py fails it once that job has finished).
        child_job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=parent.investigation_id,
                               subject_type="document", subject_id=child_id, runner=runner,
                               payload={"parent_job_id": parent_job_id} if parent_job_id else None)
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


def _finish_openaleph_read(db: Session, document_id: str, read: OpenAlephText, report: Report, runner: str = "inline",
                           job_id: str | None = None, resuming: bool = False) -> str:
    """Wait for OpenAleph's name-finding, make the document's chunks and
    proposals from OpenAleph's text, and stage the names it found. An
    archive's or an email's files become documents under it.

    The Workbench's own pattern name-finder runs only when OpenAleph gave no
    analysis (ADR-0004, decision 5; ADR-0006).
    """
    message = _read_openaleph_text(db, document_id, read, report, resuming=resuming)
    if message is None:
        return "The document was deleted before it was read"
    _record_openaleph_details(db, document_id, read)
    from app.services.openaleph_children import is_container

    if is_container(read.schema):
        children, _counts = _add_and_read_children(db, document_id, collection_id=read.collection_id,
                                                   container_id=read.provider_document_id, report=report, runner=runner,
                                                   parent_job_id=job_id)
        message = f"{message}; {children}"
    return message


def _read_openaleph_text(db: Session, document_id: str, read: OpenAlephText, report: Report,
                         *, resuming: bool = False) -> str | None:
    """The document's chunks and proposals from OpenAleph's text and names;
    the job's message, or None when the document was deleted meanwhile.
    ``resuming`` keeps the chunks an interrupted attempt already saved and
    only stages OpenAleph's names (which skips any already proposed)."""
    from app.services.documents import extract_document
    from app.services.openaleph_analysis import describe_import, find_names, import_analysis_proposals

    analysis = find_names(read.collection_id, read.provider_document_id, read.schema, report)
    report(85, "Making proposals from OpenAleph's text")
    issue = analysis.issue() if read.chunks else None
    issues = [*read.issues, issue] if issue else list(read.issues)
    if resuming:
        from app.models.domain import Document

        doc = db.get(Document, document_id)
    else:
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
    """Read a document (_read_document); a stop asked for at any point leaves it
    marked as stopped, not waiting for a read that will never come."""
    from app.jobs.records import JobStopped
    from app.models.domain import Document

    try:
        return _read_document(db, job, report)
    except JobStopped:
        db.rollback()
        doc = db.get(Document, job.subject_id) if job.subject_id else None
        if doc is not None and doc.extraction_status != "complete":
            doc.extraction_status, doc.extraction_error = "failed", STOPPED_READ
            db.commit()
        raise


def _read_document(db: Session, job: BackgroundJob, report: Report) -> str | None:
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
    # A recording is transcribed on this computer, whichever reader reads the rest (ADR-0020).
    from app.services.transcription import is_media, read_media_document

    stored_media = db.get(Document, document_id)
    if stored_media is not None and is_media(stored_media.filename):
        if job.attempts > 1 and _already_read(db, document_id):
            return "Already transcribed"
        return _check_watchlist_after_read(db, document_id, read_media_document(db, document_id, report))
    # A HEIC or camera RAW photo is read through a viewable copy made on this computer (ADR-0021).
    from app.services.photos import is_photo, read_photo_document

    if stored_media is not None and is_photo(stored_media.filename):
        if job.attempts > 1 and _already_read(db, document_id):
            return "Already read"
        return _check_watchlist_after_read(db, document_id, read_photo_document(db, document_id, report, job_id=job.id))
    # A retry of a read that stopped after its text was saved finishes the steps after it
    # instead of failing on "already read" (docs/project-notes/CRASH_RECOVERY.md). A new
    # reading job for a read document still fails: only a retry resumes.
    resuming = job.attempts > 1 and _already_read(db, document_id)

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
            message = _finish_openaleph_read(db, document_id, read, report, runner=job.runner, job_id=job.id,
                                             resuming=resuming)
            if local_text and message:
                message = f"{message}; OpenAleph found no text, so the text is the Workbench's own reading"
            # OpenAleph may have read a scan by OCR too: its pages are measured the same way.
            _keep_picture_claims(db, document_id)
            message = _measure_legibility(db, document_id, report, message or "Document read")
            return _check_watchlist_after_read(db, document_id, message)

    report(5, "Reading the document")
    from app.jobs.records import JobStopped
    from app.models.domain import Source
    from app.services.documents import FoundSoFar
    from app.services.pdf_ocr import PAGE_PROGRESS, PAGE_TEXT, ReadingStopped

    stored_doc = db.get(Document, document_id)
    stored_source = db.get(Source, stored_doc.source_id) if stored_doc is not None else None
    found = FoundSoFar(((stored_source.metadata_json or {}) if stored_source is not None else {}).get("part"))
    where: dict[str, Any] = {}

    def say() -> None:
        words = f"Reading{' with OCR' if where['ocr'] else ''} · page {where['page']} of {where['total']}"
        so_far = found.words()
        report(5 + int(70 * where["page"] / max(where["total"], 1)), f"{words} · {so_far}" if so_far else words)

    def page_read(page_no: int, total: int, ocr: bool) -> None:
        where.update(page=page_no, total=total, ocr=ocr)
        try:
            say()
        except JobStopped:
            raise ReadingStopped(STOPPED_READ) from None

    def page_text(page_no: int, text: str) -> None:
        found.add(page_no, text)
        if where and found.words():
            try:
                say()
            except JobStopped:
                raise ReadingStopped(STOPPED_READ) from None

    token = PAGE_PROGRESS.set(page_read)
    text_token = PAGE_TEXT.set(page_text)
    try:
        doc = db.get(Document, document_id) if resuming else extract_document(db, document_id)
    finally:
        PAGE_PROGRESS.reset(token)
        PAGE_TEXT.reset(text_token)
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status == "failed" and doc.extraction_error == STOPPED_READ:
        raise JobStopped("Stopped by you")
    if doc.extraction_status == "failed":
        raise RuntimeError(doc.extraction_error or "The document could not be read")
    message = "Document read" if fallback_reason is None else f"Read by the Workbench's own reader; {fallback_reason}"
    if fallback_reason is None and settings.openaleph_enabled and settings.openaleph_auto_sync_documents:
        report(80, "Sending the document to OpenAleph")
        try:
            sync = sync_document_to_openaleph(db, doc.id)
        except Exception as exc:  # OpenAleph down must not undo a finished read
            db.rollback()
            message = f"Document read; sending it to OpenAleph failed: {type(exc).__name__}: {exc}"
        else:
            message = (f"Document read; sending it to OpenAleph failed: {sync.error}" if sync.status == "failed"
                       else "Document read and sent to OpenAleph")
    _keep_picture_claims(db, document_id)
    return _measure_legibility(db, document_id, report, message)


def _keep_picture_claims(db: Session, document_id: str) -> None:
    """A JPEG or PNG that was read: keep what the file claims about itself (app/services/photos.py). Never fails."""
    from app.models.domain import Document
    from app.services.image_reader import IMAGE_EXTENSIONS
    from app.services.photos import record_claims

    doc = db.get(Document, document_id)
    if doc is not None and Path(doc.filename or "").suffix.lower() in IMAGE_EXTENSIONS:
        record_claims(db, document_id)


def _measure_legibility(db: Session, document_id: str, report: Report, message: str) -> str:
    """After the read, how legible each scanned page was (app/services/legibility.py): pages the Workbench read by
    OCR, and pages with no text layer of their own, whichever reader read them (OpenAleph does not say which pages
    it read by OCR). The document is already read and in use; measuring never fails the read, and a stop asked
    for here stops only the measuring."""
    from sqlalchemy import select

    from app.jobs.records import JobStopped
    from app.models.domain import Document, DocumentChunk
    from app.services.document_reader import measure_legibility, scanned_pages

    doc = db.get(Document, document_id)
    if doc is None or not settings.enable_pdf_ocr:
        return message
    chunks = [c for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id)) if c.ocr_legibility is None]
    try:
        no_text_layer = set(scanned_pages(doc.storage_path))
    except Exception:  # a file the page check cannot open: only what the reader marked as OCR is measured
        no_text_layer = set()
    scanned = [c for c in chunks if "(OCR)" in (c.locator or "") or (c.page_number or 1) in no_text_layer]
    pages = sorted({c.page_number or 1 for c in scanned})
    if not pages:
        return message
    measured: dict[int, float | None] = {}
    try:
        for number, page in enumerate(pages, 1):
            report(85 + int(14 * number / len(pages)), f"Read · measuring how legible the scan is · page {number} of {len(pages)}")
            got, why = measure_legibility(doc.storage_path, [page])
            if why:
                return f"{message}; legibility not measured: {why}"
            measured.update(got)
    except JobStopped:
        pass
    except Exception as exc:
        logger.warning("measuring legibility failed", exc_info=True, extra={"document_id": document_id})
        return f"{message}; legibility not measured: {type(exc).__name__}"
    finally:
        for chunk in scanned:
            value = measured.get(chunk.page_number or 1)
            if value is not None:
                chunk.ocr_legibility = value
        db.commit()
    done = sum(1 for v in measured.values() if v is not None)
    held = hold_illegible(db, document_id)
    tail = f"; {held} proposal{'s' if held != 1 else ''} from pages too hard to read held back for you to check by eye" if held else ""
    return f"{message}; legibility measured on {done} of {len(pages)} scanned page{'s' if len(pages) != 1 else ''}{tail}"


def hold_illegible(db: Session, document_id: str) -> int:
    """The OCR quality gate: a proposal read from a page less legible than OCR_LEGIBILITY_FLOOR is held back from
    Decide (status "held"), with the page's figure; it waits in the reading room, beside the page, where a person can
    still accept it. Returns how many were held."""
    from sqlalchemy import select

    from app.core.time import utcnow_naive
    from app.models.domain import DocumentChunk, ExtractionCandidate

    floor = settings.ocr_legibility_floor
    low = {c.id: c.ocr_legibility for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document_id))
           if c.ocr_legibility is not None and c.ocr_legibility < floor}
    if not low:
        return 0
    held = 0
    for candidate in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == document_id,
                                                                  ExtractionCandidate.review_status == "proposed")):
        if candidate.chunk_id in low:
            candidate.review_status = "held"
            candidate.reviewer_note = (f"Held back: read by OCR from a page only {low[candidate.chunk_id]:.0f}% legible "
                                       f"(under {floor:.0f}%). Check it against the page before using it.")
            candidate.reviewed_at = utcnow_naive()
            held += 1
    db.commit()
    return held


def _already_read(db: Session, document_id: str) -> bool:
    from sqlalchemy import select

    from app.models.domain import Document, DocumentChunk

    doc = db.get(Document, document_id)
    return (doc is not None and doc.extraction_status == "complete"
            and db.scalar(select(DocumentChunk.id).where(DocumentChunk.document_id == document_id).limit(1)) is not None)


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
                                             container_id=str(sync.provider_record_id), report=report, runner=job.runner,
                                             parent_job_id=job.id)
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
            record_refs=request.get("record_refs"), run_options=request.get("run_options"), premises=request.get("premises"),
            changes=request.get("changes"), packet_from=request.get("packet_from"), handoff_from=request.get("handoff_from"),
            context=request.get("context"), actor_id=request.get("actor_id"), run_id=job.id,
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


OUTSIDE_LOOKUP = "outside_lookup"


def outside_lookup_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """Settings › Outside lookups set to Automatic: look a newly accepted party up in each such source that has not
    yet. A source that fails is noted and the others still run; the findings wait in Decide like any lookup's."""
    import asyncio

    from fastapi import HTTPException

    from app.models.domain import Entity
    from app.services.connectors import automatic_lookups_due, enrich_entity
    from app.services.preferences import lookup_mode, provider_label

    entity = db.get(Entity, str(job.subject_id))
    if entity is None:
        return {"message": "The party is no longer in the case"}
    found, failed = 0, []
    # A re-check after a source updated its data (app/services/source_freshness.py) names its sources; while the
    # case still allows Automatic for them.
    recheck = [p for p in (job.payload or {}).get("recheck") or [] if lookup_mode(db, entity.investigation_id, p) == "automatic"]
    due = recheck or automatic_lookups_due(db, entity)
    for n, provider in enumerate(due):
        report(int(100 * n / max(1, len(due))), f"Looking {entity.caption} up in {provider_label(provider)}")
        try:
            found += len(asyncio.run(enrich_entity(provider, entity, db, automatic=True)))
        except HTTPException:
            failed.append(provider_label(provider))
    message = f"{found} finding{'s' if found != 1 else ''} for {entity.caption}" + (f"; {', '.join(failed)} did not answer" if failed else "")
    return {"message": message, "result": {"findings": found, "failed": failed}}


WEB_CAPTURE = "web_capture"


def web_capture_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """Capture a pasted link (ADR-0018), then read the page it kept like an uploaded file, in a job of its own so a
    read that fails can be retried from the document."""
    from sqlalchemy import Engine

    from app.db.session import build_session_factory
    from app.jobs.records import create_job, execute_job
    from app.services.web_capture import run_capture

    bind = db.get_bind()
    factory = build_session_factory(bind if isinstance(bind, Engine) else bind.engine)

    def read(document_id: str) -> None:
        read_job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=job.investigation_id, subject_type="document",
                              subject_id=document_id, runner=job.runner, payload={"parent_job_id": job.id})
        execute_job(factory, read_job.id, HANDLERS)

    return run_capture(db, str(job.subject_id), report, read_document=read)


CAPTURE_MEDIA = "capture_media"


def capture_media_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """Collect the video or audio on a captured page (app/services/media_links.py), then transcribe it in a reading
    job of its own."""
    from sqlalchemy import Engine

    from app.db.session import build_session_factory
    from app.jobs.records import create_job, execute_job
    from app.services.media_links import collect_media

    bind = db.get_bind()
    factory = build_session_factory(bind if isinstance(bind, Engine) else bind.engine)

    def read(document_id: str) -> None:
        read_job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=job.investigation_id, subject_type="document",
                              subject_id=document_id, runner=job.runner, payload={"parent_job_id": job.id})
        execute_job(factory, read_job.id, HANDLERS)

    return collect_media(db, str(job.subject_id), report, read_document=read)


FOLLOW_AUDIO = "follow_audio"


def follow_audio_job(db: Session, job: BackgroundJob, report: Report) -> dict:
    """Capture a followed podcast episode (ADR-0022): fetch its audio file, keep it as a recording of the case, then
    transcribe it in a reading job of its own."""
    from sqlalchemy import Engine

    from app.db.session import build_session_factory
    from app.jobs.records import create_job, execute_job
    from app.models.following import MonitorItem
    from app.services.following import fetch_audio

    item = db.get(MonitorItem, str(job.subject_id))
    if item is None:
        return {"message": "The item was deleted before its audio was fetched", "result": {}}
    report(5, "Fetching the episode's audio file")
    document_id = fetch_audio(db, item, (job.payload or {}).get("actor"))
    db.commit()
    bind = db.get_bind()
    factory = build_session_factory(bind if isinstance(bind, Engine) else bind.engine)
    read_job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=job.investigation_id, subject_type="document",
                          subject_id=document_id, runner=job.runner, payload={"parent_job_id": job.id})
    execute_job(factory, read_job.id, HANDLERS)
    return {"message": "Episode kept and sent to be transcribed", "result": {"document_id": document_id}}


HANDLERS: dict[str, Handler] = {
    WEB_CAPTURE: web_capture_job,
    FOLLOW_AUDIO: follow_audio_job,
    CAPTURE_MEDIA: capture_media_job,
    OUTSIDE_LOOKUP: outside_lookup_job,
    EXTRACT_DOCUMENT: extract_document_job,
    ANALYZE_DOCUMENT: analyze_document_job,
    FIND_CHILDREN: children_job,
    AI_REASONING: ai_reasoning_job,
}
