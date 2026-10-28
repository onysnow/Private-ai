"""Job rows: create, run, report progress, finish, and serialize.

Everything here takes a SQLAlchemy session and knows nothing about the queue
that runs the job, so the in-process runner and the Procrastinate worker
share one implementation of "what running a job means".
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.time import utcnow_naive
from app.models.jobs import FINISHED_JOB_STATUSES, BackgroundJob

logger = logging.getLogger("journalism.jobs")

# A handler does the work for one job kind. It receives a session, the job
# row, and a ``report(progress, message)`` callback, and returns a short
# plain-language result message (or None).
Report = Callable[[int | None, str | None], None]
# A handler returns a short result message, or {"message": ..., "result": {...}}
# when the caller needs data back (kept in the job's payload["result"]).
Handler = Callable[[Session, BackgroundJob, Report], "str | dict | None"]


class JobFailed(Exception):
    """A handler's way to fail with data the caller needs (kept in
    payload["result"]), e.g. the HTTP status an inline run should answer."""

    def __init__(self, message: str, result: dict | None = None):
        super().__init__(message)
        self.result = result or {}


def create_job(
    db: Session, *, kind: str, investigation_id: str | None = None,
    subject_type: str | None = None, subject_id: str | None = None,
    payload: dict[str, Any] | None = None, runner: str = "inline", message: str | None = "Waiting to start",
) -> BackgroundJob:
    job = BackgroundJob(
        kind=kind, investigation_id=investigation_id, subject_type=subject_type, subject_id=subject_id,
        payload=payload or {}, runner=runner, status="queued", attempts=0, message=message,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def serialize_job(job: BackgroundJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "kind": job.kind,
        "investigation_id": job.investigation_id,
        "subject_type": job.subject_type,
        "subject_id": job.subject_id,
        "status": job.status,
        "finished": job.status in FINISHED_JOB_STATUSES,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "attempts": job.attempts,
        "runner": job.runner,
        "result": (job.payload or {}).get("result"),
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "updated_at": job.updated_at,
    }


def list_jobs(
    db: Session, *, investigation_ids: list[str] | None, status: str | None = None,
    subject_id: str | None = None, limit: int = 50,
) -> list[BackgroundJob]:
    """Newest first. ``investigation_ids=None`` means every job (unrestricted
    callers); a list limits the result to jobs in those investigations."""
    stmt = select(BackgroundJob).order_by(BackgroundJob.created_at.desc()).limit(max(1, min(limit, 200)))
    if investigation_ids is not None:
        stmt = stmt.where(BackgroundJob.investigation_id.in_(investigation_ids))
    if status:
        stmt = stmt.where(BackgroundJob.status == status)
    if subject_id:
        stmt = stmt.where(BackgroundJob.subject_id == subject_id)
    return list(db.scalars(stmt).all())


def execute_job(
    session_factory: sessionmaker[Session], job_id: str, handlers: dict[str, Handler], *, resume_running: bool = False,
) -> str | None:
    """Run one job (_execute_job), then what follows a finished one: a document read that ends its import batch
    marks the batch finished, which may start the case's saved questions (app/services/ingestion_batches.py)."""
    status = _execute_job(session_factory, job_id, handlers, resume_running=resume_running)
    if status in ("succeeded", "failed", "cancelled"):
        try:
            with session_factory() as db:
                job = db.get(BackgroundJob, job_id)
                if job is not None and job.kind == "extract_document" and job.subject_id:
                    from app.services.ingestion_batches import after_read

                    after_read(db, job.subject_id)
        except Exception:
            logger.warning("could not finish the import batch after a read", exc_info=True, extra={"job_id": job_id})
    return status


