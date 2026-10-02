"""The work each job kind does."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.records import Handler, Report
from app.models.jobs import BackgroundJob

EXTRACT_DOCUMENT = "extract_document"


def extract_document_job(db: Session, job: BackgroundJob, report: Report) -> str | None:
    """Read an uploaded document into chunks and proposals.

    OpenAleph reads it when that is configured (app/services/openaleph_reader.py);
    the Workbench's own reader is the fallback when OpenAleph cannot deliver,
    and the job's message says which one read it and why. A failed read
    fails the job, with the reason the document also records.
    """
    from app.services.documents import extract_document
    from app.services import openaleph_corpus
    from app.services.openaleph_corpus import import_openaleph_entity_candidates, sync_document_to_openaleph
    from app.services.openaleph_reader import OpenAlephUnavailable, read_with_openaleph, reading_with_openaleph

    document_id = job.subject_id
    if not document_id:
        raise ValueError("Job has no document")

    fallback_reason: str | None = None
    if reading_with_openaleph():
        try:
            read = read_with_openaleph(db, document_id, report)
        except OpenAlephUnavailable as exc:
            fallback_reason = str(exc)
        else:
            report(85, "Making proposals from OpenAleph's text")
            doc = extract_document(db, document_id, text=(read.chunks, read.issues))
            if doc is None:
                return "The document was deleted before it was read"
            if doc.extraction_status == "failed":
                raise RuntimeError(doc.extraction_error or "The document could not be read")
            message = f"Read by OpenAleph ({len(read.chunks)} {'page' if read.chunks[0]['page_number'] is not None else 'paragraph'}(s))"
            try:
                names = import_openaleph_entity_candidates(db, doc.id, searcher=openaleph_corpus._openaleph_mention_search)
            except Exception:  # names can be fetched later with Refresh OpenAleph review
                db.rollback()
            else:
                if names.get("created_candidates"):
                    message += f"; {names['created_candidates']} name(s) from OpenAleph"
            return message

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


HANDLERS: dict[str, Handler] = {
    EXTRACT_DOCUMENT: extract_document_job,
}
