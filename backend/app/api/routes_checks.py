"""To check: passages to read and checklist items a person decides
(app/patterns/checks.py). They sit in the Verify stage; Red Flags stays what
the records show."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import CheckItem, Investigation
from app.patterns import checks, engine
from app.schemas.api import CheckDecide
from app.schemas.responses import ChecksOut

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/checks", response_model=ChecksOut)
def get_checks(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Brings the flags and the items up to date with the case's records, then lists the items."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    engine.bring_up_to_date(db, investigation_id)
    return checks.items(db, investigation_id)


@router.post("/checks/{check_id}/decide", response_model=ChecksOut)
def decide_check(check_id: str, body: CheckDecide, db: Session = Depends(get_db)) -> Any:
    """A person's decision: shows it, does not, unclear, or back to open; with a note."""
    row = db.get(CheckItem, check_id)
    if row is None:
        raise HTTPException(404, "Item not found")
    try:
        checks.decide(db, row, body.status, body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return checks.items(db, row.investigation_id)
