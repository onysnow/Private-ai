"""Timeline › Lanes and its named periods (mockups TIME_1 and TIME_8; research §2.9). The service is
app/services/timeline_lanes.py; routes stay thin."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import BuiltTimeline, Investigation, TimelinePeriod
from app.schemas.api import BuiltTimelineIn, TimelineBoardIn, TimelinePeriodIn
from app.schemas.responses import (
    BuiltTimelineOut,
    ErrorOut,
    TimelineBoardOut,
    TimelineLanesOut,
    TimelinePeriodOut,
    ValidationErrorOut,
)
from app.services import timeline_lanes

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _case(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


def _period(db: Session, investigation_id: str, period_id: str) -> TimelinePeriod:
    row = db.get(TimelinePeriod, period_id)
    if row is None or row.investigation_id != investigation_id:
        raise HTTPException(404, "No such period in this case")
    return row


@router.get("/investigations/{investigation_id}/timeline/lanes", response_model=TimelineLanesOut,
            responses={404: {"model": ErrorOut}})
def timeline_lanes_view(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The case's events as lanes: each with its parties, where it comes from and whether it is shown; the reporter's
    periods; the sequence checks; records not on the timeline yet; and sources with no date."""
    _case(db, investigation_id)
    return timeline_lanes.lanes(db, investigation_id)


@router.post("/investigations/{investigation_id}/timeline/periods", response_model=TimelinePeriodOut, status_code=201,
             responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut}})
def create_timeline_period(investigation_id: str, body: TimelinePeriodIn, request: Request,
                           db: Session = Depends(get_db)) -> Any:
    """Name a stretch of the case's time."""
    _case(db, investigation_id)
    try:
        return timeline_lanes.save_period(db, investigation_id, name=body.name, date_start=body.date_start,
                                          date_end=body.date_end, summary=body.summary,
                                          actor=scope_for_request(request).actor_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.put("/investigations/{investigation_id}/timeline/periods/{period_id}", response_model=TimelinePeriodOut,
            responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut}})
def update_timeline_period(investigation_id: str, period_id: str, body: TimelinePeriodIn,
                           db: Session = Depends(get_db)) -> Any:
    """Rename a period, move its dates, or change its summary."""
    row = _period(db, investigation_id, period_id)
    try:
        return timeline_lanes.save_period(db, investigation_id, name=body.name, date_start=body.date_start,
                                          date_end=body.date_end, summary=body.summary, period=row)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/investigations/{investigation_id}/timeline/periods/{period_id}", status_code=204,
               responses={404: {"model": ErrorOut}})
def delete_timeline_period(investigation_id: str, period_id: str, db: Session = Depends(get_db)) -> Response:
    """Take a period away; its events stay."""
    db.delete(_period(db, investigation_id, period_id))
    db.commit()
    return Response(status_code=204)


def _built(db: Session, request: Request, investigation_id: str, built_id: str) -> BuiltTimeline:
    row = db.get(BuiltTimeline, built_id)
    if row is None or row.investigation_id != investigation_id or row.owner != scope_for_request(request).actor_id:
        raise HTTPException(404, "No such timeline of yours in this case")
    return row


@router.get("/investigations/{investigation_id}/built-timelines", response_model=list[BuiltTimelineOut],
            responses={404: {"model": ErrorOut}})
def list_built_timelines(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Your own timelines in this case (each person sees only theirs)."""
    _case(db, investigation_id)
    owner = scope_for_request(request).actor_id
    return list(db.scalars(select(BuiltTimeline).where(BuiltTimeline.investigation_id == investigation_id,
                                                       BuiltTimeline.owner == owner).order_by(BuiltTimeline.created_at)))


@router.post("/investigations/{investigation_id}/built-timelines", response_model=BuiltTimelineOut, status_code=201,
             responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut}})
def create_built_timeline(investigation_id: str, body: BuiltTimelineIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Start a timeline of your own."""
    _case(db, investigation_id)
    try:
        return timeline_lanes.save_built(db, investigation_id, scope_for_request(request).actor_id, name=body.name, items=body.items)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.put("/investigations/{investigation_id}/built-timelines/{built_id}", response_model=BuiltTimelineOut,
            responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut | ErrorOut}})
def update_built_timeline(investigation_id: str, built_id: str, body: BuiltTimelineIn, request: Request,
                          db: Session = Depends(get_db)) -> Any:
    """Rename it, or change which events it tells and in what order."""
    row = _built(db, request, investigation_id, built_id)
    try:
        return timeline_lanes.save_built(db, investigation_id, row.owner, name=body.name, items=body.items, built=row)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/investigations/{investigation_id}/built-timelines/{built_id}", status_code=204,
               responses={404: {"model": ErrorOut}})
def delete_built_timeline(investigation_id: str, built_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    """Delete one of your timelines; the events in it stay as they are."""
    db.delete(_built(db, request, investigation_id, built_id))
    db.commit()
    return Response(status_code=204)


BOARD_KEY = "timeline_board"
BOARD_EMPTY = {"style": "rich", "positions": {}, "notes": []}


@router.get("/investigations/{investigation_id}/timeline/board", response_model=TimelineBoardOut,
            responses={404: {"model": ErrorOut}})
def get_timeline_board(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Where the Board's cards sit, its notes, and its style (Rich by default, DECISIONS_LOG 6, call 9)."""
    from app.services.preferences import _get

    _case(db, investigation_id)
    row = _get(db, "case", investigation_id, BOARD_KEY)
    return {**BOARD_EMPTY, **(row.value if row is not None else {})}


@router.put("/investigations/{investigation_id}/timeline/board", response_model=TimelineBoardOut,
            responses={404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut}})
def put_timeline_board(investigation_id: str, body: TimelineBoardIn, db: Session = Depends(get_db)) -> Any:
    """Keep where the cards were moved to, the notes, and the style. Kept with the case, so it travels in a backup."""
    from app.services.preferences import _put

    _case(db, investigation_id)
    value = body.model_dump()
    return _put(db, "case", investigation_id, BOARD_KEY, value, investigation_id=investigation_id).value
