"""A bulk import as one record (design doc "Document Ingestion & Review
System Design", Phase 2).

The browser still sends each file to POST /api/documents/upload, one after
another, so the reporter sees real per-file progress and one bad file never
stops the rest; reading each saved file is already a background job. What a
batch adds:

- one id the triage screen and the review queue follow, in place of a list of
  every document id in the URL (which a large enough batch would overrun);
- what happened to each file when it was sent -- saved, refused, or a
  duplicate of a document already in the investigation (the same bytes,
  found by SHA-256; the design doc's "already ingested as <filename>");
- the order to review in: each saved file, followed by the files OpenAleph
  found inside it (ADR-0006, Wave A), at any depth.

How reading each file went is not copied here: it is the document's own
status and its latest job, read when the batch is.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.jobs.records import serialize_job
from app.models.domain import BackgroundJob, Document, IngestionBatch, IngestionBatchItem, Investigation
from app.services.documents import serialize_document

OUTCOMES = ("saved", "duplicate", "refused")


def create_batch(db: Session, investigation_id: str, *, label: str | None, created_by: str | None) -> IngestionBatch:
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    batch = IngestionBatch(investigation_id=investigation_id, label=(label or "").strip()[:512] or "Bulk import",
                           created_by=created_by)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def batch_for_upload(db: Session, batch_id: str | None, investigation_id: str) -> IngestionBatch | None:
    """The batch an upload names, which must be one of the same investigation's."""
    if not batch_id:
        return None
    batch = db.get(IngestionBatch, batch_id)
    if batch is None or batch.investigation_id != investigation_id:
        raise LookupError("Import batch not found in this investigation")
    return batch


def record_item(db: Session, batch: IngestionBatch, *, filename: str, outcome: str, document_id: str | None = None,
                error: str | None = None) -> IngestionBatchItem:
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}")
    position = db.scalar(select(func.count()).select_from(IngestionBatchItem).where(IngestionBatchItem.batch_id == batch.id)) or 0
    item = IngestionBatchItem(batch_id=batch.id, position=position, filename=filename[:512], outcome=outcome,
                              document_id=document_id, error=error)
    db.add(item)
    # A file added after the batch looked finished (the first read ended before the next upload) reopens it.
    if outcome == "saved" and batch.finished_at is not None:
        batch.finished_at = None
    db.commit()
    return item


DONE = ("succeeded", "failed", "cancelled")


def _root_of(db: Session, document_id: str) -> str:
    seen: set[str] = set()
    current = document_id
    while current not in seen:
        seen.add(current)
        parent = db.scalar(select(Document.parent_document_id).where(Document.id == current))
        if not parent:
            return current
        current = str(parent)
    return current


def after_read(db: Session, document_id: str) -> list[IngestionBatch]:
    """A document's read ended: each open batch it belongs to whose every file (and every file found inside them)
    has finished reading is marked finished, and what follows a finished import runs (saved questions, part 4 of
    docs/project-notes/PLATFORM_NEEDS_PLAN.md). Returns the batches it finished."""
    root = _root_of(db, document_id)
    batches = list(db.scalars(select(IngestionBatch).join(IngestionBatchItem, IngestionBatchItem.batch_id == IngestionBatch.id)
                              .where(IngestionBatchItem.document_id == root, IngestionBatchItem.outcome == "saved",
                                     IngestionBatch.finished_at.is_(None)).distinct()))
    finished: list[IngestionBatch] = []
    for batch in batches:
        saved = [str(d) for d in db.scalars(select(IngestionBatchItem.document_id).where(
            IngestionBatchItem.batch_id == batch.id, IngestionBatchItem.outcome == "saved", IngestionBatchItem.document_id.is_not(None)))]
        order = _review_order(db, batch.investigation_id, saved)
        jobs = _latest_jobs(db, order)
        if all(doc in jobs and jobs[doc].status in DONE for doc in saved) and all(j.status in DONE for j in jobs.values()):
            batch.finished_at = utcnow_naive()
            db.commit()
            finished.append(batch)
    for batch in finished:
        from app.services.saved_questions import on_import_finished

        on_import_finished(db, batch)
    return finished


def batch_summary(db: Session, batch: IngestionBatch) -> dict[str, int]:
    """How a finished batch went: files read, files that need someone (a read that failed or was stopped)."""
    saved = [str(d) for d in db.scalars(select(IngestionBatchItem.document_id).where(
        IngestionBatchItem.batch_id == batch.id, IngestionBatchItem.outcome == "saved", IngestionBatchItem.document_id.is_not(None)))]
    jobs = _latest_jobs(db, saved)
    problems = sum(1 for doc in saved if doc in jobs and jobs[doc].status != "succeeded")
    return {"files": len(saved), "problems": problems}


