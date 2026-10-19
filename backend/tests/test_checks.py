"""To check (app/patterns/checks.py): checklist items from what a flag's
records cannot show, passages from an indicator's words, a person's decision
kept across recomputes, and items that are no longer called for."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, Source
from app.patterns import checks
from app.patterns.checks import CheckSpec, PassageExample
from app.patterns.engine import _catalogue

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str) -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def _party(inv: str, name: str, schema: str = "Company") -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name, "properties": {"name": [name]}}))["id"]


def _chain(inv: str) -> list[str]:
    chain = [_party(inv, f"Layer {i}") for i in range(7)]
    for upper, lower in zip(chain, chain[1:]):
        ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": upper,
                                                   "target_entity_id": lower, "properties": {}}))
    return chain


def test_what_a_flag_cannot_show_becomes_a_checklist_item_linked_both_ways():
    inv = _inv("Checks: layers")
    chain = _chain(inv)
    body = ok(client.get(f"/api/investigations/{inv}/checks"))
    item = next(i for i in body["items"] if i["indicator_id"] == "BO-002")
    assert item["kind"] == "checklist" and item["status"] == "open"
    assert item["question"] == "whether there is a business reason for the layers"
    assert {p["id"] for p in item["parties"]} <= set(chain) and item["parties"]
    flag = next(f for f in ok(client.get(f"/api/investigations/{inv}/red-flags"))["flags"] if f["indicator_id"] == "BO-002")
    assert item["flag_id"] == flag["id"]
    assert flag["checks"] == [{"id": item["id"], "question": item["question"], "status": "open"}]


def test_a_decision_stays_with_its_item_and_a_dismissed_flag_takes_its_item_away():
    inv = _inv("Checks: decide")
    _chain(inv)
    item = next(i for i in ok(client.get(f"/api/investigations/{inv}/checks"))["items"] if i["indicator_id"] == "BO-002")
    body = ok(client.post(f"/api/checks/{item['id']}/decide", json={"status": "shows", "note": "  Annual report gives no reason  "}))
    decided = next(i for i in body["items"] if i["id"] == item["id"])
    assert decided["status"] == "shows" and decided["note"] == "Annual report gives no reason" and decided["decided_at"]
    again = next(i for i in ok(client.get(f"/api/investigations/{inv}/checks"))["items"] if i["id"] == item["id"])
    assert again["status"] == "shows"
    assert client.post(f"/api/checks/{item['id']}/decide", json={"status": "maybe"}).status_code in (400, 422)
    ok(client.post(f"/api/red-flags/{item['flag_id']}/dismiss", json={"reason": "Known group structure"}))
    body = ok(client.get(f"/api/investigations/{inv}/checks"))
    assert item["id"] not in {i["id"] for i in body["items"]}
    gone = next(i for i in body["gone"] if i["id"] == item["id"])
    assert gone["status"] == "shows" and gone["gone_at"]
    reopened = ok(client.post(f"/api/checks/{item['id']}/decide", json={"status": "open"}))
    assert next(i for i in reopened["gone"] if i["id"] == item["id"])["decided_at"] is None


PASSAGE = CheckSpec(indicator="BO-002", kind="passage", question="Does the passage describe layers hiding the owner?",
                    terms=["nominee director", "bearer shares"], examples=[
                        PassageExample(text="She acted as a nominee director for the firm.", expect=True),
                        PassageExample(text="The director signed the accounts.", expect=False)])


def _document(inv: str, *texts: str) -> str:
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Filing", source_type="upload")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="filing.txt", sha256="0" * 64, storage_path="/dev/null")
        db.add(doc)
        db.flush()
        for n, text in enumerate(texts):
            db.add(DocumentChunk(document_id=doc.id, locator=f"p{n + 1}", ordinal=n, text=text))
        db.commit()
        return doc.id


def test_a_passage_with_the_indicators_words_is_an_item_naming_the_parties_in_it():
    inv = _inv("Checks: passages")
    harbour = _party(inv, "Harbour Nominees Ltd")
    doc = _document(inv, "Harbour Nominees Ltd supplied a Nominee\nDirector to every company in the group.",
                    "The board met twice in 2019.", "A nominee directorship is a different word.")
    with SessionLocal() as db:
        checks.recompute(db, inv, (PASSAGE,))
        body = checks.items(db, inv)
    passages = [i for i in body["items"] if i["kind"] == "passage"]
    assert len(passages) == 1
    p = passages[0]
    assert p["document"] == {"id": doc, "filename": "filing.txt"} and p["locator"] == "p1"
    assert p["terms"] == ["nominee director"] and "Nominee Director" in p["excerpt"]
    assert [x["id"] for x in p["parties"]] == [harbour]
    assert p["question"] == PASSAGE.question and p["flag_id"] is None


def test_passage_specs_are_linted_and_need_terms():
    assert checks.problems((PASSAGE,), _catalogue()) == []
    wrong = PASSAGE.model_copy(update={"indicator": "XX-001", "examples": [PassageExample(text="bearer shares", expect=False)]})
    found = checks.problems((wrong, wrong), _catalogue())
    assert any("two check specs" in f for f in found) and any("not in the catalogue" in f for f in found)
    assert any("one that is not" in f for f in found) and any("should not be found" in f for f in found)
    with pytest.raises(ValueError):
        CheckSpec(indicator="BO-002", kind="passage", question="q")
    with pytest.raises(ValueError):
        CheckSpec(indicator="BO-002", kind="passage", question="q", terms=["a"], min_terms=2)


def test_a_checklist_spec_gives_one_item_per_party_of_its_kind():
    inv = _inv("Checks: people")
    person = _party(inv, "Ana Diaz", "Person")
    _party(inv, "Diaz Holdings", "Company")
    spec = CheckSpec(indicator="BO-002", kind="checklist", question="Has this person been asked who they act for?", for_each="Person")
    case = CheckSpec(indicator="BO-001", kind="checklist", question="Has the company registry been asked for the full chain?")
    with SessionLocal() as db:
        checks.recompute(db, inv, (spec, case))
        items = checks.items(db, inv)["items"]
    assert {(i["indicator_id"], tuple(p["id"] for p in i["parties"])) for i in items} == {("BO-002", (person,)), ("BO-001", ())}


def test_the_catalogue_check_specs_pass_the_lint():
    assert checks.problems(checks.load(), _catalogue()) == []


@pytest.mark.parametrize(("part", "question"), [
    ("whether there was a business reason for the payments", "Was there a business reason for the payments?"),
    ("whether the fund is still trading.", "Is the fund still trading?"),
    ("whether they were related", "Were they related?"),
    ("who signed the transfer", "Who signed the transfer?"),
    ("", ""),
])
def test_a_whether_clause_reads_as_a_question(part: str, question: str) -> None:
    from app.patterns.checks import as_question
    assert as_question(part) == question