def _execute_job(
    session_factory: sessionmaker[Session], job_id: str, handlers: dict[str, Handler], *, resume_running: bool = False,
) -> str | None:
    """Run one job to completion in the calling thread; returns its final status.

    Never raises for a failure inside the work: the failure is recorded on the
    row (status ``failed`` with the reason) so the screen can show it and the
    reporter can retry. Returns None when the row no longer exists (its
    investigation was deleted). A job that is not waiting to run is left
    alone, except that ``resume_running`` also restarts a job marked running:
    the queue sets it when it hands over a job whose worker stopped mid-way.
    """
    runnable = ("queued", "running") if resume_running else ("queued",)
    with session_factory() as db:
        # One conditional UPDATE claims the job, so a cancel that lands at
        # the same moment either wins (nothing runs) or loses (409) -- never both.
        claimed = db.execute(
            update(BackgroundJob)
            .where(BackgroundJob.id == job_id, BackgroundJob.status.in_(runnable))
            .values(status="running", attempts=BackgroundJob.attempts + 1, started_at=utcnow_naive(),
                    finished_at=None, error=None, progress=0, message="Started", updated_at=utcnow_naive())
        )
        db.commit()
        job = db.get(BackgroundJob, job_id)
        if job is None or not claimed.rowcount:  # type: ignore[attr-defined]
            return job.status if job is not None else None

        def report(progress: int | None, message: str | None) -> None:
            # Its own session, so a progress update never commits the
            # handler's half-done work (on SQLite every session shares one
            # connection anyway; see app/db/session.py). A plain UPDATE, not an
            # ORM flush: a flush takes the investigation's write lock
            # (app/db/mutation_guard.py), which the handler may be holding while
            # it reports (a document read page by page), and would wait forever.
            with session_factory() as progress_db:
                stop = progress_db.scalar(select(BackgroundJob.payload).where(BackgroundJob.id == job_id))
                stopping = bool((stop or {}).get("stop_requested"))
                values: dict[str, Any] = {"updated_at": utcnow_naive()}
                if progress is not None:
                    values["progress"] = max(0, min(100, int(progress)))
                if message is not None and not stopping:
                    values["message"] = message
                progress_db.execute(update(BackgroundJob).where(BackgroundJob.id == job_id).values(**values))
                progress_db.commit()
            if stopping:
                raise JobStopped("Stopped by you")

        handler = handlers.get(job.kind)
        try:
            if handler is None:
                raise LookupError(f"No handler for job kind {job.kind!r}")
            result = handler(db, job, report)
        except JobStopped as exc:
            db.rollback()
            stopped = db.get(BackgroundJob, job_id)
            if stopped is None:
                return None
            stopped.status = "cancelled"
            stopped.message = str(exc) or "Stopped by you"
            stopped.payload = {k: v for k, v in (stopped.payload or {}).items() if k != "stop_requested"}
            stopped.finished_at = utcnow_naive()
            db.commit()
            return "cancelled"
        except Exception as exc:
            db.rollback()
            logger.warning("background job failed", exc_info=(type(exc), exc, exc.__traceback__),
                           extra={"job_id": job_id})
            failed = db.get(BackgroundJob, job_id)
            if failed is None:
                return None
            failed.status = "failed"
            failed.error = str(exc) or type(exc).__name__
            failed.message = "Stopped with an error"
            if isinstance(exc, JobFailed) and exc.result:
                failed.payload = {**(failed.payload or {}), "result": exc.result}
            failed.finished_at = utcnow_naive()
            db.commit()
            return "failed"

        done = db.get(BackgroundJob, job_id)
        if done is None:
            return None
        done.status = "succeeded"
        done.progress = 100
        if isinstance(result, dict):
            done.payload = {**(done.payload or {}), "result": result.get("result")}
            result = result.get("message")
        done.message = result or "Done"
        done.finished_at = utcnow_naive()
        db.commit()
        return "succeeded"


class JobStopped(Exception):
    """A person asked a running job to stop; it stops at its next progress report."""


STOPPABLE_KINDS = {"extract_document"}


def request_stop(db: Session, job: BackgroundJob) -> BackgroundJob:
    """Ask a running job to stop. It stops at its next progress report (a reading job
    reports each page), undoes what it had done, and ends cancelled."""
    if job.status != "running" or job.kind not in STOPPABLE_KINDS:
        raise ValueError(f"Only a document being read can be stopped while it runs (this one is {job.status})")
    # A plain UPDATE: the read holds the investigation's write lock, which an ORM
    # flush would wait on until the read had finished (see report in execute_job).
    db.execute(update(BackgroundJob).where(BackgroundJob.id == job.id)
               .values(payload={**(job.payload or {}), "stop_requested": True}, message="Stopping…", updated_at=utcnow_naive()))
    db.commit()
    db.refresh(job)
    return job


def requeue_for_retry(db: Session, job: BackgroundJob) -> BackgroundJob:
    """Put a failed or cancelled job back in the queue (the caller hands it
    to the runner afterwards)."""
    requeued = db.execute(
        update(BackgroundJob)
        .where(BackgroundJob.id == job.id, BackgroundJob.status.in_(("failed", "cancelled")))
        # The last attempt's queue job has finished; until the runner hands this
        # attempt over, no queue job stands behind it (app/jobs/recovery.py).
        .values(status="queued", error=None, progress=None, message="Waiting to start", finished_at=None,
                queue_job_id=None, updated_at=utcnow_naive())
    )
    db.commit()
    db.refresh(job)
    if not requeued.rowcount:  # type: ignore[attr-defined]
        raise ValueError(f"Only failed or cancelled jobs can be retried (this one is {job.status})")
    return job


def cancel_queued(db: Session, job: BackgroundJob) -> BackgroundJob:
    cancelled = db.execute(
        update(BackgroundJob)
        .where(BackgroundJob.id == job.id, BackgroundJob.status == "queued")
        .values(status="cancelled", message="Cancelled before it started", finished_at=utcnow_naive(),
                updated_at=utcnow_naive())
    )
    db.commit()
    db.refresh(job)
    if not cancelled.rowcount:  # type: ignore[attr-defined]
        raise ValueError(f"Only jobs that have not started can be cancelled (this one is {job.status})")
    return job


def mark_interrupted(db: Session, *, runner: str) -> int:
    """Fail jobs a stopped process left behind, so the reporter can retry them.

    Only for the in-process runner: its jobs run inside this process, so at
    start-up any job still marked running or queued belonged to a process
    that is gone. (Procrastinate keeps its own record of running jobs and
    retries those of a stopped worker; see runner.py.)
    """
    rows = db.scalars(select(BackgroundJob).where(
        BackgroundJob.runner == runner, BackgroundJob.status.in_(("queued", "running")),
    )).all()
    for row in rows:
        row.status = "failed"
        row.error = "The app stopped before this finished."
        row.message = "Interrupted -- retry it"
        row.finished_at = utcnow_naive()
    if rows:
        db.commit()
    return len(rows)
