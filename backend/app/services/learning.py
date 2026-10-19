"""Practise in Learn: flip cards on a fixed-interval ladder (research Knowledge §6; Part 5 "Spaced-repetition
scheduler: a fixed ladder (no ADR)").

A card is an indicator from the catalogue or a term from the glossary, kept per reporter (the request's actor), not
per case: "Store for review state (per reporter, local)". Answers follow the Anki manual's buttons ([R4]): Again /
Good by default, Hard / Easy when the reporter turns them on. Each answer moves the card along one ladder of days:

- Again: back to the bottom, due now (it comes round again in the same sitting).
- Hard: the rung below its current one again, without climbing.
- Good: the next rung.
- Easy: two rungs at once.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import LearningCard
from app.patterns.engine import catalogue_glossary, indicator

# Days until the next showing, one per rung. The ladder the research names: fixed, no package, no ADR.
LADDER_DAYS = (1, 3, 7, 14, 30, 60, 120)
TOP = len(LADDER_DAYS) - 1
SAFETY_AREA = "SA"

Answer = Literal["again", "hard", "good", "easy"]
Deck = Literal["all", "case", "area", "terms", "safety"]


def _schedule(step: int, answer: str) -> tuple[int, int]:
    """(new step, interval in days) for an answer on a card at `step`; interval 0 means due now."""
    if answer == "again":
        return 0, 0
    if answer == "hard":
        return step, LADDER_DAYS[min(max(step - 1, 0), TOP)]
    if answer == "good":
        return min(step + 1, TOP + 1), LADDER_DAYS[min(step, TOP)]
    if answer == "easy":
        return min(step + 2, TOP + 1), LADDER_DAYS[min(step + 1, TOP)]
    raise ValueError(f"Unknown answer {answer!r}")


def next_days(step: int) -> dict[str, int]:
    """What each answer button would set, in days: "each answer button shows the next time a card will be reviewed"."""
    return {a: _schedule(step, a)[1] for a in ("again", "hard", "good", "easy")}


def _term(name: str) -> dict[str, Any] | None:
    wanted = name.strip().lower()
    return next((t for t in catalogue_glossary() if t["term"].lower() == wanted), None)


def _resolve(kind: str, ref: str) -> tuple[str, str, list[str]]:
    """(the ref as the catalogue spells it, its name, its areas); LookupError when the catalogue has no such thing."""
    if kind == "indicator":
        found = indicator(ref.strip().upper())
        if found is None:
            raise LookupError("Indicator not found")
        ind, _area_name = found
        return ind.id, ind.name, [ind.id.split("-")[0]]
    if kind == "term":
        term = _term(ref)
        if term is None:
            raise LookupError("Term not found")
        return term["term"], term["term"], list(term["areas"])
    raise ValueError(f"Unknown kind {kind!r}")


def _name(card: LearningCard) -> str:
    if card.kind == "indicator":
        found = indicator(card.ref)
        return found[0].name if found else card.ref
    return card.ref


def card_out(card: LearningCard, now: datetime | None = None) -> dict[str, Any]:
    now = now or utcnow_naive()
    return {
        "id": card.id, "kind": card.kind, "ref": card.ref, "name": _name(card), "areas": list(card.areas or []),
        "added_from": card.added_from, "step": card.step, "interval_days": card.interval_days, "due_at": card.due_at,
        "due": card.due_at <= now, "last_answer": card.last_answer, "last_reviewed_at": card.last_reviewed_at,
        "reviews": card.reviews, "lapses": card.lapses, "created_at": card.created_at, "next_days": next_days(card.step),
    }


def add_card(db: Session, owner: str, kind: str, ref: str, added_from: str = "flip_card") -> tuple[LearningCard, bool]:
    """Adds the card once (due now); adding it again returns the card as it stands. (card, created)."""
    canonical, _name_, areas = _resolve(kind, ref)
    existing = db.scalar(select(LearningCard).where(LearningCard.owner == owner, LearningCard.kind == kind, LearningCard.ref == canonical))
    if existing is not None:
        return existing, False
    card = LearningCard(owner=owner, kind=kind, ref=canonical, areas=areas, added_from=added_from, step=0, interval_days=0,
                        due_at=utcnow_naive(), reviews=0, lapses=0)
    db.add(card)
    db.commit()
    db.refresh(card)
    return card, True


def _in_deck(card: LearningCard, deck: str, areas: set[str], area: str | None) -> bool:
    card_areas = set(card.areas or [])
    if deck == "all":
        return True
    if deck == "case":
        return bool(card_areas & areas)
    if deck == "area":
        return bool(area) and area in card_areas
    if deck == "terms":
        return card.kind == "term"
    if deck == "safety":
        return SAFETY_AREA in card_areas
    raise ValueError(f"Unknown deck {deck!r}")


def _owned(db: Session, owner: str) -> list[LearningCard]:
    return list(db.scalars(select(LearningCard).where(LearningCard.owner == owner).order_by(LearningCard.due_at, LearningCard.created_at)).all())


def list_cards(db: Session, owner: str, deck: str = "all", areas: set[str] | None = None, area: str | None = None,
               due_only: bool = False, ref: str | None = None, limit: int = 200) -> dict[str, Any]:
    """The deck's cards, soonest due first: the due ones (or, with due_only false, all of them, for "Practise anyway")."""
    now = utcnow_naive()
    cards = [c for c in _owned(db, owner) if _in_deck(c, deck, areas or set(), area)]
    if ref:
        cards = [c for c in cards if c.ref.lower() == ref.strip().lower()]
    due = [c for c in cards if c.due_at <= now]
    later = [c for c in cards if c.due_at > now]
    shown = due if due_only else due + later
    return {"total": len(cards), "due": len(due), "next_due_at": later[0].due_at if later else None,
            "cards": [card_out(c, now) for c in shown[:limit]]}


def summary(db: Session, owner: str, areas: set[str] | None = None) -> dict[str, Any]:
    """How many cards are due, in all and per deck, and when the next one falls due: what "Practise · 12 due" needs."""
    now = utcnow_naive()
    cards = _owned(db, owner)
    areas = areas or set()

    def count(deck: str, area: str | None = None) -> dict[str, Any]:
        mine = [c for c in cards if _in_deck(c, deck, areas, area)]
        later = [c.due_at for c in mine if c.due_at > now]
        return {"deck": deck, "area": area, "total": len(mine), "due": sum(1 for c in mine if c.due_at <= now),
                "next_due_at": min(later) if later else None}

    every = count("all")
    decks = [every, count("case"), count("terms"), count("safety")]
    by_area = sorted({a for c in cards for a in (c.areas or [])})
    return {"total": every["total"], "due": every["due"], "next_due_at": every["next_due_at"], "ladder_days": list(LADDER_DAYS),
            "decks": decks, "areas": [count("area", a) for a in by_area]}


def answer(db: Session, owner: str, card_id: str, given: str) -> LearningCard:
    """Moves the card along the ladder; LookupError when the reporter has no such card."""
    card = db.get(LearningCard, card_id)
    if card is None or card.owner != owner:
        raise LookupError("Card not found")
    step, days = _schedule(card.step, given)
    now = utcnow_naive()
    if given == "again" and card.step > 0:
        card.lapses += 1
    card.step, card.interval_days = step, days
    card.due_at = now + timedelta(days=days)
    card.last_answer, card.last_reviewed_at = given, now
    card.reviews += 1
    db.commit()
    db.refresh(card)
    return card
