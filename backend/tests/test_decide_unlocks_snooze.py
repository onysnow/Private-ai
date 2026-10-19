"""Decide: sort by what answering Yes would unlock (a dry run that writes nothing), and H, putting a decision off
until a time or until the item changes (app/services/decision_unlocks.py, app/services/decision_snoozes.py)."""

from __future__ import annotations

import hashlib
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import (
    Claim, DecisionSnooze, Document, DocumentChunk, ExtractionCandidate, PatternFlag, RelationshipEdge, Source,
)

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str) -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def _party(inv: str, name: str, schema: str = "Company", **props: list[str]) -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name,
                                                 "properties": {"name": [name], **props}}))["id"]


def _own(inv: str, upper: str, lower: str) -> None:
    ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": upper,
                                               "target_entity_id": lower, "properties": {}}))


def _doc(inv: str, tmp_path, text: str = "The Board approved the acquisition of the harbour parcel.") -> tuple[str, str]:
    path = tmp_path / f"{inv}.txt"
    path.write_bytes(text.encode())
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Minutes", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.txt", sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        chunk = DocumentChunk(document_id=doc.id, locator="p1", ordinal=0, text=text)
        db.add(chunk)
        db.commit()
        return doc.id, chunk.id


def _candidate(inv: str, doc: str, chunk: str, kind: str, payload: dict) -> str:
    with SessionLocal() as db:
        row = ExtractionCandidate(investigation_id=inv, document_id=doc, chunk_id=chunk, candidate_type=kind, payload=payload, confidence=0.6)
        db.add(row)
        db.commit()
        return row.id


def _decisions(inv: str, **params) -> dict:
    return ok(client.get(f"/api/investigations/{inv}/decisions", params=params))


def _item(body: dict, item_id: str) -> dict:
    return next(i for i in body["items"] if i["id"] == item_id)


def _written(inv: str) -> tuple[int, int, int]:
    with SessionLocal() as db:
        return tuple(int(db.scalar(select(func.count()).select_from(m).where(m.investigation_id == inv)) or 0)
                     for m in (RelationshipEdge, PatternFlag, Claim))  # type: ignore[return-value]


def test_a_claim_whose_done_rules_would_all_be_met_unlocks_one_supported_claim(tmp_path):
    inv = _inv("Unlocks claims")
    doc, chunk = _doc(inv, tmp_path)
    good = _candidate(inv, doc, chunk, "claim", {"text": "The Board approved the acquisition"})
    # Its words are not in the document: the "says it" rule would not be met.
    bad = _candidate(inv, doc, chunk, "claim", {"text": "The Board refused the acquisition"})
    body = _decisions(inv)
    assert _item(body, good)["unlocks"] == {
        "score": 1, "claims": 1, "flags": 0, "chains": 0, "counted": True, "words": "unlocks: 1 claim supported",
        "lines": ["The claim would meet every Done rule for Supported, with this passage as its support"], "flag_changes": []}
    assert _item(body, bad)["unlocks"]["score"] == 0 and _item(body, bad)["unlocks"]["words"] == ""
    # Most consequence first: the claim that unlocks something leads.
    assert [i["id"] for i in body["items"]][:2] == [good, bad]
    # And the dry run is what accepting it does.
    yes = next(c for c in _item(body, good)["choices"] if c["key"] == "yes")
    record = ok(client.post(yes["path"], json=yes["body"]))["record"]
    assert ok(client.get(f"/api/claims/{record['id']}/review-workspace"))["done"]["supported"]["met"] is True


def test_a_link_that_lengthens_a_chain_raises_a_flag_and_joins_two_groups_without_writing(tmp_path):
    inv = _inv("Unlocks links")
    a, b, c, d, e = (_party(inv, f"Layer {n}") for n in "ABCDE")
    _own(inv, a, b)
    _own(inv, b, c)
    _own(inv, d, e)
    doc, chunk = _doc(inv, tmp_path, "Layer C owns Layer D.")
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Layer C owns Layer D", "status": "lead", "confidence": 0.5}))["id"]
    link = _candidate(inv, doc, chunk, "relationship", {"schema": "Ownership", "source_entity_id": c, "target_entity_id": d,
                                                         "caption": "Layer C → Layer D", "claim_id": claim, "properties": {}})
    loop = _candidate(inv, doc, chunk, "relationship", {"schema": "Ownership", "source_entity_id": a, "target_entity_id": b,
                                                         "caption": "Layer A → Layer B again", "claim_id": claim, "properties": {}})
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    before = _written(inv)
    body = _decisions(inv)
    unlocks = _item(body, link)["unlocks"]
    assert unlocks["flags"] == 1 and unlocks["chains"] == 1 and unlocks["score"] == 2
    assert unlocks["words"] == "unlocks: 1 Red Flag rises, 1 chain completed"
    change = unlocks["flag_changes"][0]
    assert change["indicator_id"] == "BO-002" and change["from_level"] is None and change["to_level"] == "faint"
    assert change["text"].startswith("▯▯▯ → ▮▯▯ ")
    assert any(line.startswith("Joins Layer C's group (3 parties) to Layer D's (2)") for line in unlocks["lines"])
    # A second link between two parties already linked completes nothing.
    assert _item(body, loop)["unlocks"]["score"] == 0
    assert body["items"][0]["id"] == link
    assert _written(inv) == before


