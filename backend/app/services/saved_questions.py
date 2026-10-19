"""Saved questions and research without approval (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 4).

A saved question is an AI run's question kept to be asked again: by a person (Run now), or by the app when an
import finishes in a case whose research mode is Without approval. Each run goes through the same validation as a
run started from Before you run, under the case's own run settings, and lands as a proposal in Decide; nothing
joins the case until a person accepts it. One import starts each saved question at most once.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import BackgroundJob, IngestionBatch, Investigation, SavedQuestion
from app.services import preferences

logger = logging.getLogger("journalism.saved_questions")

MODULES = ("case_synthesis", "hypothesis_test")


def serialize(q: SavedQuestion) -> dict[str, Any]:
    return {"id": q.id, "investigation_id": q.investigation_id, "module": q.module, "question": q.question,
            "working_theory": q.working_theory, "created_by": q.created_by, "created_at": q.created_at,
            "last_run_id": q.last_run_id, "last_run_at": q.last_run_at}


def listing(db: Session, investigation_id: str) -> list[SavedQuestion]:
    return list(db.scalars(select(SavedQuestion).where(SavedQuestion.investigation_id == investigation_id)
                           .order_by(SavedQuestion.created_at)))


def create(db: Session, investigation_id: str, *, module: str, question: str, working_theory: str | None,
           created_by: str | None) -> SavedQuestion:
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    if module not in MODULES:
        raise ValueError(f"A saved question runs a case synthesis or a theory test, not {module!r}")
    text = question.strip()
    if not text:
        raise ValueError("Write the question first")
    theory = (working_theory or "").strip() or None
    if module == "hypothesis_test" and not theory:
        raise ValueError("A theory test needs the theory to test")
    same = db.scalar(select(SavedQuestion).where(SavedQuestion.investigation_id == investigation_id, SavedQuestion.module == module,
                                                 SavedQuestion.question == text))
    if same is not None:
        return same
    row = SavedQuestion(investigation_id=investigation_id, module=module, question=text, working_theory=theory, created_by=created_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Research mode, per case -------------------------------------------------------------------------------------

def case_research_mode(db: Session, investigation_id: str) -> tuple[str, str | None]:
    """This case's research mode and, when it has its own, the reason it was set."""
    row = preferences._get(db, "case", investigation_id, "research")
    mode = (row.value or {}).get("mode") if row else None
    if mode in preferences.RESEARCH_MODES:
        return mode, row.reason if row else None
    return preferences.research_mode(db), None


def save_case_research_mode(db: Session, investigation_id: str, mode: str | None, reason: str | None) -> None:
    """A case's own research mode (with the reason), or None to follow the default again."""
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    if mode is None:
        row = preferences._get(db, "case", investigation_id, "research")
        if row is not None:
            db.delete(row)
            db.commit()
        return
    if mode not in preferences.RESEARCH_MODES:
        raise ValueError(f"Research without asking cannot be {mode!r}")
    if not (reason or "").strip():
        raise ValueError("Say in one line why this case does research differently")
    preferences._put(db, "case", investigation_id, "research", {"mode": mode}, reason=(reason or "").strip()[:300],
                     investigation_id=investigation_id)


# --- Running a saved question ------------------------------------------------------------------------------------

def _ai_ready() -> bool:
    return bool(settings.enable_ai_features and (settings.ai_provider or "").strip())


def queue_run(db: Session, question: SavedQuestion, *, actor_id: str, batch: IngestionBatch | None = None) -> BackgroundJob:
    """Queue one run of a saved question under the case's run settings, as Before you run would."""
    from app.ai.reasoning import TAS_MODULES, validate_reasoning_request
    from app.jobs.handlers import AI_REASONING
    from app.jobs.records import create_job
    from app.services.run_plan import get_profile

    profile = get_profile(db, question.investigation_id)
    flags = {**profile["flags"]}
    resolved = validate_reasoning_request(investigation_id=question.investigation_id, module=question.module,
                                          working_theory=question.working_theory, control_flags=flags, record_refs=None,
                                          run_options=profile["options"], premises=profile["premises"])
    from app.jobs import corpus as corpus_jobs

    runner = "procrastinate" if corpus_jobs.queue_for(db.get_bind()) is not None else "inline"
    job = create_job(db, kind=AI_REASONING, investigation_id=question.investigation_id, subject_type="ai_run", runner=runner,
                     payload={"module": question.module, "question": question.question, "working_theory": question.working_theory,
                              "max_results": 30, "include_external_leads": True, "record_refs": None,
                              "control_flags": flags if question.module in TAS_MODULES else None, "resolved_control_flags": resolved,
                              "run_options": profile["options"], "premises": profile["premises"], "changes": None, "packet_from": None,
                              "actor_id": actor_id, "saved_question_id": question.id,
                              "started_by": "the app, after an import" if batch is not None else "you"},
                     message="Waiting for the model")
    question.last_run_id = job.id
    question.last_run_at = utcnow_naive()
    if batch is not None:
        question.last_batch_id = batch.id
    db.commit()
    _start(db, job.id)
    return job


def _start(db: Session, job_id: str) -> None:
    """Start a queued run from synchronous code: on the Procrastinate queue when it runs, else in a thread of its
    own (developer mode), so the read or request that queued it does not wait for the model."""
    from procrastinate.tasks import configure_task

    from app.jobs import corpus as corpus_jobs
    from app.jobs.handlers import HANDLERS
    from app.jobs.records import execute_job
    from app.jobs.runner import QUEUE_NAME, TASK_NAME

    queue = corpus_jobs.queue_for(db.get_bind())
    if queue is not None:
        queue_job_id = configure_task(name=TASK_NAME, job_manager=queue.manager, queue=QUEUE_NAME,
                                      task_kwargs={"job_id": job_id}).defer()
        row = db.get(BackgroundJob, job_id)
        if row is not None:
            row.queue_job_id = queue_job_id
            db.commit()
        return
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    threading.Thread(target=execute_job, args=(factory, job_id, HANDLERS), name=f"saved-question-{job_id[:8]}", daemon=True).start()


def on_import_finished(db: Session, batch: IngestionBatch) -> list[str]:
    """An import finished: in a case set to Without approval, each of its saved questions not yet run for this
    import is queued. Returns the job ids queued."""
    mode, _ = case_research_mode(db, batch.investigation_id)
    if mode != "automatic" or not _ai_ready():
        return []
    queued: list[str] = []
    for question in listing(db, batch.investigation_id):
        if question.last_batch_id == batch.id:
            continue
        try:
            queued.append(queue_run(db, question, actor_id="the app", batch=batch).id)
        except Exception:
            db.rollback()
            logger.warning("could not start saved question %s after import %s", question.id, batch.id, exc_info=True)
    return queued
