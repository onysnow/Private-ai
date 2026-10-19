"""Watch the run (mockup AI_1, ADR-0012): each AI run and its record of steps. Every route is under
/investigations/{investigation_id}; a run named in the path is checked to belong to that case.

The events can be read two ways: GET …/events?after=n answers at once with the events after n (the poll the screen
uses), and GET …/events/stream sends them as Server-Sent Events while the run lasts, resuming after Last-Event-ID.
"""
import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.run_events import RunRecorder, run_events, serialize_event
from app.ai.suite import run_route
from app.api.dependencies import authorize_request_resource
from app.db.session import SessionLocal, get_db
from app.jobs.handlers import AI_REASONING
from app.models.domain import (
    AIAnalysisCandidate,
    AIRunEvent,
    BackgroundJob,
    Investigation,
)
from app.schemas.api import AiThoughtMarkRequest
from app.schemas.responses import AiRunEventOut, AiRunEventsOut, AiRunsOut

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _run_row(db: Session, investigation_id: str, run_id: str) -> BackgroundJob:
    job = db.get(BackgroundJob, run_id)
    if job is None or job.kind != AI_REASONING or job.investigation_id != investigation_id:
        raise HTTPException(404, "AI run not found")
    return job


def _saved_candidate(db: Session, job: BackgroundJob) -> AIAnalysisCandidate | None:
    """The answer this run saved. A run the app's checks rejected still saves its answer (as rejected) but ends as a
    failed job with no result, so the run record's own "Saved as" step is read when the result names none."""
    result = (job.payload or {}).get("result") or {}
    candidate_id = result.get("candidate_id")
    if not candidate_id:
        for refs in db.scalars(select(AIRunEvent.refs).where(AIRunEvent.run_id == job.id, AIRunEvent.kind == "WRITE",
                                                             AIRunEvent.node == "candidate")).all():
            candidate_id = next((r.get("record_id") for r in refs or [] if r.get("record_type") == "ai_analysis_candidate"), None)
            if candidate_id:
                break
    candidate = db.get(AIAnalysisCandidate, candidate_id) if candidate_id else None
    return candidate if candidate is not None and candidate.investigation_id == job.investigation_id else None


def serialize_run(db: Session, job: BackgroundJob) -> dict[str, Any]:
    payload = job.payload or {}
    candidate = _saved_candidate(db, job)
    counts: dict[str, int] = {}
    # A problem is a stopped step, or an in-between one the app found; what the model says of itself ("model says",
    # in between) is not one until a check confirms it. Watch the run counts the same way (isProblem).
    problems = 0
    for status, self_reported, n in db.execute(
            select(AIRunEvent.status, AIRunEvent.self_reported, func.count()).where(AIRunEvent.run_id == job.id)
            .group_by(AIRunEvent.status, AIRunEvent.self_reported)).all():
        counts[str(status)] = counts.get(str(status), 0) + int(n)
        if status == "bad" or (status == "partial" and not self_reported):
            problems += int(n)
    return {
        "run_id": job.id, "status": job.status, "finished": job.status in ("succeeded", "failed", "cancelled"),
        "module": payload.get("module") or "", "question": payload.get("question") or "", "working_theory": payload.get("working_theory"),
        "created_at": job.created_at, "started_at": job.started_at, "finished_at": job.finished_at,
        # The answer as it stands now: its review status changes after the run, when you accept or reject it.
        "candidate_id": candidate.id if candidate else None, "review_status": candidate.review_status if candidate else None,
        "events": sum(counts.values()), "problems": problems,
        "message": job.message, "error": job.error,
        # How the suite service routed it (app/ai/suite.py), and the accepted answer it started from, if any.
        "route": run_route(payload.get("module") or ""), "handoff_from": payload.get("handoff_from"),
    }


