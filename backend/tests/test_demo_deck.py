"""The 1MDB demo case's deck (app/services/demo_deck.py): made from the demo story by the app's own "New deck from the
story", a title slide and a slide per section with its claims cited; a draft where a claim is not yet shown. Seeding
again adds nothing; a case without a story gets no deck."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Claim, Deck
from app.schemas.api import InvestigationCreate
from app.services.demo_deck import seed_deck
from app.services.demo_story import SECTIONS, TITLE, seed_story
from app.services.investigations import create_investigation

client = TestClient(app)


def _case(*, story: bool) -> str:
    with SessionLocal() as db:
        inv = create_investigation(db, InvestigationCreate(name="Deck demo")).id
        for _, texts in SECTIONS:
            for n, text in enumerate(texts):
                db.add(Claim(investigation_id=inv, text=text, status="unverified" if n == 0 else "confirmed"))
        db.commit()
        if story:
            seed_story(db, inv)
    return inv


def test_the_demo_deck_is_the_story_made_into_slides_once():
    inv = _case(story=True)
    with SessionLocal() as db:
        assert seed_deck(db, inv) is True
    [deck] = client.get(f"/api/investigations/{inv}/decks").json()["decks"]
    assert deck["title"] == TITLE
    slides = deck["slides"]
    assert slides[0]["kind"] == "title"
    assert [s["heading"] for s in slides[1:]] == [title for title, _ in SECTIONS]
    assert all(len(s["evidence"]) == len(texts) for s, (_, texts) in zip(slides[1:], SECTIONS, strict=True))
    checks = client.get(f"/api/decks/{deck['id']}/checks").json()
    assert checks["drafts"] == [2, 3, 4]  # each section's first claim is not yet shown

    with SessionLocal() as db:
        assert seed_deck(db, inv) is False
        assert len(db.scalars(select(Deck).where(Deck.investigation_id == inv)).all()) == 1


def test_a_case_without_a_story_gets_no_deck():
    inv = _case(story=False)
    with SessionLocal() as db:
        assert seed_deck(db, inv) is False
        assert db.scalars(select(Deck).where(Deck.investigation_id == inv)).all() == []
