"""Reporting-task endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E
group 2). Validation, workflow-event recording, and persistence live in
app/services/leads.py alongside the rest of the lead/task domain
(create_reporting_task, update_reporting_task, serialize_task) -- reporting
tasks are already tightly coupled to leads there (lead_id ownership check,
shared TASK_STATUSES/PRIORITIES), so a separate reporting_tasks.py service
module would just import back from leads.py.

The GET /investigations/{investigation_id}/reporting-tasks list endpoint is
not here: its URL prefix is /investigations, so it belongs with group 8
(investigations) per REMEDIATION_PROMPT.md Stage E's prefix-based grouping.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, ReportingTask
from app.schemas.api import ReportingTaskCreate, ReportingTaskUpdate
from app.services.leads import create_reporting_task, serialize_task, update_reporting_task

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/reporting-tasks")
def create_reporting_task_endpoint(body: ReportingTaskCreate, db: Session = Depends(get_db)):
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return serialize_task(db, create_reporting_task(db, body))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.patch("/reporting-tasks/{task_id}")
def update_reporting_task_endpoint(task_id: str, body: ReportingTaskUpdate, db: Session = Depends(get_db)):
    row = db.get(ReportingTask, task_id)
    if row is None:
        raise HTTPException(404, "Reporting task not found")
    try:
        return serialize_task(db, update_reporting_task(db, row, body))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
