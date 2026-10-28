"""Web capture (ADR-0018): a pasted link becomes a source. Capturing is a background job; the capture's row says what
was kept, and each kept file can be downloaded as it was hashed."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.api.routes_documents import _submit_or_record_failure
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.jobs.handlers import WEB_CAPTURE
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Capture
from app.schemas.api import CaptureCreate
from app.schemas.responses import CaptureOut, ErrorOut, ValidationErrorOut
from app.services.web_capture import CaptureRefused, capture_file, list_captures, request_capture, serialize_capture

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

MEDIA_TYPES = {".html": "text/html; charset=utf-8", ".png": "image/png", ".har": "application/json",
               ".gz": "application/gzip"}


def _out(db: Session, row: Capture) -> dict[str, Any]:
    out = serialize_capture(row)
    job = db.get(BackgroundJob, row.job_id) if row.job_id else None
    out["job"] = serialize_job(job) if job is not None else None
    # A capture whose job ended without finishing it (stopped, or the server went down mid-visit) says so.
    if row.status != "finished" and job is not None and job.status in ("failed", "cancelled"):
        out["status"] = "failed"
        out["reason"] = job.error or job.message or "The capture stopped before it finished"
    return out


@router.post("/investigations/{investigation_id}/captures", response_model=CaptureOut, status_code=202, responses={
    404: {"model": ErrorOut, "description": "No such investigation"},
    422: {"model": ValidationErrorOut | ErrorOut,
          "description": "The input does not match the route, or the address is not one this computer will visit (not http or https, or a private address)"},
})
async def create_capture(investigation_id: str, body: CaptureCreate, request: Request, response: Response,
                         db: Session = Depends(get_db)) -> Any:
    """Capture the page at `url`: one visit, no cookies, every file kept with its SHA-256, and the page's text as a
    case document. Answers at once with the queued capture; follow `job` (GET /api/jobs/{id}) or the capture itself."""
    try:
        row = request_capture(db, investigation_id, body.url, collector=scope_for_request(request).actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except CaptureRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    job = create_job(db, kind=WEB_CAPTURE, investigation_id=investigation_id, subject_type="capture", subject_id=row.id,
                     runner=job_runner(request).mode, message="Waiting to visit the page")
    row.job_id = job.id
    db.commit()
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    row = db.get(Capture, row.id) or row
    out = _out(db, row)
    if out["job"] is not None and out["job"]["finished"]:
        response.status_code = 200
    return out


@router.get("/investigations/{investigation_id}/captures", response_model=list[CaptureOut])
def get_captures(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The case's captures, newest first."""
    return [_out(db, row) for row in list_captures(db, investigation_id)]


@router.get("/captures/{capture_id}", response_model=CaptureOut, responses={404: {"model": ErrorOut}})
def get_capture(capture_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Capture, capture_id)
    if row is None:
        raise HTTPException(404, "Capture not found")
    return _out(db, row)


@router.get("/captures/{capture_id}/files/{name}", response_class=FileResponse, responses={
    200: {"content": {"text/html": {}, "image/png": {}, "application/json": {}, "application/gzip": {}},
          "description": "The file exactly as it was kept and hashed (page source, picture, HAR or WARC)"},
    404: {"model": ErrorOut, "description": "No such capture or file, or the file is gone from this computer"},
})
def get_capture_file(capture_id: str, name: str, db: Session = Depends(get_db)) -> Any:
    """One kept file, downloaded as it was hashed (its SHA-256 is on the capture), never shown inline: a kept page is
    the site's own code and does not run inside the app."""
    row = db.get(Capture, capture_id)
    if row is None:
        raise HTTPException(404, "Capture not found")
    try:
        path, entry = capture_file(row, name)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    suffix = path.suffix.lower()
    return FileResponse(path, media_type=MEDIA_TYPES.get(suffix, "application/octet-stream"), filename=entry["name"],
                        content_disposition_type="inline" if suffix == ".png" else "attachment",
                        headers={"X-Content-SHA256": entry["sha256"], "X-Content-Type-Options": "nosniff"})
