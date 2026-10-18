"""Missing values (app/patterns/missing.py): a value a record needs and does not
have is a To check item of kind "missing" naming what the gap stops; it goes when
the value is filled in, and a person can chase it (a lead is made), say it cannot
be known, or say it does not apply."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str) -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def _missing(inv: str) -> dict[tuple[str, str], dict]:
    return {(m["rule"], m["record_id"]): m for m in ok(client.get(f"/api/investigations/{inv}/checks"))["missing"]}


def test_a_payment_without_amount_or_date_and_a_company_without_jurisdiction_are_flagged():
    inv = _inv("Missing: payment")
    a = ok(client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Fernhill Ltd", "properties": {}}))["id"]
    b = ok(client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Kestrel SA",
                                              "properties": {"jurisdiction": ["ch"], "registrationNumber": ["CHE-1"]}}))["id"]
    pay = ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": a,
                                                     "target_entity_id": b, "properties": {}}))
    found = _missing(inv)
    amount = found[("MV-PAY-AMT", pay["id"])]
    assert amount["record_type"] == "relationship" and amount["question"] == "How much did Fernhill Ltd pay Kestrel SA?"
    assert "Money traced" in amount["blocks"] and {p["id"] for p in amount["parties"]} == {a, b}
    assert ("MV-PAY-DATE", pay["id"]) in found and ("MV-CO-JUR", a) in found and ("MV-CO-REG", a) in found
    assert ("MV-CO-JUR", b) not in found
    # In the decisions list, as their own kind, with the three answers.
    feed = ok(client.get(f"/api/investigations/{inv}/decisions", params={"kind": "missing"}))
    item = next(i for i in feed["items"] if i["id"] == amount["id"])
    assert [c["label"] for c in item["choices"]] == ["Chase it", "Can't be known", "Doesn't apply"]
    assert ok(client.get(f"/api/investigations/{inv}/standing"))["missing"] == feed["counts"]["missing"]
    # Filling the value in removes it.
    ok(client.patch(f"/api/entities/{a}", json={"properties": {"jurisdiction": ["gb"]}}))
    assert ("MV-CO-JUR", a) not in _missing(inv)


def test_chasing_a_missing_value_makes_a_lead_and_other_answers_are_kept():
    inv = _inv("Missing: answers")
    src = ok(client.post("/api/sources", json={"investigation_id": inv, "title": "Harbour Gazette", "source_type": "web"}))
    ev = ok(client.post("/api/evidence", json={"source_id": src["id"], "quote": "The land changed hands"}))
    found = _missing(inv)
    locator, url = found[("MV-EV-LOC", ev["id"])], found[("MV-SRC-URL", src["id"])]
    body = ok(client.post(f"/api/checks/{locator['id']}/decide", json={"status": "chasing", "note": "Ask the archive for the page"}))
    chased = next(m for m in body["missing"] if m["id"] == locator["id"])
    assert chased["status"] == "chasing" and chased["lead_id"]
    lead = next(item for item in ok(client.get(f"/api/investigations/{inv}/leads")) if item["id"] == chased["lead_id"])
    assert lead["title"].startswith("Find: Where in Harbour Gazette") and "Ask the archive" in lead["detail"]
    ok(client.post(f"/api/checks/{url['id']}/decide", json={"status": "unknowable", "note": "Print only"}))
    assert _missing(inv)[("MV-SRC-URL", src["id"])]["status"] == "unknowable"
    # A missing value is not answered like a passage, nor a passage like a missing value.
    assert client.post(f"/api/checks/{url['id']}/decide", json={"status": "shows"}).status_code == 400
    assert ok(client.get(f"/api/investigations/{inv}/checks"))["items"] == []


def test_a_supported_claim_with_nothing_linked_is_a_missing_value():
    inv = _inv("Missing: claim")
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Kestrel SA bought the land", "status": "supported", "confidence": 0.8}))
    gap = _missing(inv)[("MV-CLM-EV", claim["id"])]
    assert "no supporting evidence" in gap["blocks"]
    feed = ok(client.get(f"/api/investigations/{inv}/decisions"))
    assert feed["items"][0]["id"] == gap["id"]  # the highest-ranked missing value in an otherwise quiet case
