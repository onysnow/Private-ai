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
from tests.claim_helpers import post_claim

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


def _run(inv: str) -> None:
    """Runs the rules and brings To check up to date, as a screen does when the read says they are behind."""
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))


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
        ok(post_claim(client, {"investigation_id": inv, "text": f"A {status} claim", "status": status, "confidence": 0.5}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Board meets", "date_start": "2017-03-04"}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Transfer", "date_start": "2018-03-14"}))
    _chain(inv)
    _run(inv)
    body = ok(client.get(f"/api/investigations/{inv}/standing"))
    assert body["claims"] == {"total": 4, "supported": 2, "disputed": 1, "unshown": 1, "ruled_out": 0}
    assert body["timeline"]["from"] == "2017" and body["timeline"]["to"] == "2018" and body["timeline"]["events"] == 2
    assert body["network"]["links"] == 6 and body["network"]["parties"] >= 7
    assert body["flags"]["open"] >= 1


def test_decisions_merge_kinds_rank_by_consequence_and_post_to_existing_endpoints():
    inv = _inv("Decide")
    _chain(inv)
    claim = _proposal(inv, payload={"text": "Kestrel SA bought the harbour land in 2020", "quote": "The Board approved the acquisition"})
    _run(inv)
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


def test_reading_the_decisions_never_writes_and_shows_what_the_last_run_left():
    from app.api.routes_case_home import get_decisions
    from app.core.authorization import AuthorizationScope, authorization_scope_context
    from tests.stored_rules_rows import stored

    inv = _inv("Decide: reading never writes")
    chain = _chain(inv)
    before = stored(inv)
    assert before == {"flags": {}, "checks": {}, "run": None}
    body = ok(client.get(f"/api/investigations/{inv}/decisions"))
    assert "to_check" not in body["counts"] or body["counts"]["to_check"] == 0, "never run: no To check item yet"
    assert stored(inv) == before, "reading the decisions runs no rule and adds no item"
    assert ok(client.get(f"/api/investigations/{inv}/red-flags"))["stale"] is True

    _run(inv)
    ran = stored(inv)
    body = ok(client.get(f"/api/investigations/{inv}/decisions"))
    assert "to_check" in {i["kind"] for i in body["items"]} and "missing" in {i["kind"] for i in body["items"]}
    assert stored(inv) == ran, "no flag or item added, none marked gone, no time moved"
    ok(client.get(f"/api/investigations/{inv}/decisions", params={"kind": "to_check", "order": "oldest"}))
    assert stored(inv) == ran

    ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": chain[-1],
                                               "target_entity_id": chain[0], "properties": {}}))
    assert [i["id"] for i in ok(client.get(f"/api/investigations/{inv}/decisions"))["items"]] == [i["id"] for i in body["items"]]
    assert stored(inv) == ran
    assert ok(client.get(f"/api/investigations/{inv}/red-flags"))["stale"] is True
    with SessionLocal() as db, authorization_scope_context(AuthorizationScope("reader-1", frozenset({inv}), role="viewer")):
        read = get_decisions(inv, db, kind=None, order="consequence", offset=0, limit=200)
    assert [i["id"] for i in read["items"]] == [i["id"] for i in body["items"]], "a reader reads the stored decisions"
    assert stored(inv) == ran
    _run(inv)
    assert stored(inv) != ran, "the run is what brings them up to date"
    assert ok(client.get(f"/api/investigations/{inv}/red-flags"))["stale"] is False


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
    _run(inv)
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
    claim = ok(post_claim(client, {"investigation_id": inv, "text": "The Board approved it", "status": "unverified", "confidence": 0}))
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


def test_a_proposal_shows_the_passage_around_it_not_the_top_of_the_page():
    from app.services.case_home import around
    page = "UNITED STATES DISTRICT COURT " * 30 + "The Company acknowledges and agrees to the filing. " + "Later text " * 50
    start = page.find("The Company")
    shown = around(page, start, start + 50)
    assert "The Company acknowledges and agrees to the filing." in shown
    assert shown.startswith("… ") and shown.endswith(" …") and len(shown) < 520
    assert around("A short page.", 2, 7) == "A short page."


