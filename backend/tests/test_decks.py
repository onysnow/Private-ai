from fastapi.testclient import TestClient

from app.main import app
from app.models.domain import Deck
from app.db.session import SessionLocal

client = TestClient(app)


def make_investigation(name="Deck test"):
    r = client.post("/api/investigations", json={"name": name})
    assert r.status_code == 200
    return r.json()


def seed_deck(investigation_id: str) -> dict:
    """No POST /api/decks endpoint on purpose -- decks are created by
    promoting a presentation_draft AI candidate (see test_presentation_draft.py),
    not drafted by hand. Insert directly to exercise CRUD/export in isolation."""
    db = SessionLocal()
    try:
        row = Deck(
            investigation_id=investigation_id, title="The consulting fee",
            slides_json=[
                {"heading": "Overview", "bullets": ["Meridian paid Bellcastle $2.4M", "Routed through a shell"],
                 "evidence": [{"record_type": "claim", "record_id": "clm-1"}]},
                {"heading": "Open questions", "bullets": ["Was it disclosed?"], "evidence": []},
            ],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "investigation_id": row.investigation_id}
    finally:
        db.close()


def test_list_get_update_delete():
    inv = make_investigation()
    deck = seed_deck(inv["id"])

    listed = client.get(f"/api/investigations/{inv['id']}/decks")
    assert listed.status_code == 200
    assert listed.json()["decks"][0]["slide_count"] == 2

    fetched = client.get(f"/api/decks/{deck['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "The consulting fee"

    updated = client.patch(f"/api/decks/{deck['id']}", json={"title": "Renamed", "slides_json": [{"heading": "Only slide", "bullets": ["one"], "evidence": []}]})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"
    assert updated.json()["slide_count"] == 1

    deleted = client.delete(f"/api/decks/{deck['id']}")
    assert deleted.status_code == 200
    assert client.get(f"/api/decks/{deck['id']}").status_code == 404


def test_pptx_export():
    inv = make_investigation()
    deck = seed_deck(inv["id"])
    exported = client.get(f"/api/decks/{deck['id']}/export.pptx")
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.presentationml")
    assert len(exported.content) > 0

    from io import BytesIO
    from pptx import Presentation
    prs = Presentation(BytesIO(exported.content))
    # title slide + 2 content slides + 1 references slide (one slide cites evidence)
    assert len(list(prs.slides)) == 4
    texts = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                texts.append(shape.text_frame.text)
    joined = "\n".join(texts)
    assert "Overview" in joined
    assert "Meridian paid Bellcastle $2.4M" in joined
    assert "References" in joined
    assert "clm-1" in joined
