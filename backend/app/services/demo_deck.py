"""The 1MDB demo case's deck (Act › Decks, mockup DECK_1), so the screen opens on a deck rather than an empty page.

The deck is made by the app's own "New deck from the story" (app/services/deck_editor.py `new_deck`, source "story"),
from the story app/services/demo_story.py seeds: a title slide, then a slide per story section with its claims cited.
Nothing is written here by hand; the deck carries whatever checks the builder's slides earn (a claim not yet shown makes
a slide a draft; claim texts longer than seven words fail 7×7), as a first deck from the story would.

Seeding is idempotent: a case that already has a deck, or has no story sections, is left alone. Nothing is fetched.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.decks import Deck
from app.models.stories import Story, StorySection
from app.services.demo_story import TITLE


def seed_deck(db: Session, investigation_id: str) -> bool:
    """Give the case one deck made from its story. Returns False when it has a deck already or no story to build from."""
    from app.services.deck_editor import new_deck

    if db.scalar(select(Deck.id).where(Deck.investigation_id == investigation_id).limit(1)):
        return False
    story = db.scalar(select(Story).where(Story.investigation_id == investigation_id))
    if story is None or not db.scalar(select(StorySection.id).where(StorySection.story_id == story.id).limit(1)):
        return False
    new_deck(db, investigation_id, title=TITLE, source="story", actor="1MDB demo")
    return True
