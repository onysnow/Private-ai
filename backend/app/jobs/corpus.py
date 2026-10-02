"""Corpus jobs: keep each investigation's OpenAleph collection in step with
what its reporters have confirmed (ADR-0006, Wave B).

Two Procrastinate tasks on the Workbench's own queue do the work:

- the corpus push (``PUSH_TASK``) sends changed records, removes merged-away
  ones (app/services/corpus_push.py) and sends reporters' cross-reference
  decisions to OpenAleph as judgements (app/services/cross_references.py);
- cross-referencing (``XREF_TASK``), queued by a push that changed the
  collection: it waits until OpenAleph has indexed what was written (its
  cross-referencing reads the search index, aleph/logic/xref.py
  _query_entities), asks OpenAleph to cross-reference the collection, checks
  back until OpenAleph's queue no longer holds the run, and stores the
  matches as proposals. Each wait is a short job queued again, not a job
  that sleeps, so a long run never holds one of the worker's two slots.

The push is queued from the service functions that confirm, edit, merge or
link entities, after their commit (``request_corpus_sync``). Two Procrastinate
features make a burst of changes one push (procrastinate/tasks.py
Task.configure; the vendored schema, alembic/sql/procrastinate_3.10.0_schema.sql):

- ``queueing_lock``: one waiting job per investigation and task. Queueing
  another while one waits raises AlreadyEnqueued, and the waiting job will
  carry the newer change anyway, because it reads the database when it runs
  (unique index procrastinate_jobs_queueing_lock_idx_v1, status 'todo').
- ``lock``: one running job per investigation and task, in the order they were
  queued (procrastinate_fetch_job_v2).

A change queues its push a few seconds ahead
(OPENALEPH_CORPUS_PUSH_DELAY_SECONDS) so the changes made meanwhile join it.

A failure is not left to Procrastinate's own retry: retrying puts the failed
job back to 'todo' (procrastinate_retry_job_v2), which breaks the unique
queueing-lock index whenever a newer job is already waiting. A failed step
records the failure (record_openaleph_operation_failure, and the sync state
the screen shows) and, when the failure looks temporary, queues itself again
after a growing wait. OpenAleph being down never touches the reporter's
change, which was committed before anything here ran.

Jobs are queued from synchronous code (services run in request threads and
in the worker's threads) through a SyncPsycopgConnector pool of their own:
the worker's PsycopgConnector is asynchronous, and once open it would run a
synchronous call through asgiref's async_to_sync on a loop that does not own
its pool (procrastinate/psycopg_connector.py get_sync_connector).

In developer mode (the in-process job runner, SQLite) there is no queue: a
change only shows as pending, and "Sync now" runs the same steps inside the
request (``sync_now``).
"""

from __future__ import annotations

import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable

import httpx
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import CorpusSyncState, Investigation

logger = logging.getLogger("journalism.jobs")

PUSH_TASK = "workbench.corpus_push"
XREF_TASK = "workbench.corpus_cross_reference"
OPERATION_PUSH = "corpus_push"
OPERATION_XREF = "corpus_cross_reference"
FIRST_RETRY_SECONDS = 30.0
PHASE_START = "start"      # a new run: wait for OpenAleph to be idle, then ask
PHASE_WAIT = "wait"        # still waiting to ask, since the run's start
PHASE_COLLECT = "collect"  # asked: wait for the run to end, then read the matches


class CrossReferenceTimeout(Exception):
    """OpenAleph did not finish (or could not start) cross-referencing within
    OPENALEPH_XREF_TIMEOUT_SECONDS; the next change or "Sync now" asks again."""


@dataclass(frozen=True)
class FollowUp:
    """A step to run next: which task, how many seconds from now, with what
    arguments. ``retry`` marks the try after a failure."""
    task: str
    delay: float
    kwargs: dict[str, str] = field(default_factory=dict)
    retry: bool = False


def _engine_key(bind: Any) -> str:
    engine = getattr(bind, "engine", bind)
    return str(engine.url.render_as_string(hide_password=True))


