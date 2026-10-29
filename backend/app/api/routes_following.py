"""Following (ADR-0021): addresses the app watches for a case, what they found, and the at-risk queue a person works
through: capture an item, or skip it. The app never captures by itself."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.api.routes_captures import capture_out, start_capture
from app.core.authorization import scope_for_request
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.models.domain import Monitor, MonitorItem, MonitorVersion
from app.schemas.api import MonitorCaptureAll, MonitorCreate, MonitorItemSkip, MonitorUpdate
from app.schemas.responses import (CaptureAllOut, ErrorOut, FollowingOut, MonitorItemCaptureOut, MonitorItemOut, MonitorOut,
                                   MonitorVersionOut, ValidationErrorOut)
from app.services import following
from app.services.web_capture import CaptureRefused

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

MAX_CAPTURE_ALL = 50


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


@router.get("/investigations/{investigation_id}/following", response_model=FollowingOut, responses={404: {"model": ErrorOut}})
def get_following(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """What the case follows, and the items waiting for a person, the most at risk first."""
    from app.models.domain import Investigation

    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return following.overview(db, investigation_id)


@router.post("/investigations/{investigation_id}/monitors", response_model=MonitorOut, status_code=201, responses={
    404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut, "description": "The address is private, not http or https, or already followed"},
})
def create_monitor(investigation_id: str, body: MonitorCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Follow an address. With `poll` it is looked at once before the reply, so its health is known."""
    scope = scope_for_request(request)
    try:
        row = following.create_monitor(db, investigation_id, body.url, kind=body.kind, interval_minutes=body.interval_minutes,
                                       route=body.route, title=body.title, created_by=scope.actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except following.FollowRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    if body.poll:
        following.poll_monitor(db, row, actor=scope.actor_id)
    return following.serialize_monitor(db, row)


@router.patch("/monitors/{monitor_id}", response_model=MonitorOut, responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut, "description": "Not a setting a monitor can have, or an address this computer will not visit"}})
def update_monitor(monitor_id: str, body: MonitorUpdate, db: Session = Depends(get_db)) -> Any:
    """Change how often, the route, the name, pause or resume it, or accept the address it moved to."""
    row = _monitor(db, monitor_id)
    try:
        following.update_monitor(db, row, body.model_dump(exclude_unset=True))
    except following.FollowRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    return following.serialize_monitor(db, row)


@router.delete("/monitors/{monitor_id}", status_code=204, responses={404: {"model": ErrorOut}})
def delete_monitor(monitor_id: str, db: Session = Depends(get_db)) -> Response:
    """Stop following. What it found goes with it; pages already captured from it stay in the case."""
    following.delete_monitor(db, _monitor(db, monitor_id))
    return Response(status_code=204)


@router.post("/monitors/{monitor_id}/poll", response_model=MonitorOut, responses={404: {"model": ErrorOut}})
def poll_monitor(monitor_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Look now, outside the schedule (one request, logged like any other)."""
    row = _monitor(db, monitor_id)
    following.poll_monitor(db, row, actor=scope_for_request(request).actor_id)
    return following.serialize_monitor(db, row)


@router.get("/monitors/{monitor_id}/versions", response_model=list[MonitorVersionOut], responses={404: {"model": ErrorOut}})
def get_versions(monitor_id: str, db: Session = Depends(get_db)) -> Any:
    """A watched page's versions, newest first, each with the lines that changed from the one before."""
    _monitor(db, monitor_id)
    rows = db.scalars(select(MonitorVersion).where(MonitorVersion.monitor_id == monitor_id).order_by(MonitorVersion.number.desc())).all()
    return [following.serialize_version(db, r, with_changes=True) for r in rows]


@router.get("/monitors/{monitor_id}/items", response_model=list[MonitorItemOut], responses={404: {"model": ErrorOut}})
def get_monitor_items(monitor_id: str, state: str | None = None, db: Session = Depends(get_db)) -> Any:
    """Everything this monitor found, newest first; `state` narrows to new, captured or skipped."""
    monitor = _monitor(db, monitor_id)
    query = select(MonitorItem).where(MonitorItem.monitor_id == monitor_id).order_by(MonitorItem.first_seen_at.desc())
    if state:
        query = query.where(MonitorItem.state == state)
    return [following.serialize_item(r, monitor) for r in db.scalars(query.limit(500)).all()]


class _NotCaptured(Exception):
    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status, self.reason = status, reason


def _claim(db: Session, item_id: str, state: str) -> bool:
    """Take the item out of the queue in one statement, so two requests cannot both act on it (a double click, a
    Capture all overlapping a Skip): only the one whose update finds it still new goes ahead."""
    done = db.execute(update(MonitorItem).where(MonitorItem.id == item_id, MonitorItem.state == "new").values(state=state))
    db.commit()
    return getattr(done, "rowcount", 0) == 1


async def _capture_item(db: Session, request: Request, item: MonitorItem, reason: str | None) -> dict[str, Any]:
    monitor = db.get(Monitor, item.monitor_id)
    blocked = following.capture_blocker(db, item, monitor)
    if blocked:
        raise _NotCaptured(409, blocked)
    if not _claim(db, item.id, "captured"):
        raise _NotCaptured(409, "This item was already captured or skipped")
    try:
        capture = await start_capture(db, request, item.investigation_id, item.url)
    except Exception:
        db.rollback()
        db.execute(update(MonitorItem).where(MonitorItem.id == item.id, MonitorItem.capture_id.is_(None)).values(state="new"))
        db.commit()
        raise
    item = db.get(MonitorItem, item.id) or item
    item.capture_id = capture.id
    item.decided_by, item.decided_at, item.reason = scope_for_request(request).actor_id, utcnow_naive(), reason
    number = (item.displayed or {}).get("version")
    if number:  # the page's latest version (capture_blocker refused an older one); kept once the capture saves it
        version = db.scalars(select(MonitorVersion).where(MonitorVersion.monitor_id == item.monitor_id, MonitorVersion.number == number)).first()
        if version is not None:
            version.capture_id = capture.id
    db.commit()
    return {"item": following.serialize_item(item, monitor), "capture": capture_out(db, capture)}


@router.post("/monitor-items/{monitor_item_id}/capture", response_model=MonitorItemCaptureOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "Already captured or skipped, from a source followed through Tor, or a page version that is gone"},
    422: {"model": ValidationErrorOut | ErrorOut, "description": "An address this computer will not visit"}})
