"""Following (ADR-0022, mockup FOLLOW_1): sources a case follows, the queue of what they turned up, and what a person
does with it. The service is app/services/following.py; routes stay thin."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.api.routes_documents import _submit_or_record_failure
from app.core.authorization import require_scope_global_admin, scope_for_request
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.jobs.handlers import EXTRACT_DOCUMENT, FOLLOW_AUDIO, WEB_CAPTURE
from app.jobs.records import create_job
from app.jobs.runner import job_runner
from app.models.following import Monitor, MonitorItem
from app.schemas.api import CaptureAllRequest, MailboxCreate, MonitorCreate, MonitorUpdate, PlatformChecksUpdate
from app.schemas.responses import (
    BackgroundJobOut,
    ErrorOut,
    FollowingOut,
    MonitorOut,
    PageVersionOut,
    PlatformChecksOut,
    PlatformForUrlOut,
    ValidationErrorOut,
)
from app.services import following
from app.services.web_capture import CaptureRefused, request_capture

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _actor(request: Request) -> str | None:
    return scope_for_request(request).actor_id


def _monitor(db: Session, monitor_id: str) -> Monitor:
    row = db.get(Monitor, monitor_id)
    if row is None:
        raise HTTPException(404, "Monitor not found")
    return row


def _item(db: Session, item_id: str) -> MonitorItem:
    row = db.get(MonitorItem, item_id)
    if row is None:
        raise HTTPException(404, "Item not found")
    return row


@router.get("/investigations/{investigation_id}/following", response_model=FollowingOut)
def get_following(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The sources this case follows, the queue (most at risk first), copies of one story counted once, and what
    leaves this computer."""
    return following.overview(db, investigation_id)