def test_a_new_record_sharing_an_address_raises_the_shared_address_flag(tmp_path):
    inv = _inv("Unlocks names")
    _party(inv, "Harbour Nominees Ltd", address=["1 Harbour Road, St Helier"])
    doc, chunk = _doc(inv, tmp_path, "Kestrel SA, of 1 Harbour Road, St Helier.")
    name = _candidate(inv, doc, chunk, "entity", {"caption": "Kestrel SA", "suggested_schema": "Company",
                                                   "properties": {"address": ["1 Harbour Road, St Helier"]}})
    same = _candidate(inv, doc, chunk, "entity", {"caption": "Harbour Nominees Ltd", "suggested_schema": "Company",
                                                   "properties": {"address": ["1 Harbour Road, St Helier"]}})
    body = _decisions(inv)
    unlocks = _item(body, name)["unlocks"]
    assert unlocks["words"] == "unlocks: 1 Red Flag rises" and unlocks["flag_changes"][0]["indicator_id"] == "BO-032"
    # A name the case already holds asks same-or-new; its Yes adds no record.
    assert _item(body, same)["unlocks"]["score"] == 0


def test_other_kinds_unlock_nothing_and_other_orders_keep_their_order(tmp_path):
    inv = _inv("Unlocks none")
    for n in range(5):
        _own(inv, _party(inv, f"Top {n}"), _party(inv, f"Bottom {n}"))
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    body = _decisions(inv, order="oldest")
    assert body["items"] and all(i["unlocks"]["score"] == 0 for i in body["items"])
    assert [i["created_at"] for i in body["items"]] == sorted(i["created_at"] for i in body["items"])


def test_h_puts_a_decision_off_until_it_changes_and_z_brings_it_back():
    inv = _inv("Snooze")
    for n in range(2):
        _own(inv, _party(inv, f"Holder {n}"), _party(inv, f"Held {n}"))
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    body = _decisions(inv)
    item = body["items"][0]
    counts = dict(body["counts"])
    put_off = ok(client.post(f"/api/investigations/{inv}/decision-snoozes", json={"kind": item["kind"], "item_id": item["id"]}))
    assert put_off["wake_on_activity"] is True and put_off["until"] is None and put_off["question"] == item["question"]
    after = _decisions(inv)
    assert item["id"] not in {i["id"] for i in after["items"]} and after["snoozed"] == 1 and after["total"] == body["total"] - 1
    assert after["counts"].get(item["kind"], 0) == counts[item["kind"]] - 1
    standing = ok(client.get(f"/api/investigations/{inv}/standing"))
    assert standing["to_decide"] == after["total"], "Case home's to-decide leaves out what is put off, as Decide does"
    asleep = _decisions(inv, snoozed="true")
    assert [i["id"] for i in asleep["items"]] == [item["id"]] and asleep["items"][0]["snooze"]["state"] == "asleep"
    # Restore (or Z right after H).
    assert ok(client.post(f"/api/investigations/{inv}/decision-snoozes/wake", json={"kind": item["kind"], "item_id": item["id"]}))["woke"] is True
    back = _decisions(inv)
    assert item["id"] in {i["id"] for i in back["items"]} and back["snoozed"] == 0 and _item(back, item["id"])["snooze"] is None
    assert ok(client.post(f"/api/investigations/{inv}/decision-snoozes/wake", json={"kind": item["kind"], "item_id": item["id"]}))["woke"] is False

    # New activity on the item wakes it: here what it asks changes.
    ok(client.post(f"/api/investigations/{inv}/decision-snoozes", json={"kind": item["kind"], "item_id": item["id"]}))
    with SessionLocal() as db:
        from app.models.domain import CheckItem

        row = db.get(CheckItem, item["id"])
        assert row is not None
        row.question = row.question + " (asked again)"
        db.commit()
    woke = _item(_decisions(inv), item["id"])
    assert woke["snooze"]["state"] == "woke" and woke["snooze"]["why"] == "It changed since you put it off."


def test_a_decision_put_off_until_a_time_comes_back_then_and_bad_requests_are_refused():
    inv = _inv("Snooze time")
    _own(inv, _party(inv, "Holder"), _party(inv, "Held"))
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    item = _decisions(inv)["items"][0]
    url = f"/api/investigations/{inv}/decision-snoozes"
    until = (utcnow_naive() + timedelta(days=1)).isoformat()
    assert ok(client.post(url, json={"kind": item["kind"], "item_id": item["id"], "until": until, "wake_on_activity": False}))["until"]
    assert _decisions(inv)["snoozed"] == 1
    with SessionLocal() as db:
        row = db.scalar(select(DecisionSnooze).where(DecisionSnooze.investigation_id == inv))
        assert row is not None
        row.until = utcnow_naive() - timedelta(minutes=1)
        db.commit()
    woke = _item(_decisions(inv), item["id"])
    assert woke["snooze"]["state"] == "woke" and woke["snooze"]["why"] == "The time you set has come."
    assert client.post(url, json={"kind": item["kind"], "item_id": item["id"], "wake_on_activity": False}).status_code == 400
    past = (utcnow_naive() - timedelta(hours=1)).isoformat()
    assert client.post(url, json={"kind": item["kind"], "item_id": item["id"], "until": past}).status_code == 400
    assert client.post(url, json={"kind": "proposal", "item_id": "nothing-here"}).status_code == 404
    assert client.post("/api/investigations/nope/decision-snoozes", json={"kind": "proposal", "item_id": "x"}).status_code == 404
