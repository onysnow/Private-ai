"""Practise in Learn: the reporter's flip cards (research Knowledge §6; app/services/learning.py). Cards are kept
per reporter, not per case, so no path here names an investigation; "My case's areas" is a deck the caller names
by the open case's areas."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.schemas.api import LearningAnswer, LearningCardCreate
from app.schemas.responses import LearningCardListOut, LearningCardOut, LearningSummaryOut
from app.services import learning

router = APIRouter(prefix="/api/learning", dependencies=[Depends(authorize_request_resource)])

AREAS = Query("", max_length=400, pattern=r"^([A-Z]{2,3}(,[A-Z]{2,3})*)?$",
              description="The open case's areas, comma-separated (BO,ML): the \"My case's areas\" deck.")


def _owner(request: Request) -> str:
    return scope_for_request(request).actor_id


def _areas(value: str) -> set[str]:
    return {a for a in value.split(",") if a}


@router.get("/summary", response_model=LearningSummaryOut)
def learning_summary(request: Request, areas: str = AREAS, db: Session = Depends(get_db)) -> Any:
    """How many flip cards are due, in all and per deck, and when the next falls due."""
    return learning.summary(db, _owner(request), _areas(areas))


@router.get("/cards", response_model=LearningCardListOut)
def list_learning_cards(request: Request, deck: Literal["all", "case", "area", "terms", "safety"] = "all", areas: str = AREAS,
                        area: str | None = Query(None, pattern=r"^[A-Z]{2,3}$"), due_only: bool = False,
                        ref: str | None = Query(None, min_length=1, max_length=255), limit: int = Query(200, ge=1, le=1000),
                        db: Session = Depends(get_db)) -> Any:
    """A deck's cards, due first; with due_only, only those due now. ``ref`` finds one indicator's or term's card."""
    return learning.list_cards(db, _owner(request), deck, _areas(areas), area, due_only, ref, limit)


@router.post("/cards", response_model=LearningCardOut)
def add_learning_card(request: Request, body: LearningCardCreate, db: Session = Depends(get_db)) -> Any:
    """＋ Flip card: keeps the indicator or term as a card, due now. Adding it again changes nothing."""
    try:
        card, _created = learning.add_card(db, _owner(request), body.kind, body.ref)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return learning.card_out(card)


@router.post("/answers", response_model=LearningCardOut)
def answer_learning_card(request: Request, body: LearningAnswer, db: Session = Depends(get_db)) -> Any:
    """Again / Good (or Hard / Easy): moves the card along the ladder and says when it comes back."""
    try:
        card = learning.answer(db, _owner(request), body.card_id, body.answer)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return learning.card_out(card)
