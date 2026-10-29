"""Deck endpoints: presentation decks assembled from investigation evidence.
CRUD and .pptx export live in app/services/decks.py; routes stay thin per
STRUCT-0002.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Deck, Investigation
from app.schemas.api import ChartToSave, DeckCreate, DeckUpdate
from app.services.saved_charts import ChartRefused, add_chart_to_deck
from app.schemas.responses import ErrorOut, ValidationErrorOut, DeckChecksOut, DeckOut, DecksOut, DeletedOut, file_response
from app.services.assistant_context import describe_record_refs
from app.services.decks import deck_citation_refs, delete_deck, list_decks, render_deck_pptx, serialize_deck, update_deck


def _refused(exc: ChartRefused) -> HTTPException:
    """A 422 that names each rule the chart broke, as the preview showed them."""
    broken = "; ".join(f"rule {e['rule']}: {e['message']}" if e.get("rule") is not None else str(e.get("message")) for e in exc.errors)
    return HTTPException(422, f"{exc.reason}: {broken}" if broken and broken != exc.reason else exc.reason)


router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@router.get("/investigations/{investigation_id}/decks", response_model=DecksOut)
def list_decks_endpoint(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"decks": [serialize_deck(row) for row in list_decks(db, investigation_id)]}


@router.post("/investigations/{investigation_id}/decks", response_model=DeckOut, status_code=201, responses={
    404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut}})
def create_deck_endpoint(investigation_id: str, body: DeckCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """A new deck without an AI draft (DECK_1): from the case's story tree (a slide per section, its claims cited) or
    blank."""
    from app.core.authorization import scope_for_request
    from app.services.deck_editor import new_deck

    try:
        row = new_deck(db, investigation_id, title=body.title, source=body.source, actor=scope_for_request(request).actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return serialize_deck(row)


@router.get("/decks/{deck_id}/checks", response_model=DeckChecksOut, responses={404: {"model": ErrorOut}})
def deck_checks_endpoint(deck_id: str, db: Session = Depends(get_db)) -> Any:
    """Each slide's checks: a claim not yet shown, 7×7, a long run of text slides, a claim changed since made."""
    from app.services.deck_editor import slide_checks

    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    return slide_checks(db, row)


@router.get("/decks/{deck_id}", response_model=DeckOut)
def get_deck_endpoint(deck_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    return serialize_deck(row)


@router.patch("/decks/{deck_id}", response_model=DeckOut)
def update_deck_endpoint(deck_id: str, body: DeckUpdate, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    row = update_deck(db, row, body.model_dump(exclude_unset=True))
    return serialize_deck(row)


@router.delete("/decks/{deck_id}", response_model=DeletedOut)
def delete_deck_endpoint(deck_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    delete_deck(db, row)
    return {"deleted": True}


@router.get("/decks/{deck_id}/export.pptx", response_class=Response, responses=file_response(PPTX, "The deck as an editable PowerPoint file"))
def export_deck_pptx(deck_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
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
        media_type=PPTX,
        headers={"Content-Disposition": f'attachment; filename="{filename}.pptx"'},
    )


@router.post("/decks/{deck_id}/charts", response_model=DeckOut, responses={
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The order slip is not valid, or the chart cannot be drawn or fails the design checks"},
})
def add_chart_to_deck_endpoint(deck_id: str, body: ChartToSave, db: Session = Depends(get_db)) -> Any:
    """Keep a chart built in the chart builder as a new slide at the end of the deck."""
    row = db.get(Deck, deck_id)
    if row is None:
        raise HTTPException(404, "Deck not found")
    try:
        row = add_chart_to_deck(db, row, body.spec, heading=body.heading, style=body.style.model_dump() if body.style else None)
    except ChartRefused as exc:
        raise _refused(exc)
    return serialize_deck(row)