@router.post("/investigations/{investigation_id}/monitors", response_model=MonitorOut, responses={
    404: {"model": ErrorOut, "description": "No such investigation"},
    422: {"model": ValidationErrorOut | ErrorOut,
          "description": "The input does not match the route, or the address cannot be followed (the message says why)"},
})
def create_monitor(investigation_id: str, body: MonitorCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Follow something: the address is asked once to see what it is (a feed, sitemap, podcast or page; a page that
    names its feed is followed through the feed), then checked on its schedule. A closed platform becomes a row with
    no monitor. Nothing is kept until a person captures it."""
    try:
        row = following.follow(db, investigation_id, body.target, every_minutes=body.every_minutes, route=body.route,
                               actor=_actor(request))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (following.FollowRefused, CaptureRefused) as exc:
        raise HTTPException(422, str(exc)) from exc
    return following.serialize_monitor(row)


@router.post("/investigations/{investigation_id}/monitors/mailbox", response_model=MonitorOut, responses={
    404: {"model": ErrorOut, "description": "No such investigation"},
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The mailbox or sender cannot be followed (the message says why)"},
})
def create_mailbox_monitor(investigation_id: str, body: MailboxCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Follow one sender's newsletters in a dedicated mailbox, read over IMAP with TLS and never marked read. The
    password is kept in its own file on this computer, not in the case or a backup."""
    from app.services import mailbox

    try:
        row = mailbox.follow(db, investigation_id, host=body.host, user=body.user, password=body.password, sender=body.sender,
                             port=body.port, every_minutes=body.every_minutes, actor=_actor(request))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except mailbox.MailboxRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    return following.serialize_monitor(row)


@router.patch("/monitors/{monitor_id}", response_model=MonitorOut, responses={404: {"model": ErrorOut},
                                                                         409: {"model": ErrorOut}})
def update_monitor(monitor_id: str, body: MonitorUpdate, db: Session = Depends(get_db)) -> Any:
    """Change how often it is checked, its route (Direct or Tor), pause or resume it, or accept the address it moved
    to (a moved source is never followed by itself)."""
    row = _monitor(db, monitor_id)
    if row.kind == "closed":
        raise HTTPException(409, "A closed platform has no monitor to change")
    if body.every_minutes is not None:
        row.every_minutes = body.every_minutes
        row.next_check_at = utcnow_naive()
    if body.route is not None:
        row.route = body.route
        row.etag = row.last_modified = None
    if body.paused is not None:
        row.health = "paused" if body.paused else "unchecked"
        row.next_check_at = None if body.paused else utcnow_naive()
    if body.accept_move:
        if not row.moved_to:
            raise HTTPException(409, "This source has not moved")
        row.url, row.moved_to, row.etag, row.last_modified = row.moved_to, None, None, None
        row.health, row.health_detail, row.next_check_at = "unchecked", None, utcnow_naive()
    db.commit()
    return following.serialize_monitor(row, list(db.query(MonitorItem).filter(MonitorItem.monitor_id == row.id)))


@router.delete("/monitors/{monitor_id}", status_code=204, responses={404: {"model": ErrorOut}})
def delete_monitor(monitor_id: str, db: Session = Depends(get_db)) -> None:
    """Stop following. What was captured from it stays in the case; its queue and versions go."""
    from app.models.following import PageVersion

    row = _monitor(db, monitor_id)
    if row.kind == "mailbox":
        from app.services import mailbox

        mailbox.forget(db, row)
    db.query(MonitorItem).filter(MonitorItem.monitor_id == row.id).delete()
    db.query(PageVersion).filter(PageVersion.monitor_id == row.id).delete()
    db.delete(row)
    db.commit()


@router.post("/monitors/{monitor_id}/check", response_model=MonitorOut, responses={404: {"model": ErrorOut}})
def check_monitor(monitor_id: str, db: Session = Depends(get_db)) -> Any:
    """Check the source now instead of at its next time (the same polite, logged request)."""
    row = following.check(db, _monitor(db, monitor_id))
    return following.serialize_monitor(row, list(db.query(MonitorItem).filter(MonitorItem.monitor_id == row.id)))


@router.get("/monitors/{monitor_id}/versions", response_model=list[PageVersionOut], responses={404: {"model": ErrorOut}})
def get_versions(monitor_id: str, db: Session = Depends(get_db)) -> Any:
    """Every version of a followed page's main text, newest first, with what changed from the one before."""
    _monitor(db, monitor_id)
    return following.versions(db, monitor_id)


async def _capture(db: Session, request: Request, item: MonitorItem, *, reason: str | None = None) -> None:
    kind, url = following.capture_target(db, item)
    if not following.claim(db, item, to="captured"):
        raise following.FollowRefused("This item was already captured or skipped")
    try:
        await _start_capture(db, request, item, kind, url, reason=reason)
    except Exception:
        # The capture did not start: the item goes back in the queue, unless something else decided it meanwhile.
        db.rollback()
        db.execute(update(MonitorItem).where(MonitorItem.id == item.id, MonitorItem.state == "captured",
                                             MonitorItem.capture_id.is_(None)).values(state="waiting"))
        db.commit()
        raise


async def _start_capture(db: Session, request: Request, item: MonitorItem, kind: str, url: str, *, reason: str | None) -> None:
    actor = _actor(request)
    if kind == "email":
        from app.services import mailbox

        try:
            document_id = mailbox.capture(db, item, actor)
        except mailbox.MailboxRefused as exc:
            raise following.FollowRefused(str(exc)) from exc
        following.mark_captured(db, item, actor, reason=reason)
        job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=item.investigation_id, subject_type="document",
                         subject_id=document_id, runner=job_runner(request).mode, message="Waiting to read the newsletter")
    elif kind == "audio":
        job = create_job(db, kind=FOLLOW_AUDIO, investigation_id=item.investigation_id, subject_type="monitor_item",
                         subject_id=item.id, runner=job_runner(request).mode, message="Waiting to fetch the episode",
                         payload={"actor": actor})
        following.mark_captured(db, item, actor, reason=reason)
    else:
        capture = request_capture(db, item.investigation_id, url, collector=actor)
        job = create_job(db, kind=WEB_CAPTURE, investigation_id=item.investigation_id, subject_type="capture",
                         subject_id=capture.id, runner=job_runner(request).mode, message="Waiting to visit the page")
        capture.job_id = job.id
        db.commit()
        following.mark_captured(db, item, actor, capture_id=capture.id, reason=reason)
    await _submit_or_record_failure(request, job, db)


