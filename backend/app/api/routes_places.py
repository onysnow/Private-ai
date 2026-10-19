"""The investigation's places: records that say where they are, and what is
linked to them (app/services/places.py; ADR-0005, line 18)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.responses import PlacesOut
from app.services.places import investigation_places

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/places", response_model=PlacesOut)
def get_investigation_places(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Every record with a latitude and a longitude, what is linked to it, and the records whose coordinates cannot be used, with why."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_places(db, investigation_id)