class CorpusQueue:
    """Queues corpus jobs from synchronous code, on the job runner's database."""

    def __init__(self, conninfo: str, *, queue_name: str) -> None:
        from procrastinate import SyncPsycopgConnector
        from procrastinate.manager import JobManager

        self.queue_name = queue_name
        self.connector = SyncPsycopgConnector(conninfo=conninfo, min_size=1, max_size=2)
        self.manager = JobManager(self.connector)

    def open(self) -> None:
        self.connector.open()

    def close(self) -> None:
        self.connector.close()

    def defer(self, follow_up: FollowUp, *, now: bool = False) -> bool:
        """Queue one step; False when one is already waiting for this
        investigation (its run will include this change).

        ``now`` ("Sync now") gets a queueing lock of its own and a higher
        priority, so it runs straight away even while a retry waits for its
        time: Procrastinate passes over a job when a job with the same lock
        and a higher (or the same, and earlier) priority is waiting
        (procrastinate_fetch_job_v2).
        """
        from procrastinate.exceptions import AlreadyEnqueued
        from procrastinate.tasks import configure_task

        lock = f"{follow_up.task}:{follow_up.kwargs.get('investigation_id', '')}"
        deferrer = configure_task(
            name=follow_up.task, job_manager=self.manager, lock=lock,
            queueing_lock=f"{lock}:now" if now else lock, queue=self.queue_name, priority=1 if now else 0,
            # Procrastinate takes whole seconds (procrastinate/types.py TimeDeltaParams).
            schedule_in={"seconds": max(1, math.ceil(follow_up.delay))} if follow_up.delay > 0 else None,
            task_kwargs=dict(follow_up.kwargs),
        )
        try:
            deferrer.defer()
        except AlreadyEnqueued:
            return False
        return True


# The queue each running job runner offers, by the database it runs on. Empty
# in developer mode and in the test suite's in-process runner.
_queues: dict[str, CorpusQueue] = {}


def register_queue(engine: Engine, queue: CorpusQueue) -> None:
    _queues[_engine_key(engine)] = queue


def unregister_queue(engine: Engine, queue: CorpusQueue) -> None:
    if _queues.get(_engine_key(engine)) is queue:
        del _queues[_engine_key(engine)]


def queue_for(bind: Any) -> CorpusQueue | None:
    return _queues.get(_engine_key(bind))


def runs_in_background(db: Session) -> bool:
    """Whether changes reach OpenAleph by themselves here (a Procrastinate
    worker is running), or only on "Sync now"."""
    return queue_for(db.get_bind()) is not None


def _wanted(db: Session, investigation_id: str) -> bool:
    investigation = db.get(Investigation, investigation_id)
    return investigation is not None and not investigation.is_demo


def request_corpus_sync(db: Session, investigation_id: str) -> bool:
    """Queue a push of one investigation's confirmed records, after a change.

    Called by the services after they commit. Never raises: the change is
    already saved, and a queue that cannot be reached must not undo it -- the
    change stays pending and the "Corpus sync" line counts it.
    """
    if not settings.openaleph_enabled:
        return False
    try:
        queue = queue_for(db.get_bind())
        if queue is None or not _wanted(db, investigation_id):
            return False
        return queue.defer(FollowUp(PUSH_TASK, settings.openaleph_corpus_push_delay_seconds,
                                    {"investigation_id": investigation_id}))
    except Exception:
        logger.warning("could not queue a corpus push", exc_info=True, extra={"investigation_id": investigation_id})
        return False


def queue_sync_now(db: Session, investigation_id: str) -> bool:
    """"Sync now" when a worker is running: queue a push to run at once."""
    queue = queue_for(db.get_bind())
    if queue is None:
        raise RuntimeError("No background worker is running here")
    return queue.defer(FollowUp(PUSH_TASK, 0, {"investigation_id": investigation_id}), now=True)


def sync_state(db: Session, investigation_id: str) -> CorpusSyncState:
    """The investigation's sync state row, made on first use (not committed)."""
    state = db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == investigation_id))
    if state is None:
        state = CorpusSyncState(investigation_id=investigation_id, push_status="never", xref_status="never",
                                push_counts={}, xref_counts={}, consecutive_failures=0)
        db.add(state)
    return state


