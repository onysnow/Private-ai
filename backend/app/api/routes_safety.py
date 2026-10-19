"""Keep › Safety & data (app/services/safety.py, app/services/outbound_log.py, ADR-0015): what lives on this computer,
what left it, and the outbound log word for word."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.responses import OutboundLogOut, SafetyAndDataOut, file_response
from app.services.outbound_log import list_outbound, outbound_csv
from app.services.safety import build_safety_and_data

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

Period = Literal["today", "7d", "30d", "all"]


def _case(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


@router.get("/investigations/{investigation_id}/safety-and-data", response_model=SafetyAndDataOut)
def get_safety_and_data(investigation_id: str, period: Period = "7d", db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    return build_safety_and_data(db, investigation_id, period=period)


@router.get("/investigations/{investigation_id}/outbound-log", response_model=OutboundLogOut)
def get_outbound_log(
    investigation_id: str, period: Period = "7d", service: str | None = None,
    limit: int = Query(200, ge=1, le=1000), include_local: bool = False, db: Session = Depends(get_db),
) -> Any:
    """Newest first. Only requests that left this computer, unless `include_local` is true."""
    _case(db, investigation_id)
    return list_outbound(db, investigation_id, period=period, service=service, limit=limit, outside_only=not include_local)


@router.get("/investigations/{investigation_id}/outbound-log.csv", response_class=Response,
            responses=file_response("text/csv", "The whole outbound log as a CSV file, for a source-protection file"))
def export_outbound_log(investigation_id: str, period: Period = "all", service: str | None = None, db: Session = Depends(get_db)) -> Response:
    case = _case(db, investigation_id)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in case.name).strip("_") or "case"
    return Response(
        content=outbound_csv(db, investigation_id, period=period, service=service), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe}-outbound-log.csv"'},
    )