@router.post("/monitor-items/{monitor_item_id}/capture", response_model=FollowingOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "The item is not waiting"},
    422: {"model": ErrorOut, "description": "The address cannot be captured"},
})
async def capture_item(monitor_item_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Capture one item: a page through the ordinary web capture (ADR-0018), a podcast episode by fetching its audio
    file and transcribing it. Answers with the whole screen."""
    item = _item(db, monitor_item_id)
    if item.state != "waiting":
        raise HTTPException(409, "Only an item waiting in the queue can be captured")
    try:
        await _capture(db, request, item)
    except (following.FollowRefused, CaptureRefused) as exc:
        raise HTTPException(422, str(exc)) from exc
    return following.overview(db, item.investigation_id)


@router.post("/investigations/{investigation_id}/following/capture-all", response_model=FollowingOut, responses={
    422: {"model": ValidationErrorOut | ErrorOut, "description": "No reason, or one too short"},
})
async def capture_all(investigation_id: str, body: CaptureAllRequest, request: Request, db: Session = Depends(get_db)) -> Any:
    """Capture everything waiting, at once. Needs a reason, kept on each item it captures; an item that cannot be
    captured stays waiting."""
    try:
        reason = following.bulk_ready(body.reason)
    except following.FollowRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    waiting = db.query(MonitorItem).filter(MonitorItem.investigation_id == investigation_id,
                                           MonitorItem.state == "waiting").all()
    for item in waiting:
        try:
            await _capture(db, request, item, reason=f"Bulk · {reason}")
        except (following.FollowRefused, CaptureRefused):
            db.rollback()
    return following.overview(db, investigation_id)


@router.post("/monitor-items/{monitor_item_id}/skip", response_model=FollowingOut, responses={404: {"model": ErrorOut},
                                                                                   409: {"model": ErrorOut}})
def skip_item(monitor_item_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    item = _item(db, monitor_item_id)
    try:
        following.skip(db, item, _actor(request))
    except following.FollowRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return following.overview(db, item.investigation_id)


@router.post("/monitor-items/{monitor_item_id}/undo", response_model=FollowingOut, responses={404: {"model": ErrorOut},
                                                                                   409: {"model": ErrorOut}})
def undo_item(monitor_item_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Put a skipped item back in the queue."""
    item = _item(db, monitor_item_id)
    try:
        following.undo(db, item, _actor(request))
    except following.FollowRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return following.overview(db, item.investigation_id)


@router.post("/monitor-items/{monitor_item_id}/record-removal", response_model=FollowingOut,
             responses={404: {"model": ErrorOut}, 409: {"model": ErrorOut}})
def record_removal(monitor_item_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Record that something captured before is gone from its address (it answers 404 or 410), and when that was found."""
    item = _item(db, monitor_item_id)
    try:
        following.record_removal(db, item, _actor(request))
    except following.FollowRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return following.overview(db, item.investigation_id)


# --- Does it work today? (mockup WORKS_1, app/services/platform_checks.py) --------------------------------------------

@router.get("/platform-checks", response_model=PlatformChecksOut)
def get_platform_checks(db: Session = Depends(get_db)) -> Any:
    """Each platform the app saves from, tried on its public test item: today, the last 14 days, the settings."""
    from app.services import platform_checks

    return platform_checks.overview(db)


@router.patch("/platform-checks", response_model=PlatformChecksOut, responses={
    403: {"model": ErrorOut, "description": "Only the server's administrator changes it"}, 422: {"model": ValidationErrorOut | ErrorOut}})
def change_platform_checks(body: PlatformChecksUpdate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Turn the daily check on or off, the warning before a capture, or change a test item. A setting of the whole
    server: only its administrator changes it."""
    from app.services import platform_checks

    require_scope_global_admin(scope_for_request(request))

    try:
        platform_checks.change(db, daily=body.daily, warn=body.warn, items=body.items)
    except (ValueError, CaptureRefused) as exc:
        raise HTTPException(422, str(exc)) from exc
    return platform_checks.overview(db)


@router.post("/platform-checks/run", response_model=BackgroundJobOut, status_code=202,
             responses={403: {"model": ErrorOut, "description": "Only the server's administrator runs it"},
                        422: {"model": ValidationErrorOut | ErrorOut, "description": "No such platform"}})
async def run_platform_checks(request: Request, platform: str | None = Query(None, max_length=32), db: Session = Depends(get_db)) -> Any:
    """Try every platform now (or one), as a background job; each request goes in the outbound log."""
    from app.jobs.handlers import CHECK_PLATFORMS
    from app.jobs.records import serialize_job
    from app.models.domain import BackgroundJob
    from app.services.platform_checks import BY_KEY

    require_scope_global_admin(scope_for_request(request))

    if platform is not None and platform not in BY_KEY:
        raise HTTPException(422, f"No platform called {platform}")
    job = create_job(db, kind=CHECK_PLATFORMS, subject_type="platforms", subject_id=platform or "all", runner=job_runner(request).mode,
                     payload={"platform": platform}, message="Waiting to try the platforms")
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    return serialize_job(db.get(BackgroundJob, job.id) or job)


@router.get("/platform-checks/for", response_model=PlatformForUrlOut | None)
def platform_for_url(url: str = Query(..., max_length=4000), db: Session = Depends(get_db)) -> Any:
    """The platform a pasted link is on, and how it was at its last check: none when it is not one the app tries, or
    the warning is off."""
    from app.services import platform_checks

    return platform_checks.for_url(db, url)
