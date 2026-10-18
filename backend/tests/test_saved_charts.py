"""A chart built in the chart builder, kept in a deck or a write-up
(app/services/saved_charts.py). The client sends only the order slip; the
server cooks, draws and checks the chart from the deck's or write-up's own
investigation, and refuses one that cannot be drawn."""

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Deck, Investigation
from app.services.demo_seed import seed_demo_investigation

client = TestClient(app)

ORDER = {"kind": "bar", "question": "ranking", "title": "Meridian received all of the money",
         "query": {"name": "payments_by_party", "params": {"direction": "received"}}}


def _deck_and_writeup() -> tuple[str, str, str]:
    with SessionLocal() as db:
        inv, _ = seed_demo_investigation(db)
        deck = Deck(investigation_id=inv.id, title="Money", slides_json=[
            {"kind": "title", "heading": "Money", "bullets": [], "evidence": []}])
        db.add(deck)
        db.commit()
        inv_id, deck_id = inv.id, deck.id
    writeup = client.post("/api/writeups", json={"investigation_id": inv_id, "title": "Where the money went"})
    assert writeup.status_code == 200
    return inv_id, deck_id, writeup.json()["id"]


def test_a_built_chart_becomes_the_last_slide_of_a_deck():
    _inv, deck_id, _writeup = _deck_and_writeup()
    saved = client.post(f"/api/decks/{deck_id}/charts", json={"spec": ORDER, "heading": "Who got paid"})
    assert saved.status_code == 200, saved.text
    slides = saved.json()["slides"]
    assert len(slides) == 2
    slide = slides[-1]
    assert slide["kind"] == "content" and slide["heading"] == "Who got paid"
    visual = slide["visual"]
    assert visual["type"] == "chart" and visual["report"]["ok"] is True
    # The numbers are the server's own reading of the records, not the client's.
    assert visual["data"]["rows"][0]["label"] == "Meridian Holdings Ltd" and visual["data"]["rows"][0]["value"] == 2400000.0
    assert visual["data"]["rows"][0]["record_refs"]
    assert slide["notes"] == visual["text"]["description"]

    untitled = client.post(f"/api/decks/{deck_id}/charts", json={"spec": ORDER})
    assert untitled.json()["slides"][-1]["heading"] == ORDER["title"]


def test_a_built_chart_is_added_to_a_writeup_and_its_records_are_cited():
    _inv, _deck, writeup_id = _deck_and_writeup()
    saved = client.post(f"/api/writeups/{writeup_id}/charts", json={"spec": ORDER})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    node = body["content_json"]["content"][-1]
    assert node["type"] == "evidenceVisual" and node["attrs"]["visual"]["type"] == "chart"
    refs = node["attrs"]["visual"]["data"]["rows"][0]["record_refs"]
    assert {(r["record_type"], r["record_id"]) for r in refs} <= {(r["record_type"], r["record_id"]) for r in body["cited_record_refs"]}


def test_numbers_sent_by_the_client_are_refused():
    _inv, deck_id, _writeup = _deck_and_writeup()
    forged = client.post(f"/api/decks/{deck_id}/charts", json={"spec": {**ORDER, "values": [1, 2, 3]}})
    assert forged.status_code == 422


def test_a_chart_that_cannot_be_drawn_is_refused_and_nothing_is_saved():
    _inv, deck_id, writeup_id = _deck_and_writeup()
    # Well formed, but a scatter plot needs two numbers per party and this
    # query holds one: the server's check refuses it and says why.
    unfit = {**ORDER, "kind": "scatter", "question": "correlation"}
    refused = client.post(f"/api/decks/{deck_id}/charts", json={"spec": unfit})
    assert refused.status_code == 422
    assert "cannot answer 'correlation'" in refused.json()["detail"]
    assert len(client.get(f"/api/decks/{deck_id}").json()["slides"]) == 1
    before = client.get(f"/api/writeups/{writeup_id}").json()["content_json"]
    assert client.post(f"/api/writeups/{writeup_id}/charts", json={"spec": unfit}).status_code == 422
    assert client.get(f"/api/writeups/{writeup_id}").json()["content_json"] == before


def test_the_chart_is_cooked_from_the_decks_own_investigation():
    """An empty investigation has no payments to chart, whatever the client
    believes; the deck's investigation decides."""
    with SessionLocal() as db:
        empty = Investigation(name="Nothing yet")
        db.add(empty)
        db.flush()
        deck = Deck(investigation_id=empty.id, title="Empty", slides_json=[])
        db.add(deck)
        db.commit()
        deck_id = deck.id
    refused = client.post(f"/api/decks/{deck_id}/charts", json={"spec": ORDER})
    assert refused.status_code == 422


def test_missing_deck_or_writeup():
    assert client.post("/api/decks/nope/charts", json={"spec": ORDER}).status_code == 404
    assert client.post("/api/writeups/nope/charts", json={"spec": ORDER}).status_code == 404
