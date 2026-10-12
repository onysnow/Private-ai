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

from app.ai.run_events import run_events, serialize_event
from app.api.dependencies import authorize_request_resource
from app.db.session import SessionLocal, get_db
from app.jobs.handlers import AI_REASONING
from app.models.domain import AIRunEvent, BackgroundJob, Investigation
from app.schemas.responses import AiRunEventsOut, AiRunsOut

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _run_row(db: Session, investigation_id: str, run_id: str) -> BackgroundJob:
    job = db.get(BackgroundJob, run_id)
    if job is None or job.kind != AI_REASONING or job.investigation_id != investigation_id:
        raise HTTPException(404, "AI run not found")
    return job


def serialize_run(db: Session, job: BackgroundJob) -> dict[str, Any]:
    payload = job.payload or {}
    result = payload.get("result") or {}
    counts: dict[str, int] = {str(status): int(n) for status, n in db.execute(
        select(AIRunEvent.status, func.count()).where(AIRunEvent.run_id == job.id).group_by(AIRunEvent.status)).all()}
    return {
        "run_id": job.id, "status": job.status, "finished": job.status in ("succeeded", "failed", "cancelled"),
        "module": payload.get("module") or "", "question": payload.get("question") or "", "working_theory": payload.get("working_theory"),
        "created_at": job.created_at, "started_at": job.started_at, "finished_at": job.finished_at,
        "candidate_id": result.get("candidate_id"), "review_status": result.get("review_status"),
        "events": sum(counts.values()), "problems": int(counts.get("bad", 0)) + int(counts.get("partial", 0)),
        "message": job.message, "error": job.error,
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


def _read(investigation_id: str, run_id: str, after: int) -> tuple[list[dict], bool]:
    with SessionLocal() as db:
        job = db.get(BackgroundJob, run_id)
        finished = job is None or job.status in ("succeeded", "failed", "cancelled")
        return [serialize_event(e) for e in run_events(db, investigation_id, run_id, after)], finished


@router.get("/investigations/{investigation_id}/ai-runs/{run_id}/events/stream", response_class=StreamingResponse,
            responses={200: {"content": {"text/event-stream": {}}}})
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
