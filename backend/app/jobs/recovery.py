"""What a stopped process leaves half-done, found and given a final state.

A crash, a power cut or a killed container can stop the app between two
commits that belong together. Each gap below leaves something no screen
would ever finish, so the runner looks for them when it starts (and, on
Procrastinate, every minute with the stalled-job check; runner.py):

- a document saved but never given its reading job (the upload stopped
  between ``store_document`` and ``create_job``, or an archive's file was
  added as a document and its job not made yet): it would say "queued"
  for ever. It gets a failed reading job with the reason, so the reporter
  retries it from its row as any other interrupted read;
- a Procrastinate job row that was never handed to the queue (the app
  stopped between ``create_job`` and ``defer``), or a job a worker ran
  itself without the queue (a file inside an archive) that stopped mid-way:
  Procrastinate holds nothing to retry for either. Each is failed with the
  reason. A job that did reach the queue and has no queue id recorded yet
  is safe too: once failed it is never claimed (``execute_job``);
- a file left in ``.upload-staging``: no row ever points there (the bytes
  move to the document's own path before the commit), so it is removed.

Nothing here reads or deletes reporter data: a document keeps its file and
its rows, and a retry reads it as if it had just been uploaded.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Document
from app.models.jobs import BackgroundJob

logger = logging.getLogger("journalism.jobs")

EXTRACT_DOCUMENT = "extract_document"  # app/jobs/handlers.py
UNREAD_ERROR = "The app stopped before this document was read."
UNREAD_DOCUMENT = "The app stopped before this was read. Read it again from the Library."
NEVER_QUEUED_ERROR = "The app stopped before this was handed to the job queue."
LOST_ERROR = "The app stopped while this was running."
INTERRUPTED_MESSAGE = "Interrupted -- retry it"
UPLOAD_STAGING = ".upload-staging"


@dataclass
class Recovered:
    documents: int = 0
    jobs: int = 0
    staged_files: int = 0

    def __bool__(self) -> bool:
        return bool(self.documents or self.jobs or self.staged_files)


def _fail(job: BackgroundJob, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.message = INTERRUPTED_MESSAGE
    job.finished_at = utcnow_naive()


def documents_without_a_reading_job(db: Session, *, runner: str, older_than: timedelta) -> int:
    """Give each saved-but-never-read document a failed reading job to retry."""
    cutoff = utcnow_naive() - older_than
    has_job = exists().where(BackgroundJob.kind == EXTRACT_DOCUMENT, BackgroundJob.subject_id == Document.id)
    # The files inside an archive are all added first and read one by one, so
    # while the archive's job runs its later files wait without a job.
    parent_busy = exists().where(BackgroundJob.subject_id == Document.parent_document_id,
                                 BackgroundJob.status.in_(("queued", "running")))
    rows = db.scalars(select(Document).where(
        Document.extraction_status == "queued", Document.created_at <= cutoff, ~has_job, ~parent_busy,
    )).all()
    for doc in rows:
        doc.extraction_status = "failed"
        doc.extraction_error = UNREAD_DOCUMENT
        job = BackgroundJob(kind=EXTRACT_DOCUMENT, investigation_id=doc.investigation_id, subject_type="document",
                            subject_id=doc.id, payload={}, runner=runner, attempts=0)
        _fail(job, UNREAD_ERROR)
        db.add(job)
    if rows:
        db.commit()
    return len(rows)


def jobs_the_queue_does_not_hold(db: Session, *, older_than: timedelta) -> int:
    """Fail Procrastinate job rows that have no queue job behind them and
    have not moved for ``older_than``: never handed over, or run by a worker
    directly (an archive's files) when that worker stopped."""
    cutoff = utcnow_naive() - older_than
    rows = db.scalars(select(BackgroundJob).where(
        BackgroundJob.runner == "procrastinate", BackgroundJob.queue_job_id.is_(None),
        BackgroundJob.status.in_(("queued", "running")), BackgroundJob.updated_at <= cutoff,
    )).all()
    for job in rows:
        _fail(job, NEVER_QUEUED_ERROR if job.status == "queued" else LOST_ERROR)
    if rows:
        db.commit()
    return len(rows)


def staged_upload_files(storage_root: str | Path, *, older_than: timedelta) -> int:
    """Remove files an upload left in ``.upload-staging`` when it stopped."""
    staging = Path(storage_root) / UPLOAD_STAGING
    if not staging.is_dir():
        return 0
    cutoff = time.time() - older_than.total_seconds()
    removed = 0
    for path in staging.iterdir():
        try:
            if path.is_file() and not path.is_symlink() and path.stat().st_mtime <= cutoff:
                path.unlink()
                removed += 1
        except OSError:
            logger.warning("could not remove staged upload %s", path, exc_info=True)
    try:
        staging.rmdir()
    except OSError:
        pass
    return removed


def recover(db: Session, *, runner: str, storage_root: str | Path | None, documents_older_than: timedelta,
            jobs_older_than: timedelta, staged_older_than: timedelta) -> Recovered:
    found = Recovered()
    found.documents = documents_without_a_reading_job(db, runner=runner, older_than=documents_older_than)
    if runner == "procrastinate":
        found.jobs = jobs_the_queue_does_not_hold(db, older_than=jobs_older_than)
    if storage_root is not None:
        found.staged_files = staged_upload_files(storage_root, older_than=staged_older_than)
    if found:
        logger.info("recovered after a stop: %d unread document(s), %d lost job(s), %d staged file(s)",
                    found.documents, found.jobs, found.staged_files)
    return found