def test_a_checklist_question_names_its_parties():
    from app.services.case_home import _with_parties
    names = {"a": ("Granton", "Company"), "b": ("Tanore", "Company"), "c": ("Tan Kim Loong", "Person"), "d": ("Blackstone", "Company")}
    q = "Was there a business reason for the payments?"
    assert _with_parties(q, ["a", "b", "c"], names) == "Was there a business reason for the payments (Granton, Tanore and Tan Kim Loong)?"
    assert _with_parties(q, ["a", "b", "c", "d"], names).endswith("(Granton, Tanore and Tan Kim Loong and 1 more)?")
    assert _with_parties(q, [], names) == q


def test_a_table_row_card_names_the_rows_facts_shows_its_cells_and_what_the_case_already_holds():
    inv = _inv("Ledger rows")
    payer, payee = _party(inv, "Meridian Holdings Ltd"), _party(inv, "Bellcastle Trading Group")
    ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": payer, "target_entity_id": payee,
                                               "properties": {"amount": ["5000000"], "currency": ["GBP"]}}))
    ledger = b"Date;Payer;Payee;Amount;Currency\n2011-05-23;Meridian Holdings Ltd;Bellcastle Trading Group;2400000;USD\n"
    doc = ok(client.post("/api/documents/upload", data={"investigation_id": inv, "title": "ledger.csv"},
                         files={"file": ("ledger.csv", ledger, "text/csv")}))
    mapping = {
        "payer": {"schema": "Company", "keys": ["Payer"], "properties": {"name": {"column": "Payer"}}},
        "payee": {"schema": "LegalEntity", "keys": ["Payee"], "properties": {"name": {"column": "Payee"}}},
        "payment": {"schema": "Payment", "keys": ["Date", "Payer", "Payee", "Amount"], "properties": {
            "payer": {"entity": "payer"}, "beneficiary": {"entity": "payee"}, "amount": {"column": "Amount"},
            "currency": {"column": "Currency"}, "date": {"column": "Date"}}},
    }
    ok(client.post(f"/api/documents/{doc['id']}/table-mappings", json={"entities": mapping}))
    items = [i for i in ok(client.get(f"/api/investigations/{inv}/decisions", params={"kind": "proposal"}))["items"]
             if i["evidence"] and i["evidence"]["filename"] == "ledger.csv"]
    link = next(i for i in items if i["question"].startswith("Does row"))
    assert link["question"] == "Does row 2 show a payment of $2,400,000 from Meridian Holdings Ltd to Bellcastle Trading Group on 23 May 2011?"
    assert link["evidence"]["rows"] == [{"number": 2, "cells": {"Date": "2011-05-23", "Payer": "Meridian Holdings Ltd",
                                                                "Payee": "Bellcastle Trading Group", "Amount": "2400000", "Currency": "USD"}}]
    assert link["known"] == ["Already in the case: £5,000,000 from Meridian Holdings Ltd to Bellcastle Trading Group, no date"]
    name = next(i for i in items if "Bellcastle" in i["question"] and i is not link and i["evidence"]["rows"])
    assert name["question"] == "Is “Bellcastle Trading Group” in row 2 the record Bellcastle Trading Group?"
    assert name["choices"][0]["happens"] == "These rows are added to Bellcastle Trading Group; no new record."
    assert name["evidence"]["rows"][0]["number"] == 2 and name["known"] == []