def find_duplicate(db: Session, investigation_id: str, digest: str) -> Document | None:
    """A document the reporter already uploaded to this investigation with
    exactly these bytes. Files found inside an archive or an email are left
    out: the same attachment in two emails is two findings, not a mistake."""
    return db.scalar(select(Document).where(
        Document.investigation_id == investigation_id, Document.sha256 == digest, Document.parent_document_id.is_(None),
    ).order_by(Document.created_at).limit(1))


def _latest_jobs(db: Session, document_ids: list[str]) -> dict[str, BackgroundJob]:
    latest: dict[str, BackgroundJob] = {}
    if not document_ids:
        return latest
    for job in db.scalars(select(BackgroundJob).where(BackgroundJob.subject_id.in_(document_ids))
                          .order_by(BackgroundJob.created_at)):
        latest[str(job.subject_id)] = job   # ordered oldest first, so the last one stays
    return latest


def _review_order(db: Session, investigation_id: str, saved: list[str]) -> list[str]:
    """Each saved file, then the files found inside it, depth first."""
    children: dict[str, list[str]] = {}
    for doc_id, parent_id in db.execute(select(Document.id, Document.parent_document_id).where(
            Document.investigation_id == investigation_id, Document.parent_document_id.is_not(None))
            .order_by(Document.created_at)):
        children.setdefault(str(parent_id), []).append(str(doc_id))
    order: list[str] = []
    seen: set[str] = set()

    def walk(doc_id: str) -> None:
        if doc_id in seen:
            return
        seen.add(doc_id)
        order.append(doc_id)
        for child in children.get(doc_id, []):
            walk(child)

    for doc_id in saved:
        walk(doc_id)
    return order


def serialize_batch(db: Session, batch: IngestionBatch) -> dict[str, Any]:
    items = list(db.scalars(select(IngestionBatchItem).where(IngestionBatchItem.batch_id == batch.id)
                            .order_by(IngestionBatchItem.position)))
    saved = [str(item.document_id) for item in items if item.outcome == "saved" and item.document_id]
    order = _review_order(db, batch.investigation_id, saved)
    documents = {doc.id: doc for doc in db.scalars(select(Document).where(Document.id.in_(order)))} if order else {}
    jobs = _latest_jobs(db, order)
    # Duplicates point at a document of an earlier import; it is named, not read again.
    earlier = {doc.id: doc for doc in db.scalars(select(Document).where(Document.id.in_(
        [str(item.document_id) for item in items if item.outcome == "duplicate" and item.document_id])))}

    def document_row(doc_id: str) -> dict[str, Any] | None:
        doc = documents.get(doc_id)
        if doc is None:
            return None
        job = jobs.get(doc_id)
        return {**serialize_document(db, doc), "job": serialize_job(job) if job is not None else None}

    return {
        "id": batch.id,
        "investigation_id": batch.investigation_id,
        "label": batch.label,
        "created_by": batch.created_by,
        "created_at": batch.created_at,
        "items": [{
            "position": item.position,
            "filename": item.filename,
            "outcome": item.outcome,
            "error": item.error,
            "document_id": item.document_id,
            "duplicate_of": ({"id": earlier[item.document_id].id, "filename": earlier[item.document_id].filename}
                             if item.outcome == "duplicate" and item.document_id in earlier else None),
        } for item in items],
        # Every document to review, each saved file followed by the files found in it.
        "documents": [row for row in (document_row(doc_id) for doc_id in order) if row is not None],
        "review_order": order,
    }


def list_batches(db: Session, investigation_id: str, *, limit: int = 20) -> list[dict[str, Any]]:
    batches = list(db.scalars(select(IngestionBatch).where(IngestionBatch.investigation_id == investigation_id)
                              .order_by(IngestionBatch.created_at.desc()).limit(limit)))
    counts: dict[str, dict[str, int]] = {batch.id: dict.fromkeys(OUTCOMES, 0) for batch in batches}
    if batches:
        for batch_id, outcome, n in db.execute(select(IngestionBatchItem.batch_id, IngestionBatchItem.outcome, func.count())
                                               .where(IngestionBatchItem.batch_id.in_(list(counts)))
                                               .group_by(IngestionBatchItem.batch_id, IngestionBatchItem.outcome)):
            counts[str(batch_id)][str(outcome)] = int(n)
    return [{"id": batch.id, "label": batch.label, "created_by": batch.created_by, "created_at": batch.created_at,
             "counts": counts[batch.id]} for batch in batches]