def is_temporary(exc: BaseException) -> bool:
    """Whether trying again later could succeed: OpenAleph unreachable, timing
    out or answering 5xx -- not a refusal (4xx) or a fault in the data.

    openaleph-client marks connection errors, timeouts and 5xx replies as
    ``transient`` (openaleph_client/errors.py AlephException).
    """
    if getattr(exc, "transient", False):
        return True
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return False


def retry_delay(failures: int) -> float:
    """30 s after the first failure, doubling each time, up to
    OPENALEPH_CORPUS_RETRY_MAX_SECONDS."""
    return float(min(settings.openaleph_corpus_retry_max_seconds, FIRST_RETRY_SECONDS * 2 ** max(0, failures - 1)))


def record_failure(db: Session, investigation_id: str, operation: str, exc: BaseException, retry: FollowUp) -> list[FollowUp]:
    """Record a failed step where the screen shows it, and say whether and
    when to try again."""
    from app.services.openaleph_corpus import record_openaleph_operation_failure

    message = f"{type(exc).__name__}: {exc}"[:4000]
    db.rollback()
    try:
        record_openaleph_operation_failure(db, investigation_id=investigation_id, document_id=None,
                                           operation=operation, error=message)
    except Exception:  # diagnostic only; must not hide the failure being recorded
        db.rollback()
        logger.warning("could not record a corpus failure", exc_info=True)
    state = sync_state(db, investigation_id)
    state.consecutive_failures = (state.consecutive_failures or 0) + 1
    if operation == OPERATION_PUSH:
        state.push_status = "failed"
        state.push_error = message
        state.push_finished_at = utcnow_naive()
    else:
        state.xref_status = "failed"
        state.xref_error = message
        state.xref_finished_at = utcnow_naive()
    failures = state.consecutive_failures
    db.commit()
    logger.warning("corpus %s failed", operation, exc_info=(type(exc), exc, exc.__traceback__),
                   extra={"investigation_id": investigation_id})
    if not is_temporary(exc) or failures > settings.openaleph_corpus_max_retries:
        return []
    return [FollowUp(retry.task, retry_delay(failures), retry.kwargs, retry=True)]


def _xref_in_progress(state: CorpusSyncState, now: datetime) -> bool:
    """A cross-referencing run is under way and not given up on: it checks for
    changes it missed when it ends. One stuck past the timeout (its job lost)
    no longer counts, so a new one can start."""
    timeout = timedelta(seconds=settings.openaleph_xref_timeout_seconds)
    return state.xref_status in {"waiting", "running"} and state.xref_requested_at is not None \
        and now - state.xref_requested_at <= timeout


def xref_due(state: CorpusSyncState, now: datetime) -> bool:
    """Whether the collection holds changes no successful cross-referencing
    run has seen: a run started (xref_requested_at) before the last change
    (changed_at), or none succeeded yet."""
    if state.changed_at is None or _xref_in_progress(state, now):
        return False
    if state.xref_status != "succeeded" or state.xref_requested_at is None:
        return True
    return state.changed_at > state.xref_requested_at


def push_step(session_factory: sessionmaker[Session], investigation_id: str, *, gateway: Any) -> list[FollowUp]:
    """One corpus push, then the reporters' pending match judgements; returns
    what to run next (another push while removals wait, and cross-referencing
    when the collection changed)."""
    from app.services.corpus_push import push_confirmed_records
    from app.services.cross_references import send_pending_judgements

    if not settings.openaleph_enabled:
        return []
    args = {"investigation_id": investigation_id}
    with session_factory() as db:
        if not _wanted(db, investigation_id):
            return []
        state = sync_state(db, investigation_id)
        state.push_status = "running"
        state.push_started_at = utcnow_naive()
        db.commit()
        try:
            result = push_confirmed_records(db, investigation_id, gateway=gateway)
            judgements = send_pending_judgements(db, investigation_id, gateway=gateway)
        except Exception as exc:
            return record_failure(db, investigation_id, OPERATION_PUSH, exc, FollowUp(PUSH_TASK, 0, args))
        result.judgements_sent, result.judgements_failed = judgements["sent"], judgements["failed"]
        state = sync_state(db, investigation_id)
        now = utcnow_naive()
        state.push_status = "waiting" if result.removals_waiting else "succeeded"
        state.push_finished_at = now
        state.push_message = result.message()
        state.push_error = None
        state.push_counts = result.counts()
        state.consecutive_failures = 0
        if result.changed:
            state.changed_at = now
        due = bool(result.collection_id) and xref_due(state, now)
        db.commit()
        follow_ups: list[FollowUp] = []
        if result.removals_waiting:
            follow_ups.append(FollowUp(PUSH_TASK, settings.openaleph_corpus_poll_seconds, args))
        if due:
            follow_ups.append(FollowUp(XREF_TASK, settings.openaleph_corpus_push_delay_seconds,
                                       {**args, "phase": PHASE_START}))
        return follow_ups


