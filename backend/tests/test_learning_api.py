"""Practise in Learn: flip cards on a fixed ladder (app/services/learning.py, app/api/routes_learning.py)."""

from datetime import timedelta

from fastapi.testclient import TestClient

import app.services.learning as learning
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_flip_card_is_added_once_due_now_and_counted():
    card = ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "bo-007"}))
    assert card["ref"] == "BO-007" and card["areas"] == ["BO"] and card["due"] and card["step"] == 0
    assert card["name"] and card["next_days"] == {"again": 0, "hard": 1, "good": 1, "easy": 3}
    again = ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "BO-007"}))
    assert again["id"] == card["id"], "adding it again changes nothing"
    term = ok(client.post("/api/learning/cards", json={"kind": "term", "ref": "beneficial owner"}))
    assert term["kind"] == "term" and term["ref"].lower() == "beneficial owner" and term["areas"]
    assert client.post("/api/learning/cards", json={"kind": "indicator", "ref": "XX-999"}).status_code == 404
    assert client.post("/api/learning/cards", json={"kind": "term", "ref": "no such term at all"}).status_code == 404
    summary = ok(client.get("/api/learning/summary", params={"areas": "BO"}))
    assert summary["total"] == 2 and summary["due"] == 2 and summary["ladder_days"] == list(learning.LADDER_DAYS)
    decks = {d["deck"]: d for d in summary["decks"]}
    assert decks["case"]["due"] >= 1 and decks["terms"]["total"] == 1 and decks["safety"]["total"] == 0
    assert any(a["area"] == "BO" and a["due"] >= 1 for a in summary["areas"])
    found = ok(client.get("/api/learning/cards", params={"ref": "BO-007"}))
    assert [c["id"] for c in found["cards"]] == [card["id"]]


def test_answers_climb_the_ladder_and_again_sends_it_back():
    card = ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "BO-001"}))
    good = ok(client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "good"}))
    assert good["step"] == 1 and good["interval_days"] == 1 and not good["due"] and good["last_answer"] == "good" and good["reviews"] == 1
    assert good["next_days"]["good"] == 3
    easy = ok(client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "easy"}))
    assert easy["step"] == 3 and easy["interval_days"] == 7
    hard = ok(client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "hard"}))
    assert hard["step"] == 3 and hard["interval_days"] == 7
    lapse = ok(client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "again"}))
    assert lapse["step"] == 0 and lapse["interval_days"] == 0 and lapse["due"] and lapse["lapses"] == 1
    assert client.post("/api/learning/answers", json={"card_id": "missing", "answer": "good"}).status_code == 404
    assert client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "maybe"}).status_code == 422


def test_the_top_rung_holds_and_nothing_due_says_when_next():
    card = ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "BO-002"}))
    for _ in range(12):
        last = ok(client.post("/api/learning/answers", json={"card_id": card["id"], "answer": "good"}))
    assert last["interval_days"] == learning.LADDER_DAYS[-1]
    due = ok(client.get("/api/learning/cards", params={"due_only": True}))
    assert due["due"] == 0 and due["cards"] == [] and due["next_due_at"]
    anyway = ok(client.get("/api/learning/cards"))
    assert [c["id"] for c in anyway["cards"]] == [card["id"]], "Practise anyway: every card in the deck, soonest first"


def test_decks_filter_by_case_areas_area_terms_and_safety():
    ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "BO-001"}))
    ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "ML-001"}))
    ok(client.post("/api/learning/cards", json={"kind": "indicator", "ref": "SA-001"}))
    ok(client.post("/api/learning/cards", json={"kind": "term", "ref": "beneficial owner"}))
    refs = lambda **params: sorted(c["ref"] for c in ok(client.get("/api/learning/cards", params=params))["cards"])  # noqa: E731
    case = refs(deck="case", areas="ML,SA")
    assert {"ML-001", "SA-001"} <= set(case) and "BO-001" not in case, "a term counts in every area it belongs to"
    assert refs(deck="case") == []
    assert refs(deck="area", area="BO")[0] == "BO-001"
    assert [r.lower() for r in refs(deck="terms")] == ["beneficial owner"]
    assert refs(deck="safety") == ["SA-001"]
    assert client.get("/api/learning/cards", params={"deck": "everything"}).status_code == 422
    assert client.get("/api/learning/cards", params={"areas": "bo;drop"}).status_code == 422


def test_cards_belong_to_one_reporter_and_due_follows_the_clock(monkeypatch):
    with SessionLocal() as db:
        mine, _ = learning.add_card(db, "reporter-a", "indicator", "BO-001")
        learning.add_card(db, "reporter-b", "indicator", "BO-001")
        assert learning.summary(db, "reporter-a")["total"] == 1
        try:
            learning.answer(db, "reporter-b", mine.id, "good")
            raise AssertionError("another reporter's card was answered")
        except LookupError:
            pass
        learning.answer(db, "reporter-a", mine.id, "good")
        assert learning.list_cards(db, "reporter-a", due_only=True)["due"] == 0
        later = utcnow_naive() + timedelta(days=1, minutes=1)
        monkeypatch.setattr(learning, "utcnow_naive", lambda: later)
        assert learning.list_cards(db, "reporter-a", due_only=True)["due"] == 1