async def capture_item(monitor_item_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """A person captures what a monitor found: the same capture as pasting the link (ADR-0018)."""
    item = _item(db, monitor_item_id)
    try:
        return await _capture_item(db, request, item, None)
    except _NotCaptured as exc:
        raise HTTPException(exc.status, exc.reason) from exc
    except CaptureRefused as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/monitor-items/{monitor_item_id}/skip", response_model=MonitorItemOut, responses={404: {"model": ErrorOut}, 409: {"model": ErrorOut}})
def skip_item(monitor_item_id: str, body: MonitorItemSkip, request: Request, db: Session = Depends(get_db)) -> Any:
    """Leave it uncaptured. It stays in the monitor's history, out of the queue."""
    item = _item(db, monitor_item_id)
    if not _claim(db, item.id, "skipped"):
        raise HTTPException(409, "This item was already captured or skipped")
    db.refresh(item)
    item.reason = (body.reason or "").strip() or None
    item.decided_by, item.decided_at = scope_for_request(request).actor_id, utcnow_naive()
    db.commit()
    return following.serialize_item(item, db.get(Monitor, item.monitor_id))


@router.post("/monitor-items/{monitor_item_id}/record", response_model=MonitorItemOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "Not a removed page, or already recorded or skipped"}})
def record_removal(monitor_item_id: str, body: MonitorItemSkip, request: Request, db: Session = Depends(get_db)) -> Any:
    """Record that a captured page was removed from its site: the capture is the copy that remains. The record is this
    item, with when it was found gone and what the address answered."""
    item = _item(db, monitor_item_id)
    if "gone" not in (item.flags or []):
        raise HTTPException(409, "Only a page found removed can be recorded as removed")
    if not _claim(db, item.id, "recorded"):
        raise HTTPException(409, "This item was already recorded or skipped")
    db.refresh(item)
    item.reason = (body.reason or "").strip() or None
    item.decided_by, item.decided_at = scope_for_request(request).actor_id, utcnow_naive()
    db.commit()
    return following.serialize_item(item, db.get(Monitor, item.monitor_id))


@router.post("/investigations/{investigation_id}/following/capture-all", response_model=CaptureAllOut, responses={404: {"model": ErrorOut}})
async def capture_all(investigation_id: str, body: MonitorCaptureAll, request: Request, db: Session = Depends(get_db)) -> Any:
    """Capture several waiting items at once, with a reason that goes on each (EGS rule 8), at most 50 a time, one
    after another. An item whose address cannot be visited stays in the queue."""
    query = select(MonitorItem).where(MonitorItem.investigation_id == investigation_id, MonitorItem.state == "new",
                                      MonitorItem.copy_of.is_(None),  # copies are never offered: their original is
                                      ~MonitorItem.key.endswith("#gone"))  # nor a removed page: nothing is left to capture
    if body.item_ids is not None:
        query = query.where(MonitorItem.id.in_(body.item_ids))
    waiting = sorted(db.scalars(query).all(), key=lambda i: (-following._risk(i), i.first_seen_at))
    done: list[Any] = []
    for item in waiting[:MAX_CAPTURE_ALL]:
        try:
            done.append(await _capture_item(db, request, item, body.reason))
        except (CaptureRefused, _NotCaptured):
            continue
    return {"captured": done, "left": max(0, len(waiting) - len(done))}