def xref_step(session_factory: sessionmaker[Session], investigation_id: str, phase: str, *, gateway: Any) -> list[FollowUp]:
    """One step of cross-referencing the investigation's collection.

    "start" (then "wait"): wait while OpenAleph is still indexing the
    collection or already cross-referencing it, then ask it to (POST .../xref).
    "collect": wait while OpenAleph's queue still holds the run (GET .../status
    lists active xref_collection jobs, openaleph_procrastinate
    manage/status.py), then read the matches (GET .../xref) and store them as
    proposals. OpenAleph's status cannot tell a finished run from a failed one
    once neither is active, so a failed run shows as no new matches; its own
    queue retries a failing run first (openaleph_procrastinate
    ServiceSettings.max_retries, 5). Each wait gives up after
    OPENALEPH_XREF_TIMEOUT_SECONDS.
    """
    from app.services.cross_references import import_cross_references
    from app.services.openaleph_corpus import get_binding

    if not settings.openaleph_enabled:
        return []
    start = {"investigation_id": investigation_id, "phase": PHASE_START}
    wait = {"investigation_id": investigation_id, "phase": PHASE_WAIT}
    collect = {"investigation_id": investigation_id, "phase": PHASE_COLLECT}
    poll = settings.openaleph_corpus_poll_seconds
    timeout = timedelta(seconds=settings.openaleph_xref_timeout_seconds)
    minutes = max(1, round(settings.openaleph_xref_timeout_seconds / 60))
    with session_factory() as db:
        if not _wanted(db, investigation_id):
            return []
        binding = get_binding(db, investigation_id)
        if binding is None:
            return []  # nothing was ever sent
        collection_id = binding.collection_id
        try:
            state = sync_state(db, investigation_id)
            now = utcnow_naive()
            if phase in (PHASE_START, PHASE_WAIT):
                if phase == PHASE_START or state.xref_requested_at is None:
                    state.xref_status, state.xref_requested_at, state.xref_error = "waiting", now, None
                    db.commit()
                if gateway.index_busy(collection_id) or gateway.cross_reference_running(collection_id):
                    if now - state.xref_requested_at > timeout:
                        raise CrossReferenceTimeout(f"OpenAleph was still busy with the collection after {minutes} minute(s)")
                    return [FollowUp(XREF_TASK, poll, wait)]
                gateway.start_cross_reference(collection_id)
                state.xref_status, state.xref_requested_at = "running", utcnow_naive()
                db.commit()
                return [FollowUp(XREF_TASK, poll, collect)]
            if phase != PHASE_COLLECT:
                raise ValueError(f"Unknown cross-referencing phase {phase!r}")
            if gateway.cross_reference_running(collection_id):
                if state.xref_requested_at is not None and now - state.xref_requested_at > timeout:
                    raise CrossReferenceTimeout(f"OpenAleph had not finished cross-referencing after {minutes} minute(s)")
                return [FollowUp(XREF_TASK, poll, collect)]
            counts = import_cross_references(db, investigation_id, gateway.cross_reference_results(collection_id))
        except Exception as exc:
            return record_failure(db, investigation_id, OPERATION_XREF, exc,
                                  FollowUp(XREF_TASK, 0, collect if phase == PHASE_COLLECT else start))
        state = sync_state(db, investigation_id)
        state.xref_status = "succeeded"
        state.xref_finished_at = utcnow_naive()
        state.xref_error = None
        state.xref_counts = counts
        state.consecutive_failures = 0
        missed = state.changed_at is not None and state.xref_requested_at is not None \
            and state.changed_at > state.xref_requested_at
        db.commit()
        # A push made while OpenAleph was cross-referencing is not in this run.
        return [FollowUp(XREF_TASK, settings.openaleph_corpus_push_delay_seconds, start)] if missed else []


