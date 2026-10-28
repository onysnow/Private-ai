"""Web capture (ADR-0018): a pasted link becomes a source. Capturing is a background job; the capture's row says what
was kept, and each kept file can be downloaded as it was hashed."""

from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.api.routes_documents import _submit_or_record_failure
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.jobs.handlers import CAPTURE_MEDIA, WEB_CAPTURE
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Capture
from app.schemas.api import CaptureCreate, CaptureFollowIn, CaptureUpdate
from app.schemas.responses import CaptureOut, CaptureQuoteOut, ErrorOut, ValidationErrorOut
from app.services import capture_follow, capture_quotes
from app.services.web_capture import CaptureRefused, capture_file, list_captures, request_capture, serialize_capture

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

MEDIA_TYPES = {".html": "text/html; charset=utf-8", ".png": "image/png", ".har": "application/json",
               ".gz": "application/gzip"}


def _out(db: Session, row: Capture) -> dict[str, Any]:
    out = serialize_capture(row)
    out["reason_kind"] = row.reason_kind or capture_follow.guess_reason_kind(row)
    out["reason_kind_by"] = row.reason_kind_by
    out["follow"] = capture_follow.follow_state(db, row)
    job = db.get(BackgroundJob, row.job_id) if row.job_id else None
    out["job"] = serialize_job(job) if job is not None else None
    # A capture whose job ended without finishing it (stopped, or the server went down mid-visit) says so.
    if row.status != "finished" and job is not None and job.status in ("failed", "cancelled"):
        out["status"] = "failed"
        out["reason"] = job.error or job.message or "The capture stopped before it finished"
    # Likewise a collection of the page's media whose job ended without finishing it.
    media_job = db.get(BackgroundJob, out["media"].get("job_id")) if out["media"].get("job_id") else None
    if out["media"].get("status") == "collecting" and media_job is not None and media_job.status in ("failed", "cancelled"):
        out["media"] = {**out["media"], "status": "failed", "reason": media_job.error or media_job.message or "The collection stopped"}
    return out


@router.post("/investigations/{investigation_id}/captures", response_model=CaptureOut, status_code=202, responses={
    200: {"model": CaptureOut, "description": "The capture finished before the reply (developer mode runs jobs inline)"},
    404: {"model": ErrorOut, "description": "No such investigation"},
    422: {"model": ValidationErrorOut | ErrorOut,
          "description": "The input does not match the route, or the address is not one this computer will visit (not http or https, or a private address)"},
})
async def create_capture(investigation_id: str, body: CaptureCreate, request: Request, response: Response,
                         db: Session = Depends(get_db)) -> Any:
    """Capture the page at `url`: one visit, no cookies, every file kept with its SHA-256, and the page's text as a
    case document. Answers at once with the queued capture; follow `job` (GET /api/jobs/{id}) or the capture itself."""
    return await _start(db, request, response, investigation_id, body.url)


async def _start(db: Session, request: Request, response: Response, investigation_id: str, url: str,
                 after: Callable[[Capture], None] | None = None) -> dict[str, Any]:
    try:
        row = request_capture(db, investigation_id, url, collector=scope_for_request(request).actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except CaptureRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    job = create_job(db, kind=WEB_CAPTURE, investigation_id=investigation_id, subject_type="capture", subject_id=row.id,
                     runner=job_runner(request).mode, message="Waiting to visit the page")
    row.job_id = job.id
    db.commit()
    if after is not None:
        after(row)
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    row = db.get(Capture, row.id) or row
    out = _out(db, row)
    if out["job"] is not None and out["job"]["finished"]:
        response.status_code = 200
    return out


def _capture_or_404(db: Session, capture_id: str) -> Capture:
    row = db.get(Capture, capture_id)
    if row is None:
        raise HTTPException(404, "Capture not found")
    return row


@router.put("/captures/{capture_id}/follow", response_model=CaptureOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "The page is still being captured"}})
def follow_capture(capture_id: str, body: CaptureFollowIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Check this capture's page again: never, daily or weekly (a Following page monitor tied to the capture; version 1
    is the page as captured). For a link only, weekly is "Ask again in 7 days"."""
    row = _capture_or_404(db, capture_id)
    try:
        capture_follow.set_every(db, row, body.every, scope_for_request(request).actor_id)
    except capture_follow.FollowCaptureRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return _out(db, row)


@router.post("/captures/{capture_id}/recheck", response_model=CaptureOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "Still being captured, or the address moved"}})
def recheck_capture(capture_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """One visit now: the live page's main text compared with the last version. Nothing is kept as evidence; a
    different text is kept as a version, not captured."""
    row = _capture_or_404(db, capture_id)
    try:
        capture_follow.recheck(db, row, scope_for_request(request).actor_id)
    except capture_follow.FollowCaptureRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    db.expire_all()
    return _out(db, db.get(Capture, capture_id) or row)


@router.post("/captures/{capture_id}/capture-latest", response_model=CaptureOut, status_code=202, responses={
    200: {"model": CaptureOut, "description": "The new capture finished before the reply (developer mode)"},
    404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut}})
async def capture_latest(capture_id: str, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """Capture the page as it is now, as a new capture: both stay in the case. Answers with the new capture."""
    row = _capture_or_404(db, capture_id)
    actor = scope_for_request(request).actor_id
    return await _start(db, request, response, row.investigation_id, row.final_url or row.url,
                        after=lambda new: capture_follow.link_new_capture(db, row, new, actor))


@router.post("/captures/{capture_id}/mark-changed", response_model=CaptureOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "The page has not changed since its capture"}})
def mark_capture_changed(capture_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Mark the capture's source "changed since capture", with who said so and which version they saw."""
    row = _capture_or_404(db, capture_id)
    try:
        capture_follow.mark_source_changed(db, row, scope_for_request(request).actor_id)
    except capture_follow.FollowCaptureRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return _out(db, row)


