"""Bring in › Links & captures (app/services/web_capture.py, ADR-0016, mockup INTAKE_3): a pasted link becomes a
source. The page is fetched from this computer and kept with when, how and a fingerprint; the page is then read like
any uploaded file."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import authorize_request_resource
from app.api.routes_documents import _submit_or_record_failure
from app.core.config import settings
from app.db.session import get_db
from app.jobs.handlers import EXTRACT_DOCUMENT
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Document, Investigation, WebCapture
from app.schemas.api import CaptureCreate
from app.schemas.responses import CaptureOut, CaptureResultOut, CapturesOut
from app.services.capture_net import AddressRefused
from app.services.security import resolve_storage_root
from app.services.web_capture import capture_files_by_name, capture_url, recheck

logger = logging.getLogger("journalism.captures")
router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _case(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


def _capture(db: Session, investigation_id: str, capture_id: str) -> WebCapture:
    row = db.get(WebCapture, capture_id)
    if row is None or row.investigation_id != investigation_id:
        raise HTTPException(404, "Capture not found")
    return row


def serialize_capture(db: Session, row: WebCapture) -> dict[str, Any]:
    checks = list(row.checks or [])
    return {
        "id": row.id, "investigation_id": row.investigation_id, "source_id": row.source_id, "document_id": row.document_id,
        "supersedes_id": row.supersedes_id, "url": row.url, "final_url": row.final_url, "outcome": row.outcome, "reason": row.reason,
        "title": row.title, "started_at": row.started_at, "ended_at": row.ended_at, "collector": row.collector or {},
        "request": row.request, "response": row.response, "steps": row.steps or [],
        "files": [{k: f[k] for k in ("name", "role", "note", "size", "sha256")} for f in row.files or []],
        "page_sha256": row.page_sha256, "text_sha256": row.text_sha256, "displayed": row.displayed, "checks": checks,
        "change": checks[-1]["state"] if checks else None,
        "has_screenshot": any(f.get("role") == "screenshot" for f in row.files or []), "created_at": row.created_at,
    }


async def _result(request: Request, response: Response, db: Session, made: dict[str, Any]) -> dict[str, Any]:
    """The answer to a capture: the record, and the job that reads the page when a new document was saved."""
    row: WebCapture = made["capture"]
    job_out = None
    if made["state"] in ("new", "changed") and made["document_id"]:
        doc = db.get(Document, made["document_id"])
        if doc is not None and doc.extraction_status in ("queued", "pending"):
            runner = job_runner(request)
            job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=doc.investigation_id, subject_type="document",
                             subject_id=doc.id, runner=runner.mode)
            await _submit_or_record_failure(request, job, db)
            db.expire_all()
            job_row = db.get(BackgroundJob, job.id)
            job_out = serialize_job(job_row) if job_row is not None else None
            row = db.get(WebCapture, row.id) or row
    if made["document_id"] and made["state"] in ("new", "changed") and (job_out is None or not job_out["finished"]):
        response.status_code = 202
    return {"capture": serialize_capture(db, row), "state": made["state"], "already_in_case": made["already_in_case"],
            "document_id": made["document_id"], "job": job_out}


@router.get("/investigations/{investigation_id}/captures", response_model=CapturesOut)
def list_captures(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Every capture of this case, newest first."""
    _case(db, investigation_id)
    rows = db.scalars(select(WebCapture).where(WebCapture.investigation_id == investigation_id).order_by(WebCapture.started_at.desc())).all()
    return {"captures": [serialize_capture(db, r) for r in rows]}


@router.post("/investigations/{investigation_id}/captures", response_model=CaptureResultOut, responses={
    202: {"model": CaptureResultOut, "description": "Saved; the page is read by a background job (follow `job`)"},
    422: {"description": "The address is not one a capture fetches (not http or https, a login in the address, a private network)"},
})
async def create_capture(investigation_id: str, body: CaptureCreate, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """Fetch the page from this computer and keep it. A link that gave nothing back, or a login wall, is a capture too
    (outcome link_only / not_seen): it is recorded, not hidden."""
    _case(db, investigation_id)
    try:
        made = await run_in_threadpool(capture_url, db, investigation_id, body.url, storage_dir=resolve_storage_root(settings.document_storage_dir))
    except AddressRefused as exc:
        raise HTTPException(422, str(exc))
    return await _result(request, response, db, made)


@router.get("/investigations/{investigation_id}/captures/{capture_id}", response_model=CaptureOut)
def get_capture(investigation_id: str, capture_id: str, db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    return serialize_capture(db, _capture(db, investigation_id, capture_id))


@router.post("/investigations/{investigation_id}/captures/{capture_id}/recheck", response_model=CaptureResultOut, responses={
    202: {"model": CaptureResultOut, "description": "Changed and saved; the new copy is read by a background job"},
    409: {"description": "Only a saved capture can be checked again"},
})
async def recheck_capture(investigation_id: str, capture_id: str, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """Capture the address again. Same text: a line in the checks. Changed: a new capture that names this one. Removed:
    a link-only capture that names it. This one is never altered."""
    _case(db, investigation_id)
    row = _capture(db, investigation_id, capture_id)
    try:
        made = await run_in_threadpool(recheck, db, row, storage_dir=resolve_storage_root(settings.document_storage_dir))
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    except AddressRefused as exc:
        raise HTTPException(422, str(exc))
    return await _result(request, response, db, made)


_BINARY = {"schema": {"type": "string", "format": "binary"}}


@router.get("/investigations/{investigation_id}/captures/{capture_id}/files/{name}", response_class=FileResponse, responses={
    200: {"description": "One kept file of the capture, as stored", "content": {
        "image/png": _BINARY, "text/html; charset=utf-8": _BINARY, "text/plain; charset=utf-8": _BINARY, "application/octet-stream": _BINARY}},
})
def get_capture_file(investigation_id: str, capture_id: str, name: str, db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    row = _capture(db, investigation_id, capture_id)
    entry = capture_files_by_name(row).get(name)
    if entry is None:
        raise HTTPException(404, "File not found")
    media = {"png": "image/png", "html": "text/html; charset=utf-8", "txt": "text/plain; charset=utf-8"}.get(name.rsplit(".", 1)[-1], "application/octet-stream")
    # A saved page is shown as text, never run: it is served as a download, with scripts and framing blocked.
    headers = {"Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff"}
    if media.startswith("text/html"):
        headers["Content-Disposition"] = f'attachment; filename="{name}"'
    return FileResponse(entry["path"], media_type=media, headers=headers)
