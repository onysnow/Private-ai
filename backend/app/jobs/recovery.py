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
  stopped between ``create_job`` or a retry and ``defer``): Procrastinate
  holds nothing to retry, so it is failed with the reason once it has not
  moved for a while. A job that did reach the queue and has no queue id
  recorded yet is safe too: once failed it is never claimed (``execute_job``);
- a job for a file inside an archive, which the archive's own job runs
  without the queue (``parent_job_id`` in its payload): it is failed once
  that archive's job has finished, since nothing else will run it;
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

from sqlalchemy import exists, select, text, update
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Document
from app.models.jobs import FINISHED_JOB_STATUSES, BackgroundJob

logger = logging.getLogger("journalism.jobs")

EXTRACT_DOCUMENT = "extract_document"  # app/jobs/handlers.py
UNREAD_ERROR = "The app stopped before this document was read."
UNREAD_DOCUMENT = "The app stopped before this was read. Read it again from the Library."
NEVER_QUEUED_ERROR = "The app stopped before this was handed to the job queue."
LOST_ERROR = "The app stopped while this was running."
INTERRUPTED_MESSAGE = "Interrupted -- retry it"
UPLOAD_STAGING = ".upload-staging"
# One sweep at a time across API processes (PostgreSQL); any constant key.
RECOVERY_LOCK_KEY = 0x6A6F75726E616C69
UNFINISHED = ("queued", "running")


@dataclass
class Recovered:
    documents: int = 0
    jobs: int = 0
    staged_files: int = 0

    def __bool__(self) -> bool:
        return bool(self.documents or self.jobs or self.staged_files)


def _failed(error: str) -> dict:
    return {"status": "failed", "error": error, "message": INTERRUPTED_MESSAGE, "finished_at": utcnow_naive()}


def documents_without_a_reading_job(db: Session, *, runner: str, older_than: timedelta) -> int:
    """Give each saved-but-never-read document a failed reading job to retry.
    The caller commits."""
    cutoff = utcnow_naive() - older_than
    has_job = exists().where(BackgroundJob.kind == EXTRACT_DOCUMENT, BackgroundJob.subject_id == Document.id)
    # The files inside an archive are all added first and read one by one, so
    # while the archive's job runs its later files wait without a job.
    parent_busy = exists().where(BackgroundJob.subject_id == Document.parent_document_id,
                                 BackgroundJob.status.in_(UNFINISHED))
    still_unread = (Document.extraction_status == "queued", Document.created_at <= cutoff, ~has_job, ~parent_busy)
    found = 0
    for doc_id, investigation_id in db.execute(select(Document.id, Document.investigation_id).where(*still_unread)).all():
        # The same test again in the write, so a job made meanwhile wins.
        marked = db.execute(update(Document).where(Document.id == doc_id, *still_unread)
                            .values(extraction_status="failed", extraction_error=UNREAD_DOCUMENT)
                            .execution_options(synchronize_session=False))
        if not marked.rowcount:  # type: ignore[attr-defined]
            continue
        db.add(BackgroundJob(kind=EXTRACT_DOCUMENT, investigation_id=investigation_id, subject_type="document",
                             subject_id=doc_id, payload={}, runner=runner, attempts=0, **_failed(UNREAD_ERROR)))
        found += 1
    db.flush()
    return found


def jobs_the_queue_does_not_hold(db: Session, *, older_than: timedelta) -> int:
    """Fail Procrastinate job rows with no queue job behind them that nothing
    will run: a file inside an archive whose archive's job has finished, or
    any other row that has not moved for ``older_than`` (never handed over).
    The caller commits."""
    cutoff = utcnow_naive() - older_than
    unqueued = (BackgroundJob.runner == "procrastinate", BackgroundJob.queue_job_id.is_(None),
                BackgroundJob.status.in_(UNFINISHED))
    rows = db.execute(select(BackgroundJob.id, BackgroundJob.status, BackgroundJob.payload).where(*unqueued)).all()
    parents = {str(parent) for _, _, payload in rows if (parent := (payload or {}).get("parent_job_id"))}
    parent_status = dict(db.execute(select(BackgroundJob.id, BackgroundJob.status)
                                    .where(BackgroundJob.id.in_(parents))).all()) if parents else {}
    found = 0
    for job_id, status, payload in rows:
        parent = (payload or {}).get("parent_job_id")
        if parent:
            if parent_status.get(str(parent), "failed") not in FINISHED_JOB_STATUSES:
                continue   # the archive's job is still reading its files
            still = [BackgroundJob.id == job_id, *unqueued]
        else:
            still = [BackgroundJob.id == job_id, *unqueued, BackgroundJob.updated_at <= cutoff]
        error = NEVER_QUEUED_ERROR if status == "queued" and not parent else LOST_ERROR
        marked = db.execute(update(BackgroundJob).where(*still).values(**_failed(error))
                            .execution_options(synchronize_session=False))
        found += marked.rowcount  # type: ignore[attr-defined]
    return found


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


def _another_sweep_running(db: Session) -> bool:
    """Take the sweep's lock for this transaction (PostgreSQL; SQLite has one process)."""
    if db.get_bind().dialect.name != "postgresql":
        return False
    return not db.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": RECOVERY_LOCK_KEY})


def recover(db: Session, *, runner: str, storage_root: str | Path | None, documents_older_than: timedelta,
            jobs_older_than: timedelta, staged_older_than: timedelta) -> Recovered:
    found = Recovered()
    if _another_sweep_running(db):
        db.rollback()
        return found
    found.documents = documents_without_a_reading_job(db, runner=runner, older_than=documents_older_than)
    if runner == "procrastinate":
        found.jobs = jobs_the_queue_does_not_hold(db, older_than=jobs_older_than)
    db.commit()
    if storage_root is not None:
        found.staged_files = staged_upload_files(storage_root, older_than=staged_older_than)
    if found:
        logger.info("recovered after a stop: %d unread document(s), %d lost job(s), %d staged file(s)",
                    found.documents, found.jobs, found.staged_files)
    return found
