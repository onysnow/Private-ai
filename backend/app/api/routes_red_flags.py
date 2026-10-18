"""Red Flags: the pattern engine's flags for an investigation, and what a
reporter does with each (app/patterns/engine.py)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, PatternFlag
from app.patterns import engine
from app.patterns import investigation_type
from app.schemas.api import FlagDismiss, FlagInnocent, InvestigationTypeSet
from app.schemas.responses import InvestigationTypeOut, LeadOut, RedFlagsOut
from app.services.leads import serialize_lead

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _flag(db: Session, flag_id: str) -> PatternFlag:
    row = db.get(PatternFlag, flag_id)
    if row is None:
        raise HTTPException(404, "Red Flag not found")
    return row


@router.get("/investigations/{investigation_id}/red-flags", response_model=RedFlagsOut)
def get_red_flags(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Runs every rule on the investigation's records now, then lists the flags."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return engine.flags(db, investigation_id)


def _investigation(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


@router.get("/investigations/{investigation_id}/type", response_model=InvestigationTypeOut)
def get_investigation_type(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The investigation's type: catalogue areas, with why the app chose each, or the reporter's choice."""
    return investigation_type.current(db, _investigation(db, investigation_id))


@router.put("/investigations/{investigation_id}/type", response_model=InvestigationTypeOut)
def set_investigation_type(investigation_id: str, body: InvestigationTypeSet, db: Session = Depends(get_db)) -> Any:
    """The reporter chooses the areas; null hands the choice back to the app."""
    row = _investigation(db, investigation_id)
    try:
        investigation_type.set_areas(db, row, body.areas)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return investigation_type.current(db, row)


@router.post("/red-flags/{flag_id}/dismiss", response_model=RedFlagsOut)
def dismiss_red_flag(flag_id: str, body: FlagDismiss, db: Session = Depends(get_db)) -> Any:
    """Not relevant: the flag stays dismissed while it keeps firing on the same records."""
    row = _flag(db, flag_id)
    try:
        engine.dismiss(db, row, body.reason)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return engine.flags(db, row.investigation_id, refresh=False)


@router.post("/red-flags/{flag_id}/innocent", response_model=RedFlagsOut)
def mark_red_flag_innocent(flag_id: str, body: FlagInnocent, db: Session = Depends(get_db)) -> Any:
    """Before you call it: one innocent explanation ruled out (with what ruled it out), could apply, or not looked at."""
    row = _flag(db, flag_id)
    try:
        engine.mark_innocent(db, row, body.text, body.state, body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return engine.flags(db, row.investigation_id, refresh=False)


@router.post("/red-flags/{flag_id}/reopen", response_model=RedFlagsOut)
def reopen_red_flag(flag_id: str, db: Session = Depends(get_db)) -> Any:
    row = _flag(db, flag_id)
    engine.reopen(db, row)
    return engine.flags(db, row.investigation_id, refresh=False)


@router.post("/red-flags/{flag_id}/lead", response_model=LeadOut)
def make_lead_from_red_flag(flag_id: str, db: Session = Depends(get_db)) -> Any:
    """The flag as a lead, linked to its parties and links."""
    row = _flag(db, flag_id)
    try:
        lead = engine.make_lead(db, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_lead(db, lead)
