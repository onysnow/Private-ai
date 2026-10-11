"""Case home and Decide (app/services/case_home.py): the standing numbers, the
one list of decisions only a person can make, and what changed since a moment."""

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation
from app.patterns import engine
from app.schemas.api import InvestigationUpdate
from app.schemas.responses import CaseDecisionsOut, CaseSinceOut, CaseStandingOut, InvestigationOut
from app.services import case_home
from app.services.investigations import update_investigation

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _case(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


@router.patch("/investigations/{investigation_id}", response_model=InvestigationOut)
def patch_investigation(investigation_id: str, body: InvestigationUpdate, db: Session = Depends(get_db)) -> Any:
    return update_investigation(db, _case(db, investigation_id), body.model_dump(exclude_unset=True))


@router.get("/investigations/{investigation_id}/standing", response_model=CaseStandingOut)
def get_standing(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Red Flags and To check counts are as last computed (GET .../decisions recomputes them)."""
    _case(db, investigation_id)
    return case_home.standing(db, investigation_id)


@router.get("/investigations/{investigation_id}/decisions", response_model=CaseDecisionsOut)
def get_decisions(
    investigation_id: str, db: Session = Depends(get_db),
    kind: Literal["to_check", "missing", "proposal", "match", "outside", "ai", "watchlist"] | None = None,
    order: Literal["consequence", "source", "oldest"] = "consequence",
) -> Any:
    _case(db, investigation_id)
    # Brings the Red Flags and To check items up to date first, as GET .../checks does.
    engine.bring_up_to_date(db, investigation_id)
    return case_home.decisions(db, investigation_id, kind=kind, order=order)


@router.get("/investigations/{investigation_id}/since", response_model=CaseSinceOut)
def get_since(investigation_id: str, after: datetime = Query(...), db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    return case_home.since(db, investigation_id, after.replace(tzinfo=None))
