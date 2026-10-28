"""How jobs run: Procrastinate on PostgreSQL, or in-process.

``JOB_RUNNER`` picks it (``auto`` by default):

- ``procrastinate`` -- the product (Docker, PostgreSQL). The request saves a
  job row, hands its id to Procrastinate and returns straight away; a worker
  running inside the API process picks it up. Procrastinate's tables live in
  the "procrastinate" PostgreSQL schema (migration d8b2f4a6c913).
- ``inline`` -- SQLite developer mode and the test suite. The request runs
  the job itself, in a worker thread so the server keeps answering other
  requests, and replies once it is done, as uploads always did there.

``auto`` means procrastinate on PostgreSQL and inline otherwise.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool

from app.db.session import build_session_factory
from app.jobs import corpus as corpus_jobs
from app.jobs.handlers import HANDLERS
from app.jobs import recovery
from app.jobs.queue_schema import QUEUE_SCHEMA, ensure_queue_schema
from app.jobs.records import Handler, execute_job, mark_interrupted
from app.jobs.schedule import TICK_SECONDS, scheduler_tick
from app.models.jobs import BackgroundJob

logger = logging.getLogger("journalism.jobs")

QUEUE_NAME = "workbench"
TASK_NAME = "workbench.run_background_job"
TICK_TASK_NAME = "workbench.scheduler_tick"
RUNNERS = ("auto", "inline", "procrastinate")
RECOVER_DOCUMENTS_AFTER = timedelta(minutes=10)
RECOVER_JOBS_AFTER = timedelta(hours=1)


def resolve_runner(configured: str, engine: Engine) -> str:
    choice = (configured or "auto").strip().lower()
    if choice not in RUNNERS:
        raise ValueError(f"JOB_RUNNER must be one of {', '.join(RUNNERS)}, not {configured!r}")
    if choice == "auto":
        return "procrastinate" if engine.dialect.name == "postgresql" else "inline"
    if choice == "procrastinate" and engine.dialect.name != "postgresql":
        raise ValueError("JOB_RUNNER=procrastinate needs a PostgreSQL database")
    return choice


def queue_conninfo(engine: Engine) -> str:
    """libpq connection string for the app's database, with Procrastinate's
    tables first on the search path."""
    from psycopg.conninfo import make_conninfo

    url = engine.url.set(drivername="postgresql")
    return make_conninfo(url.render_as_string(hide_password=False), options=f"-c search_path={QUEUE_SCHEMA}")


class JobRunner:
    """One per FastAPI app (``app.state.jobs``)."""

    def __init__(self, mode: str, session_factory: sessionmaker[Session], engine: Engine,
                 handlers: dict[str, Handler] | None = None, *, concurrency: int = 2) -> None:
        self.mode = mode
        self.session_factory = session_factory
        self.engine = engine
        self.handlers = handlers if handlers is not None else HANDLERS
        self.concurrency = max(1, concurrency)
        self.queue: Any = None          # procrastinate.App, when mode == "procrastinate"
        self._task: Any = None          # the procrastinate Task that runs a job
        self._worker: asyncio.Task[None] | None = None
        self._watchdog: asyncio.Task[None] | None = None
        self._ticker: asyncio.Task[None] | None = None
        self._corpus_queue: corpus_jobs.CorpusQueue | None = None
        if mode == "procrastinate":
            self._build_queue()

    # -- Procrastinate wiring ---------------------------------------------
    def _build_queue(self) -> None:
        import procrastinate

        self.queue = procrastinate.App(
            connector=procrastinate.PsycopgConnector(conninfo=queue_conninfo(self.engine), min_size=1, max_size=4),
        )
        runner = self

        # retry=False: a failed job is recorded on its row and the reporter
        # retries it from the screen (POST /api/jobs/{id}/retry).
        @self.queue.task(name=TASK_NAME, queue=QUEUE_NAME, retry=False)
        def run_background_job(job_id: str) -> None:
            execute_job(runner.session_factory, job_id, runner.handlers, resume_running=True)

        self._task = run_background_job

        # The heartbeat of the app's own timed work (app/jobs/schedule.py): each minute is deferred once,
        # whichever worker defers it (Procrastinate's periodic defers are unique per task and minute).
        @self.queue.periodic(cron="* * * * *", periodic_id="workbench-tick")
        @self.queue.task(name=TICK_TASK_NAME, queue=QUEUE_NAME, retry=False)
        def run_scheduler_tick(timestamp: int) -> None:
            scheduler_tick(runner.session_factory)
        # The corpus jobs (ADR-0006, Wave B) share this queue and its worker.
        corpus_jobs.register_tasks(self.queue, self.session_factory, self.engine, queue_name=QUEUE_NAME)

    async def start(self) -> None:
        """Called from the app's lifespan after the schema is migrated."""
        if self.mode == "inline":
            with self.session_factory() as db:
                count = mark_interrupted(db, runner="inline")
            if count:
                logger.info("marked %d interrupted job(s) as failed", count)
            # Nothing else runs this process's jobs, so whatever is unfinished now
            # was left by the process that stopped.
            self._recover(documents_older_than=timedelta(0), jobs_older_than=timedelta(0),
                          staged_older_than=timedelta(0))
            # No worker in this mode: the app's timed work runs from a loop here instead (app/jobs/schedule.py).
            self._ticker = asyncio.create_task(self._tick_forever())
            return
        if await run_in_threadpool(ensure_queue_schema, self.engine):
            logger.info("created the job queue schema")
        await self.queue.open_async()
        # Services queue corpus pushes from synchronous code: a synchronous
        # pool of their own (app/jobs/corpus.py says why).
        self._corpus_queue = corpus_jobs.CorpusQueue(queue_conninfo(self.engine), queue_name=QUEUE_NAME)
        await run_in_threadpool(self._corpus_queue.open)
        corpus_jobs.register_queue(self.engine, self._corpus_queue)
        await self._retry_stalled()
        self._worker = asyncio.create_task(self.queue.run_worker_async(
            queues=[QUEUE_NAME], concurrency=self.concurrency, install_signal_handlers=False,
            name="workbench-api",
        ))
        self._watchdog = asyncio.create_task(self._watch_stalled())

    async def stop(self) -> None:
        from app.services import document_reader

        document_reader.shutdown()
        for task in (self._watchdog, self._worker, self._ticker):
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        self._watchdog = self._worker = self._ticker = None
        if self._corpus_queue is not None:
            corpus_jobs.unregister_queue(self.engine, self._corpus_queue)
            with contextlib.suppress(Exception):
                await run_in_threadpool(self._corpus_queue.close)
            self._corpus_queue = None
        if self.queue is not None:
            with contextlib.suppress(Exception):
                await self.queue.close_async()

    def _recover(self, *, documents_older_than: timedelta, jobs_older_than: timedelta,
                 staged_older_than: timedelta) -> None:
        """Give what a stopped process left half-done a final state (recovery.py)."""
        from app.core.config import settings
        from app.services.security import resolve_storage_root

        try:
            with self.session_factory() as db:
                recovery.recover(db, runner=self.mode, storage_root=resolve_storage_root(settings.document_storage_dir),
                                 documents_older_than=documents_older_than, jobs_older_than=jobs_older_than,
                                 staged_older_than=staged_older_than)
        except Exception:
            logger.warning("could not look for work a stopped process left unfinished", exc_info=True)

    async def _retry_stalled(self) -> None:
        """Hand back jobs whose worker stopped heartbeating (a crash or a
        killed container), as Procrastinate's docs recommend.

        One job at a time: a stalled corpus job cannot go back to waiting
        while a newer job with its queueing lock already waits (the unique
        index procrastinate_jobs_queueing_lock_idx_v1), and that must not stop
        the others being handed back. The newer job does its work anyway, so
        the stalled one is closed as failed.
        """
        from procrastinate.exceptions import UniqueViolation
        from procrastinate.jobs import Status

        try:
            stalled = await self.queue.job_manager.get_stalled_jobs(queue=QUEUE_NAME, seconds_since_heartbeat=60)
        except Exception:
            logger.warning("could not check for stalled jobs", exc_info=True)
            return
        for job in stalled:
            try:
                await self.queue.job_manager.retry_job(job)
                logger.info("retried stalled job %s", job.id)
            except UniqueViolation:
                with contextlib.suppress(Exception):
                    await self.queue.job_manager.finish_job(job=job, status=Status.FAILED, delete_job=False)
                logger.info("closed stalled job %s: a newer one with its queueing lock is waiting", job.id)
            except Exception:
                logger.warning("could not retry stalled job %s", job.id, exc_info=True)
        # Another API process may be between saving a row and queueing its job,
        # so only what has not moved for a while counts as left behind; a job
        # waits longer than the longest OpenAleph read can take.
        await run_in_threadpool(self._recover, documents_older_than=RECOVER_DOCUMENTS_AFTER,
                                jobs_older_than=RECOVER_JOBS_AFTER, staged_older_than=RECOVER_JOBS_AFTER)

    async def _tick_forever(self) -> None:
        while True:
            await asyncio.sleep(TICK_SECONDS)
            try:
                await run_in_threadpool(scheduler_tick, self.session_factory)
            except Exception:
                logger.warning("the scheduler tick failed", exc_info=True)

    async def _watch_stalled(self) -> None:
        while True:
            await asyncio.sleep(60)
            await self._retry_stalled()

    # -- Submitting work ----------------------------------------------------
    async def submit(self, job: BackgroundJob, db: Session | None = None) -> None:
        """Start a queued job. Inline: runs it now (in a worker thread) and
        returns when it has finished, on the same database as ``db`` (the
        request's session) when given. Procrastinate: queues it and returns."""
        if self.mode == "inline":
            factory = build_session_factory(db.get_bind()) if db is not None else self.session_factory  # type: ignore[arg-type]
            await run_in_threadpool(execute_job, factory, job.id, self.handlers)
            return
        queue_job_id = await self._task.defer_async(job_id=job.id)
        with self.session_factory() as db:
            row = db.get(BackgroundJob, job.id)
            if row is not None:
                row.queue_job_id = queue_job_id
                db.commit()

    async def cancel(self, job: BackgroundJob) -> None:
        """Withdraw a queued job from Procrastinate (the row is marked
        cancelled by the caller)."""
        if self.mode == "procrastinate" and job.queue_job_id is not None:
            with contextlib.suppress(Exception):
                await self.queue.job_manager.cancel_job_by_id_async(job.queue_job_id)


def job_runner(request: Any) -> JobRunner:
    """The JobRunner create_app() attached to this request's app."""
    runner: JobRunner | None = getattr(request.app.state, "jobs", None)
    if runner is None:
        raise RuntimeError("Background jobs are not set up on this app; build it with app.main.create_app()")
    return runner
