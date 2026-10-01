"""The work each job kind does."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.records import Handler, Report
from app.models.jobs import BackgroundJob

EXTRACT_DOCUMENT = "extract_document"


def extract_document_job(db: Session, job: BackgroundJob, report: Report) -> str | None:
    """Read an uploaded document into chunks and proposals, then (when
    configured) send it to OpenAleph. A failed read fails the job, with the
    reason the document also records."""
    from app.services.documents import extract_document
    from app.services.openaleph_corpus import sync_document_to_openaleph

    document_id = job.subject_id
    if not document_id:
        raise ValueError("Job has no document")
    report(5, "Reading the document")
    doc = extract_document(db, document_id)
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status == "failed":
        raise RuntimeError(doc.extraction_error or "The document could not be read")
    message = "Document read"
    if settings.openaleph_enabled and settings.openaleph_auto_sync_documents:
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
