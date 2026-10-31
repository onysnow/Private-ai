"""The 1MDB demo case's story (app/services/demo_story.py): a thesis, three sections holding claims the case already
has (looked up by their text, never made up), shown, disputed and not-yet-shown branches, and a short draft citing
them with one sentence still without a source. Seeding again changes nothing; a claim the case lacks is left out."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Claim, StoryClaim, StorySection, Writeup
from app.schemas.api import InvestigationCreate
from app.services import demo_1mdb
from app.services.demo_story import SECTIONS, THESIS, seed_story
from app.services.investigations import create_investigation

client = TestClient(app)
# The claims' statuses as the demo grades them (records.json / more.json and their reviews).
STATUS = {SECTIONS[0][1][3]: "lead", SECTIONS[1][1][2]: "disputed", SECTIONS[1][1][3]: "supported", SECTIONS[1][1][4]: "unverified",
          SECTIONS[2][1][1]: "lead", SECTIONS[2][1][2]: "supported", SECTIONS[2][1][3]: "unverified"}


def _case(skip: str | None = None) -> str:
    with SessionLocal() as db:
        inv = create_investigation(db, InvestigationCreate(name="Story demo")).id
        for _, texts in SECTIONS:
            for text in texts:
                if text != skip:
                    db.add(Claim(investigation_id=inv, text=text, status=STATUS.get(text, "confirmed")))
        db.add(Claim(investigation_id=inv, text="A claim the story does not use.", status="unverified"))
        db.commit()
    return inv


def test_every_claim_of_the_story_is_one_the_demo_case_has():
    more = demo_1mdb.more()
    texts = {c["text"] for c in demo_1mdb.records()["claims"]} | {c["text"] for c in more["claims"] + more["inferred_claims"]}
    assert [t for _, ts in SECTIONS for t in ts if t not in texts] == []


def test_the_demo_story_has_shown_disputed_and_unshown_branches_and_a_cited_draft():
    inv = _case()
    with SessionLocal() as db:
        assert seed_story(db, inv) is True
    story = client.get(f"/api/investigations/{inv}/story").json()
    assert story["thesis"] == THESIS
    assert [s["title"] for s in story["sections"]] == [title for title, _ in SECTIONS]
    assert [len(s["claims"]) for s in story["sections"]] == [len(texts) for _, texts in SECTIONS]
    assert {s["status"] for s in story["sections"]} == {"unshown", "disputed"}
    assert story["counts"]["shown"] > 0 and story["counts"]["disputed"] == 1 and story["counts"]["unshown"] > 0
    assert [u["text"] for u in story["unplaced"]] == ["A claim the story does not use."]
    # The draft cites the claims by their numbers in the tree; its last sentence has no source yet.
    assert story["writeup_id"] and story["sentences"]["uncited"] == 1 and story["sentences"]["total"] > 5
    numbers = {c["id"]: str(i + 1) for i, c in enumerate(c for s in story["sections"] for c in s["claims"])}
    with SessionLocal() as db:
        writeup = db.get(Writeup, story["writeup_id"])
        assert writeup is not None
        cites = [n["attrs"] for p in writeup.content_json["content"] for n in p.get("content") or [] if n["type"] == "citation"]
    assert len(cites) == 6 and all(c["label"] == numbers[c["recordId"]] for c in cites)
    assert next(g for g in story["gates"] if g["key"] == "sources")["state"] == "open"

    with SessionLocal() as db:
        assert seed_story(db, inv) is False
        story_rows = db.scalars(select(StoryClaim).join(StorySection, StorySection.id == StoryClaim.section_id)).all()
        assert len([r for r in story_rows if r.claim_id in numbers]) == len(numbers)
        assert len(db.scalars(select(Writeup).where(Writeup.investigation_id == inv)).all()) == 1


def test_a_claim_the_case_lacks_is_left_out_and_its_citation_dropped():
    missing = SECTIONS[0][1][0]
    inv = _case(skip=missing)
    with SessionLocal() as db:
        seed_story(db, inv)
    story = client.get(f"/api/investigations/{inv}/story").json()
    assert len(story["sections"][0]["claims"]) == len(SECTIONS[0][1]) - 1
    with SessionLocal() as db:
        writeup = db.get(Writeup, story["writeup_id"])
        assert writeup is not None
        assert len(writeup.cited_record_refs) == 5