def test_table_text_helpers_write_only_what_the_values_hold():
    from app.services.case_home import _amount_text, _date_text, _rows_phrase, _table_rows
    assert _amount_text("65000000", "usd") == "$65,000,000" and _amount_text("12.5", "MYR") == "MYR 12.50" and _amount_text("lots", None) == "lots"
    assert (_date_text("2011-05-23"), _date_text("2011-05"), _date_text("2011")) == ("23 May 2011", "May 2011", "2011")
    assert (_rows_phrase([3]), _rows_phrase([3, 4]), _rows_phrase([3, 4, 5]), _rows_phrase(list(range(1, 9)))) == (
        "row 3", "rows 3 and 4", "rows 3, 4 and 5", "8 rows")
    # Proposals made before the cells were kept: read back from the joined text.
    assert _table_rows({"rows": [2, 5], "row_text": "Payer: A; Amount: 1\nPayer: B"}) == [
        {"number": 2, "cells": {"Payer": "A", "Amount": "1"}}, {"number": 5, "cells": {"Payer": "B"}}]


def test_a_party_lights_the_years_of_its_links_and_events():
    from app.services.case_years import years_of_properties
    assert years_of_properties({"startDate": ["2014-02"], "endDate": ["2016"]}) == {2014, 2015, 2016}
    assert years_of_properties({"date": ["unknown"]}) == set()
    inv = _inv("Years")
    a, b, c = (_party(inv, n) for n in ("Meridian", "Bellcastle", "Harbour Trust"))
    ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": a, "target_entity_id": b,
                                               "properties": {"startDate": ["2015-03-01"], "endDate": ["2017-06-30"]}}))
    ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": b, "target_entity_id": c,
                                               "properties": {"amount": ["9800"], "currency": ["USD"], "date": ["2019-01-04"]}}))
    assert ok(client.get(f"/api/entities/{a}/years"))["years"] == [2015, 2016, 2017]
    assert ok(client.get(f"/api/entities/{b}/years"))["years"] == [2015, 2016, 2017, 2019]
    assert client.get("/api/entities/nope/years").status_code == 404


def test_each_claim_names_the_source_it_rests_on_first():
    inv = _inv("Sources")
    claim = ok(post_claim(client, {"investigation_id": inv, "text": "Meridian paid Bellcastle", "status": "unverified", "confidence": 0.5}))["id"]
    ok(post_claim(client, {"investigation_id": inv, "text": "Nothing linked", "status": "unverified", "confidence": 0.5}))

    def evidence(title, locator):
        src = ok(client.post("/api/sources", json={"investigation_id": inv, "title": title, "source_type": "document"}))["id"]
        return ok(client.post("/api/evidence", json={"source_id": src, "quote": "paid", "locator": locator}))["id"]

    ok(client.post(f"/api/claims/{claim}/evidence", json={"evidence_id": evidence("Press release", "para 2"), "stance": "contradicts"}))
    ok(client.post(f"/api/claims/{claim}/evidence", json={"evidence_id": evidence("Board minutes", "p. 4"), "stance": "supports"}))
    assert ok(client.get(f"/api/investigations/{inv}/claim-sources")) == [
        {"claim_id": claim, "source": "Board minutes", "locator": "p. 4", "count": 2, "sources_for": 1, "sources_against": 1,
         "names": ["Board minutes", "Press release"], "leads_open": 0}]


def test_a_page_is_drawn_with_its_passage_marked(tmp_path, monkeypatch):
    import fitz

    from app.core.config import settings
    from app.services.page_image import _phrases

    assert _phrases("") == []
    assert _phrases("one two three four five six seven")[1:] == ["one two three four five six", "seven"]
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    path = tmp_path / "minutes.pdf"
    pdf = fitz.open()
    for n in (1, 2):
        pdf.new_page().insert_text((72, 72), f"Page {n}. The parcel was bought on behalf of Fernhill Ltd.")
    pdf.save(path); pdf.close()
    inv = _inv("Pages")
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Minutes", source_type="document")
        db.add(src); db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.pdf", sha256="x", storage_path=str(path), extraction_status="complete")
        db.add(doc); db.commit()
        doc_id = doc.id
    reply = client.get(f"/api/documents/{doc_id}/page-image", params={"page": 2, "width": 200, "highlight": "on behalf of Fernhill"})
    assert reply.status_code == 200 and reply.headers["content-type"] == "image/png"
    assert reply.headers["x-page-count"] == "2" and reply.headers["x-passage-found"] == "1"
    assert fitz.Pixmap(reply.content).width == 200
    assert client.get(f"/api/documents/{doc_id}/page-image", params={"highlight": "not on the page"}).headers["x-passage-found"] == "0"
    assert client.get(f"/api/documents/{doc_id}/page-image", params={"page": 3}).status_code == 404