@router.get("/investigations/{investigation_id}/ai-runs", response_model=AiRunsOut)
def list_ai_runs(investigation_id: str, limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)) -> Any:
    """This case's AI runs, newest first."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    jobs = db.scalars(select(BackgroundJob).where(BackgroundJob.kind == AI_REASONING, BackgroundJob.investigation_id == investigation_id)
                      .order_by(BackgroundJob.created_at.desc()).limit(limit)).all()
    return {"runs": [serialize_run(db, j) for j in jobs]}


@router.get("/investigations/{investigation_id}/ai-runs/{run_id}/events", response_model=AiRunEventsOut)
def list_ai_run_events(investigation_id: str, run_id: str, after: int = Query(default=0, ge=0), db: Session = Depends(get_db)) -> Any:
    """The run and its events after `after` (0 = from the start)."""
    job = _run_row(db, investigation_id, run_id)
    return {"run": serialize_run(db, job), "events": [serialize_event(e) for e in run_events(db, investigation_id, run_id, after)]}


_MARKS = {"to_check": ("neutral", "TO_CHECK", "You marked {t} to check"), "keep": ("good", "KEPT", "You kept {t}"),
          "reject": ("bad", "REJECTED", "You rejected {t}")}


@router.post("/investigations/{investigation_id}/ai-runs/{run_id}/thoughts/{thought_id}/mark", response_model=AiRunEventOut)
def mark_ai_run_thought(investigation_id: str, run_id: str, thought_id: str, body: AiThoughtMarkRequest, db: Session = Depends(get_db)) -> Any:
    """Your mark on one thought (a claim, gap or hypothesis the model said), appended to the run record as a step by
    you that follows the thought. Accept and reject of the whole answer stay on the candidate's review."""
    job = _run_row(db, investigation_id, run_id)
    if job.status not in ("succeeded", "failed", "cancelled"):
        raise HTTPException(409, "The run is still going; mark its thoughts when it has finished")
    said = [e for e in run_events(db, investigation_id, run_id) if e.self_reported and (e.detail or {}).get("thought") == thought_id]
    if not said:
        raise HTTPException(404, "No such thought in this run")
    status, verdict, words = _MARKS[body.mark]
    reason = (body.reason or "").strip() or None
    rec = RunRecorder(db, investigation_id, run_id)
    n = rec.emit("CHECK", "review", system="app", status=status, verdict=verdict, parent=said[0].n, refs=said[0].refs,
                 text=words.format(t=thought_id) + (f": {reason}" if reason else ""), detail={"thought": thought_id, "mark": body.mark, "reason": reason})
    return serialize_event(next(e for e in run_events(db, investigation_id, run_id, (n or 1) - 1) if e.n == n))


def _read(investigation_id: str, run_id: str, after: int) -> tuple[list[dict], bool]:
    with SessionLocal() as db:
        job = db.get(BackgroundJob, run_id)
        finished = job is None or job.status in ("succeeded", "failed", "cancelled")
        return [serialize_event(e) for e in run_events(db, investigation_id, run_id, after)], finished


# Kept out of the OpenAPI schema: the generated client has no shape for an event stream, and the screen polls
# …/events?after=n (ADR-0012). The route is tested in tests/test_run_events.py.
@router.get("/investigations/{investigation_id}/ai-runs/{run_id}/events/stream", response_class=StreamingResponse, include_in_schema=False)
def stream_ai_run_events(investigation_id: str, run_id: str, after: int = Query(default=0, ge=0),
                         last_event_id: str | None = Header(default=None), db: Session = Depends(get_db)) -> StreamingResponse:
    """The run's events as Server-Sent Events (`id` is the event's n), until the run has finished."""
    _run_row(db, investigation_id, run_id)
    start = int(last_event_id) if last_event_id and last_event_id.isdigit() else after

    async def events() -> AsyncIterator[str]:
        seen = start
        while True:
            rows, finished = await run_in_threadpool(_read, investigation_id, run_id, seen)
            for row in rows:
                seen = row["n"]
                yield f"id: {row['n']}\nevent: step\ndata: {json.dumps(row, default=str)}\n\n"
            if finished and not rows:
                yield "event: end\ndata: {}\n\n"
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
