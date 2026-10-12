"""Background job endpoints (ADR-0004): follow, retry and cancel slow work."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import AuthorizationScope, require_scope_investigation, scope_for_request
from app.db.session import get_db
from app.jobs.records import cancel_queued, list_jobs, request_stop, requeue_for_retry, serialize_job
from app.jobs.runner import job_runner
from app.models.jobs import JOB_STATUSES, BackgroundJob
from app.schemas.responses import BackgroundJobOut, ErrorOut, ValidationErrorOut

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _visible_job(db: Session, scope: AuthorizationScope, job_id: str) -> BackgroundJob:
    job = db.get(BackgroundJob, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    if not scope.unrestricted:
        if job.investigation_id is None:
            raise HTTPException(404, "Job not found")
        require_scope_investigation(scope, job.investigation_id)
    return job


@router.get("/jobs", response_model=list[BackgroundJobOut], responses={
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The input does not match the route, or the status is not a job status"},
})
def list_jobs_endpoint(
    request: Request, investigation_id: str | None = None, status: str | None = None,
    subject_id: str | None = None, limit: int = 50, db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if status is not None and status not in JOB_STATUSES:
        raise HTTPException(422, f"status must be one of {', '.join(JOB_STATUSES)}")
    scope = scope_for_request(request)
    if investigation_id is not None:
        ids: list[str] | None = [investigation_id]  # already authorized by the router dependency
    elif scope.unrestricted:
        ids = None
    else:
        ids = sorted(scope.investigation_ids or ())
    return [serialize_job(row) for row in list_jobs(db, investigation_ids=ids, status=status, subject_id=subject_id, limit=limit)]


@router.get("/jobs/{job_id}", response_model=BackgroundJobOut)
def get_job_endpoint(job_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    return serialize_job(_visible_job(db, scope_for_request(request), job_id))


@router.post("/jobs/{job_id}/retry", response_model=BackgroundJobOut)
async def retry_job_endpoint(job_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    job = _visible_job(db, scope_for_request(request), job_id)
    try:
        job = requeue_for_retry(db, job)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    await job_runner(request).submit(job, db)
    db.expire_all()
    return serialize_job(_visible_job(db, scope_for_request(request), job_id))


@router.post("/jobs/{job_id}/cancel", response_model=BackgroundJobOut)
async def cancel_job_endpoint(job_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    job = _visible_job(db, scope_for_request(request), job_id)
    try:
        if job.status == "running":
            # A document being read stops at its next page (app/jobs/records.py request_stop).
            return serialize_job(request_stop(db, job))
        job = cancel_queued(db, job)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    await job_runner(request).cancel(job)
    return serialize_job(job)
