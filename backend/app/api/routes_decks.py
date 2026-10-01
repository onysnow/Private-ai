"""Deck endpoints: presentation decks assembled from investigation evidence.
CRUD and .pptx export live in app/services/decks.py; routes stay thin per
STRUCT-0002.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Deck, Investigation
from app.schemas.api import DeckUpdate
from app.services.assistant_context import describe_record_refs
from app.services.decks import deck_citation_refs, delete_deck, list_decks, render_deck_pptx, serialize_deck, update_deck

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/decks", response_model=None)
def list_decks_endpoint(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"decks": [serialize_deck(row) for row in list_decks(db, investigation_id)]}


@router.get("/decks/{deck_id}", response_model=None)
def get_deck_endpoint(deck_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    return serialize_deck(row)


@router.patch("/decks/{deck_id}", response_model=None)
def update_deck_endpoint(deck_id: str, body: DeckUpdate, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    row = update_deck(db, row, body.model_dump(exclude_unset=True))
    return serialize_deck(row)


@router.delete("/decks/{deck_id}", response_model=None)
def delete_deck_endpoint(deck_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    delete_deck(db, row)
    return {"deleted": True}


@router.get("/decks/{deck_id}/export.pptx")
def export_deck_pptx(deck_id: str, db: Session = Depends(get_db)):
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    details = describe_record_refs(db, investigation_id=row.investigation_id, refs=deck_citation_refs(row.slides_json or []))
    prs = render_deck_pptx(row, details)
    buf = BytesIO()
    prs.save(buf)
    buf.seek(0)
    filename = "".join(c for c in row.title if c.isalnum() or c in " _-").strip() or "deck"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pptx"'},
    )
