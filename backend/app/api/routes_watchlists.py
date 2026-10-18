"""Watchlist endpoints: names re-checked as documents arrive, and what they
turned up (ADR-0006, Wave C; app/services/watchlists.py)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import Investigation, WatchlistEntry, WatchlistHit
from app.schemas.api import WatchlistEntryCreate
from app.schemas.responses import LeadOut, WatchlistCheckOut, WatchlistOut
from app.services.leads import serialize_lead
from app.services.watchlists import add_entry, check_watchlist, dismiss, make_lead, remove_entry, serialize_watchlist

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _investigation(db: Session, investigation_id: str) -> None:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")


@router.get("/investigations/{investigation_id}/watchlist", response_model=WatchlistOut)
def get_watchlist(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The watched names and the documents each was found in."""
    _investigation(db, investigation_id)
    return serialize_watchlist(db, investigation_id)


@router.post("/investigations/{investigation_id}/watchlist", response_model=WatchlistOut)
def add_watchlist_entry(investigation_id: str, body: WatchlistEntryCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """Watch a name: it is searched whenever OpenAleph has read a new document of the investigation."""
    _investigation(db, investigation_id)
    try:
        add_entry(db, investigation_id, query=body.query, note=body.note, created_by=scope_for_request(request).actor_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_watchlist(db, investigation_id)


@router.delete("/watchlist/{watch_id}", response_model=WatchlistOut)
def remove_watchlist_entry(watch_id: str, db: Session = Depends(get_db)) -> Any:
    """Stop watching a name. Its hits go; leads made from them stay."""
    entry = db.get(WatchlistEntry, watch_id)
    if entry is None:
        raise HTTPException(404, "Watched name not found")
    investigation_id = entry.investigation_id
    remove_entry(db, entry)
    return serialize_watchlist(db, investigation_id)


@router.post("/investigations/{investigation_id}/watchlist/check", response_model=WatchlistCheckOut)
def check_watchlist_now(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Search every watched name now. OpenAleph being off or unreachable is each entry's check state."""
    _investigation(db, investigation_id)
    counts = check_watchlist(db, investigation_id)
    return {**serialize_watchlist(db, investigation_id), **counts}


@router.post("/watchlist-hits/{hit_id}/lead", response_model=LeadOut)
def make_lead_from_hit(hit_id: str, db: Session = Depends(get_db)) -> Any:
    """Make a hit a lead, linked to the source of the document it was found in."""
    hit = db.get(WatchlistHit, hit_id)
    if hit is None:
        raise HTTPException(404, "Watchlist hit not found")
    try:
        lead = make_lead(db, hit)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_lead(db, lead)


@router.post("/watchlist-hits/{hit_id}/dismiss", response_model=WatchlistOut)
def dismiss_hit(hit_id: str, db: Session = Depends(get_db)) -> Any:
    hit = db.get(WatchlistHit, hit_id)
    if hit is None:
        raise HTTPException(404, "Watchlist hit not found")
    try:
        dismiss(db, hit)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_watchlist(db, hit.investigation_id)