def run_step(session_factory: sessionmaker[Session], step: FollowUp, gateway: Any) -> list[FollowUp]:
    investigation_id = step.kwargs.get("investigation_id", "")
    if step.task == PUSH_TASK:
        return push_step(session_factory, investigation_id, gateway=gateway)
    if step.task == XREF_TASK:
        return xref_step(session_factory, investigation_id, step.kwargs.get("phase", PHASE_START), gateway=gateway)
    raise ValueError(f"Unknown corpus task {step.task!r}")


def _new_gateway() -> Any:
    from app.services.openaleph_gateway import CorpusGateway

    return CorpusGateway()


# Tests replace this to keep the worker away from a real OpenAleph.
gateway_factory: Callable[[], Any] = _new_gateway


def register_tasks(app: Any, session_factory: sessionmaker[Session], engine: Engine, *, queue_name: str) -> None:
    """Put the corpus tasks on the job runner's Procrastinate app."""

    def run(step: FollowUp) -> None:
        follow_ups = run_step(session_factory, step, gateway_factory())
        queue = queue_for(engine)
        for follow_up in follow_ups:
            if queue is None:  # pragma: no cover - the runner registers its queue before the worker starts
                logger.warning("corpus follow-up dropped: no queue", extra={"task": follow_up.task})
                continue
            queue.defer(follow_up)

    @app.task(name=PUSH_TASK, queue=queue_name, retry=False)
    def corpus_push(investigation_id: str) -> None:
        run(FollowUp(PUSH_TASK, 0, {"investigation_id": investigation_id}))

    @app.task(name=XREF_TASK, queue=queue_name, retry=False)
    def corpus_cross_reference(investigation_id: str, phase: str = PHASE_START) -> None:
        run(FollowUp(XREF_TASK, 0, {"investigation_id": investigation_id, "phase": phase}))


def _unfinished_cross_reference(session_factory: sessionmaker[Session], investigation_id: str) -> FollowUp | None:
    """The step that carries on a cross-referencing run an earlier "Sync now"
    left going (no worker carries it on in developer mode)."""
    with session_factory() as db:
        state = db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == investigation_id))
        if state is None or not _xref_in_progress(state, utcnow_naive()):
            return None
        phase = PHASE_COLLECT if state.xref_status == "running" else PHASE_WAIT
        return FollowUp(XREF_TASK, 0, {"investigation_id": investigation_id, "phase": phase})


def sync_now(
    session_factory: sessionmaker[Session],
    investigation_id: str,
    *,
    gateway: Any = None,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    wait_seconds: float | None = None,
) -> None:
    """Run the corpus steps for one investigation here and now, waiting
    between them as the queue would (developer mode's "Sync now", and the
    live test). A failure is recorded and not tried again; waiting stops after
    ``wait_seconds`` (OPENALEPH_SYNC_NOW_WAIT_SECONDS), and a cross-referencing
    run still going then is carried on by the next call."""
    gateway = gateway if gateway is not None else gateway_factory()
    wait = settings.openaleph_sync_now_wait_seconds if wait_seconds is None else wait_seconds
    deadline = clock() + max(1.0, wait)
    work: deque[FollowUp] = deque([FollowUp(PUSH_TASK, 0, {"investigation_id": investigation_id})])
    unfinished = _unfinished_cross_reference(session_factory, investigation_id)
    if unfinished is not None:
        work.append(unfinished)
    while work:
        step = work.popleft()
        # Checked before every step, so a wait configured as 0 seconds cannot spin forever.
        if clock() + step.delay > deadline:
            logger.info("sync now stopped waiting", extra={"investigation_id": investigation_id, "task": step.task})
            return
        if step.delay > 0:
            sleep(step.delay)
        for follow_up in run_step(session_factory, step, gateway):
            # As the queueing lock would: one waiting step per task.
            if not follow_up.retry and all(item.task != follow_up.task for item in work):
                work.append(follow_up)
