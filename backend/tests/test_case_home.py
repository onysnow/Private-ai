"""Case home and Decide (app/services/case_home.py): the case question, the
standing numbers counted on the server, one ranked list of decisions whose
choices post to the existing endpoints, and what changed since a moment."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, ExtractionCandidate, Source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str, **extra) -> str:
    return ok(client.post("/api/investigations", json={"name": name, **extra}))["id"]


def _party(inv: str, name: str, schema: str = "Company") -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name, "properties": {"name": [name]}}))["id"]


def _chain(inv: str) -> list[str]:
    chain = [_party(inv, f"Layer {i}") for i in range(7)]
    for upper, lower in zip(chain, chain[1:]):
        ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": upper,
                                                   "target_entity_id": lower, "properties": {}}))
    return chain


def _proposal(inv: str, *, kind: str = "claim", payload: dict) -> str:
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Board minutes", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.txt", sha256="1" * 64, storage_path="/dev/null",
                       extraction_status="complete")
        db.add(doc)
        db.flush()
        chunk = DocumentChunk(document_id=doc.id, locator="p4", ordinal=0, text="The Board approved the acquisition of the harbour parcel.")
        db.add(chunk)
        db.flush()
        row = ExtractionCandidate(investigation_id=inv, document_id=doc.id, chunk_id=chunk.id, candidate_type=kind, payload=payload, confidence=0.9)
        db.add(row)
        db.commit()
        return row.id


def test_the_case_question_is_set_changed_and_cleared():
    inv = _inv("Harbour", question="  Who really owns the harbour land?  ")
    assert next(i for i in ok(client.get("/api/investigations")) if i["id"] == inv)["question"] == "Who really owns the harbour land?"
    body = ok(client.patch(f"/api/investigations/{inv}", json={"question": "Who paid for it?"}))
    assert body["question"] == "Who paid for it?" and body["name"] == "Harbour"
    assert ok(client.patch(f"/api/investigations/{inv}", json={"name": "Harbour land"}))["question"] == "Who paid for it?"
    assert ok(client.patch(f"/api/investigations/{inv}", json={"question": ""}))["question"] is None
    assert client.patch("/api/investigations/nope", json={"question": "x"}).status_code == 404


def test_standing_counts_on_the_server():
    inv = _inv("Standing")
    empty = ok(client.get(f"/api/investigations/{inv}/standing"))
    assert empty["claims"]["total"] == 0 and empty["to_decide"] == 0 and empty["money"] == {"currency": None, "amount": 0.0, "payments": 0, "from_sources": 0, "other_currencies": []}
    assert empty["timeline"] == {"events": 0, "from": None, "to": None, "years": []}
    for status in ("supported", "confirmed", "disputed", "lead"):
        ok(client.post("/api/claims", json={"investigation_id": inv, "text": f"A {status} claim", "status": status, "confidence": 0.5}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Board meets", "date_start": "2017-03-04"}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Transfer", "date_start": "2018-03-14"}))
    _chain(inv)
    ok(client.get(f"/api/investigations/{inv}/decisions"))  # recomputes the flags
    body = ok(client.get(f"/api/investigations/{inv}/standing"))
    assert body["claims"] == {"total": 4, "supported": 2, "disputed": 1, "unshown": 1, "ruled_out": 0}
    assert body["timeline"]["from"] == "2017" and body["timeline"]["to"] == "2018" and body["timeline"]["events"] == 2
    assert body["network"]["links"] == 6 and body["network"]["parties"] >= 7
    assert body["flags"]["open"] >= 1


def test_decisions_merge_kinds_rank_by_consequence_and_post_to_existing_endpoints():
    inv = _inv("Decide")
    _chain(inv)
    claim = _proposal(inv, payload={"text": "Kestrel SA bought the harbour land in 2020", "quote": "The Board approved the acquisition"})
    body = ok(client.get(f"/api/investigations/{inv}/decisions"))
    kinds = [i["kind"] for i in body["items"]]
    assert "to_check" in kinds and "proposal" in kinds and body["counts"]["proposal"] == 1
    # A To check item from a Red Flag comes before a document proposal.
    assert kinds.index("to_check") < kinds.index("proposal")
    check = next(i for i in body["items"] if i["kind"] == "to_check")
    assert check["reason"].startswith("From the ") and "Red Flag" in check["reason"] and check["level"] in ("faint", "strong", "textbook")
    assert [c["key"] for c in check["choices"]] == ["yes", "no", "unsure"] and check["consequences"]
    proposal = next(i for i in body["items"] if i["id"] == claim)
    assert proposal["question"].startswith("Keep this as a claim to check") and proposal["evidence"]["locator"] == "p4"
    # The choice is the existing endpoint and body: posting it decides the item.
    yes = next(c for c in proposal["choices"] if c["key"] == "yes")
    assert yes["path"] == f"/api/extraction-candidates/{claim}/review"
    ok(client.post(yes["path"], json=yes["body"]))
    no = next(c for c in check["choices"] if c["key"] == "no")
    ok(client.post(no["path"], json=no["body"]))
    after = ok(client.get(f"/api/investigations/{inv}/decisions"))
    assert claim not in {i["id"] for i in after["items"]} and check["id"] not in {i["id"] for i in after["items"]}
    only = ok(client.get(f"/api/investigations/{inv}/decisions", params={"kind": "proposal"}))
    assert only["items"] == []
    assert client.get(f"/api/investigations/{inv}/decisions", params={"kind": "bogus"}).status_code == 422


def test_an_entity_proposal_with_a_same_name_record_asks_same_or_different():
    inv = _inv("Identity")
    existing = _party(inv, "Fernhill Ltd")
    cid = _proposal(inv, kind="entity", payload={"caption": "Fernhill Ltd", "suggested_schema": "Company"})
    item = next(i for i in ok(client.get(f"/api/investigations/{inv}/decisions"))["items"] if i["id"] == cid)
    assert item["question"] == "Is “Fernhill Ltd” in this passage the record Fernhill Ltd?"
    same = next(c for c in item["choices"] if c["key"] == "yes")
    assert same["body"]["entity_identity_decision"] == "same" and same["body"]["matched_entity_id"] == existing
    ok(client.post(same["path"], json=same["body"]))


def test_since_names_what_changed_after_a_moment():
    inv = _inv("Since")
    before = utcnow_naive() - timedelta(seconds=1)
    _chain(inv)
    ok(client.get(f"/api/investigations/{inv}/checks"))  # computes the flags
    body = ok(client.get(f"/api/investigations/{inv}/since", params={"after": before.isoformat()}))
    flags = next(c for c in body["changes"] if c["key"] == "flags")
    assert flags["count"] >= 1 and flags["actor_kind"] == "app" and flags["href"] == "/act#red-flags"
    later = ok(client.get(f"/api/investigations/{inv}/since", params={"after": (utcnow_naive() + timedelta(minutes=1)).isoformat()}))
    assert later["changes"] == []


def test_the_done_rules_for_supported_run_on_the_stored_records(tmp_path):
    import hashlib

    inv = _inv("Done")
    path = tmp_path / "minutes.txt"
    path.write_bytes(b"The Board approved the acquisition of the harbour parcel.")
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Minutes", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.txt", sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="p1", ordinal=0, text="The Board approved the acquisition of the\nharbour parcel."))
        db.commit()
        src_id = src.id
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "The Board approved it", "status": "unverified", "confidence": 0}))
    workspace = ok(client.get(f"/api/claims/{claim['id']}/review-workspace"))
    assert workspace["done"]["supported"]["left"] >= 1 and workspace["done"]["supported"]["rules"][0]["state"] == "not_met"
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": "approved the acquisition of the harbour parcel", "locator": "p1"}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))
    done = ok(client.get(f"/api/claims/{claim['id']}/review-workspace"))["done"]
    assert done["supported"]["met"] is True, done["supported"]["rules"]
    assert {r["key"]: r["state"] for r in done["supported"]["rules"]}["says_it"] == "met"
    # Confirmed also wants a second independent source or a public record.
    assert done["confirmed"]["met"] is False and done["confirmed"]["rules"][-1]["key"] == "independent"
    ok(client.post(f"/api/claims/{claim['id']}/reviews", json={"status": "supported", "confidence": 0.8, "rationale": "The minutes say so."}))
    # The file changes: the fingerprint rule fails.
    path.write_bytes(b"tampered")
    rules = {r["key"]: r for r in ok(client.get(f"/api/claims/{claim['id']}/review-workspace"))["done"]["supported"]["rules"]}
    assert rules["file"]["state"] == "not_met" and "minutes.txt" in rules["file"]["detail"]


def test_money_traced_counts_each_sum_once_where_it_starts():
    inv = _inv("Layers")
    a, b, c = (_party(inv, n) for n in ("Fund", "Shell One", "Shell Two"))
    for src, dst in ((a, b), (b, c)):
        ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": src, "target_entity_id": dst,
                                                   "properties": {"amount": ["700000000"], "currency": ["USD"], "date": ["2009-09-30"]}}))
    money = ok(client.get(f"/api/investigations/{inv}/standing"))["money"]
    assert money == {"currency": "USD", "amount": 700000000.0, "payments": 2, "from_sources": 1, "other_currencies": []}