def _doc_with_pages(inv: str, pages: dict[int, list[tuple[str, float]]]) -> tuple[str, dict[int, list[str]]]:
    """A document whose pages each carry claim proposals (text, confidence); returns its id and the proposal ids per page."""
    ids: dict[int, list[str]] = {}
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Filing", source_type="document")
        db.add(src); db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="filing.pdf", sha256="2" * 64, storage_path="/dev/null", extraction_status="complete")
        db.add(doc); db.flush()
        for number, proposals in pages.items():
            chunk = DocumentChunk(document_id=doc.id, locator=f"p. {number}", page_number=number, ordinal=number, text=f"Page {number} text.")
            db.add(chunk); db.flush()
            for text, confidence in proposals:
                row = ExtractionCandidate(investigation_id=inv, document_id=doc.id, chunk_id=chunk.id, candidate_type="claim",
                                          payload={"text": text}, confidence=confidence)
                db.add(row); db.flush()
                ids.setdefault(number, []).append(row.id)
        db.commit()
        return doc.id, ids


def test_a_document_group_counts_the_pages_read_and_each_answer_says_what_it_does():
    inv = _inv("Pages read")
    doc, ids = _doc_with_pages(inv, {1: [("Kestrel SA paid in 2020", 0.9)], 2: [("The parcel was sold", 0.6), ("A second sale", 0.9)],
                                     3: [("The board met", 0.3)]})
    items = [i for i in ok(client.get(f"/api/investigations/{inv}/decisions", params={"order": "source"}))["items"] if i["group"]["key"] == f"doc:{doc}"]
    assert {i["group"]["pages"] for i in items} == {3} and {i["group"]["pages_read"] for i in items} == {0}
    assert sorted(i["confidence_band"] for i in items) == ["high", "high", "low", "medium"]
    first = next(i for i in items if i["id"] == ids[1][0])
    yes, no = first["choices"]
    assert yes["happens"].startswith("Creates the claim as Not yet shown") and no["happens"] == "Marked rejected, with your reason; no claim is made."
    # The reason chosen under No is stored with the rejection.
    ok(client.post(no["path"], json={**no["body"], "note": "Misread"}))
    with SessionLocal() as db:
        assert db.get(ExtractionCandidate, ids[1][0]).reviewer_note == "Misread"
    # Page 1 has nothing left; page 2 still has one of its two.
    ok(client.post(f"/api/extraction-candidates/{ids[2][0]}/review", json={"decision": "reject"}))
    items = [i for i in ok(client.get(f"/api/investigations/{inv}/decisions"))["items"] if i["group"]["key"] == f"doc:{doc}"]
    assert {(i["group"]["pages"], i["group"]["pages_read"]) for i in items} == {(3, 1)}


def test_a_table_document_gets_no_page_count():
    from app.services.case_home import _page_of
    assert _page_of("p4") == 4 and _page_of("page 12 (OCR)") == 12 and _page_of("row 2") is None and _page_of(None) is None
    inv = _inv("No pages")
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Ledger", source_type="document")
        db.add(src); db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="ledger.csv", sha256="3" * 64, storage_path="/dev/null", extraction_status="complete")
        db.add(doc); db.flush()
        db.add(ExtractionCandidate(investigation_id=inv, document_id=doc.id, candidate_type="claim", payload={"text": "A row", "locator": "row 2"}, confidence=0.9))
        db.commit()
    item = ok(client.get(f"/api/investigations/{inv}/decisions"))["items"][0]
    assert item["group"]["pages"] is None and item["group"]["pages_read"] is None