@router.patch("/captures/{capture_id}", response_model=CaptureOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "Not a link-only capture"}})
def update_capture(capture_id: str, body: CaptureUpdate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Set a link only's reason (dead link, blocked, timed out, tool error) when the person knows better."""
    row = _capture_or_404(db, capture_id)
    try:
        capture_follow.set_reason_kind(db, row, body.reason_kind, scope_for_request(request).actor_id)
    except capture_follow.FollowCaptureRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return _out(db, row)


@router.post("/captures/{capture_id}/media", response_model=CaptureOut, status_code=202, responses={
    200: {"model": CaptureOut, "description": "Already collected, or the collection finished before the reply (developer mode)"},
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "The capture is not finished, or its media is already being collected"},
})
async def collect_capture_media(capture_id: str, request: Request, response: Response, db: Session = Depends(get_db)) -> Any:
    """Collect the one video or audio item on a captured page, logged out (app/services/media_links.py), keep it
    with the capture and transcribe it. Answers at once; the capture's `media` follows the job."""
    row = db.get(Capture, capture_id)
    if row is None:
        raise HTTPException(404, "Capture not found")
    if row.status != "finished":
        raise HTTPException(409, "The page is still being captured")
    if (row.media or {}).get("status") == "collecting":
        raise HTTPException(409, "The media on this page is already being collected")
    if (row.media or {}).get("status") == "collected":
        response.status_code = 200  # one item per page: what was collected stays as it was hashed
        return _out(db, row)
    job = create_job(db, kind=CAPTURE_MEDIA, investigation_id=row.investigation_id, subject_type="capture", subject_id=row.id,
                     runner=job_runner(request).mode, message="Waiting to look for the video or audio")
    row.media = {**(row.media or {}), "status": "collecting", "job_id": job.id}
    db.commit()
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    row = db.get(Capture, capture_id) or row
    done = db.get(BackgroundJob, job.id)
    if done is not None and done.status in ("failed", "cancelled") and (row.media or {}).get("status") == "collecting":
        row.media = {**row.media, "status": "failed", "reason": done.error or done.message or "The collection stopped"}
        db.commit()
    if done is not None and done.finished_at is not None:
        response.status_code = 200
    return _out(db, row)


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


@router.get("/captures/{capture_id}/quotes", response_model=list[CaptureQuoteOut], responses={404: {"model": ErrorOut}})
def get_capture_quotes(capture_id: str, db: Session = Depends(get_db)) -> Any:
    """The quotes pinned from this captured page, each found again in the saved copy and (once the page
    was checked again) on the live page."""
    return capture_quotes.quotes(db, _capture_or_404(db, capture_id))


@router.post("/captures/{capture_id}/quotes/refind", response_model=list[CaptureQuoteOut], responses={404: {"model": ErrorOut}})
def refind_capture_quotes(capture_id: str, db: Session = Depends(get_db)) -> Any:
    """Read the saved copy's quotes again: each is found again in the page's passages and its place kept."""
    row = _capture_or_404(db, capture_id)
    capture_quotes.refind(db, row)
    return capture_quotes.quotes(db, row)
