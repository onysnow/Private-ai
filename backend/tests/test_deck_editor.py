"""The deck editor (app/services/deck_editor.py, mockups DECK_1 and DECK_2): a deck made from the story tree without an
AI draft, each slide remembering its claims' status; the checks for a claim not yet shown, 7×7, a long run of text
slides, and a claim that changed since the slide was made."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.claims import Claim
from app.models.stories import Story, StoryClaim, StorySection

client = TestClient(app)


def _case_with_story() -> tuple[str, str, str]:
    inv = client.post("/api/investigations", json={"name": "The harbour land"}).json()["id"]
    with SessionLocal() as db:
        shown = Claim(investigation_id=inv, text="The council sold plot 14 to Kestrel SA", status="supported")
        lead = Claim(investigation_id=inv, text="Kestrel SA was told the price before the tender closed and bid exactly that",
                     status="unverified")
        story = Story(investigation_id=inv, thesis="Who bought the harbour land")
        db.add_all([shown, lead, story])
        db.flush()
        sale = StorySection(story_id=story.id, title="The sale", position=0)
        empty = StorySection(story_id=story.id, title="What we still need", position=1)
        db.add_all([sale, empty])
        db.flush()
        db.add_all([StoryClaim(section_id=sale.id, claim_id=shown.id, position=0), StoryClaim(section_id=sale.id, claim_id=lead.id, position=1)])
        db.commit()
        return inv, shown.id, lead.id


def test_a_deck_from_the_story_tree_cites_its_claims_and_marks_the_draft_slide():
    inv, shown, lead = _case_with_story()
    made = client.post(f"/api/investigations/{inv}/decks", json={"source": "story"})
    assert made.status_code == 201, made.text
    deck = made.json()
    assert deck["title"] == "Who bought the harbour land" and deck["source_ai_candidate_id"] is None
    assert [s["kind"] for s in deck["slides"]] == ["title", "content", "statement"]
    sale = deck["slides"][1]
    assert sale["heading"] == "The sale" and sale["made_with"] == {shown: "supported", lead: "unverified"}
    checks = client.get(f"/api/decks/{deck['id']}/checks").json()
    assert checks["drafts"] == [2] and checks["changed"] == []
    kinds = [p["kind"] for p in checks["slides"][1]["problems"]]
    assert kinds == ["draft", "7x7", "7x7"]  # the lead is not yet shown; the two sentences have 8 and 15 words


def test_a_claim_that_moves_after_the_deck_was_made_is_named():
    inv, shown, _lead = _case_with_story()
    deck = client.post(f"/api/investigations/{inv}/decks", json={"source": "story"}).json()
    with SessionLocal() as db:
        db.get(Claim, shown).status = "disputed"
        db.commit()
    checks = client.get(f"/api/decks/{deck['id']}/checks").json()
    assert checks["changed"] == [2] and 2 in checks["drafts"]
    changed = next(p for p in checks["slides"][1]["problems"] if p["kind"] == "changed")
    assert changed["text"] == "“The council sold plot 14 to Kestrel SA” was supported when the slide was made; now disputed"


def test_a_blank_deck_and_a_long_run_of_text_slides():
    inv = client.post("/api/investigations", json={"name": "Quiet"}).json()["id"]
    deck = client.post(f"/api/investigations/{inv}/decks", json={"source": "blank", "title": "Briefing"}).json()
    assert [s["heading"] for s in deck["slides"]] == ["Briefing"]
    slides = deck["slides"] + [{"kind": "content", "heading": f"Point {n}", "bullets": ["short line"]} for n in range(6)]
    client.patch(f"/api/decks/{deck['id']}", json={"slides_json": slides})
    checks = client.get(f"/api/decks/{deck['id']}/checks").json()
    assert [p["kind"] for p in checks["slides"][6]["problems"]] == ["5-5-5"] and checks["slides"][5]["problems"] == []
    assert client.post("/api/investigations/nope/decks", json={}).status_code == 404
