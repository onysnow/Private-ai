"""Email and phone proposals: the reporter says whose they are (ADR-0006).

OpenAleph's ftm-analyze finds email addresses and phone numbers but not
their owner. Accepting one needs the entity it belongs to; the value is then
a reviewed statement on that entity, pointing at the place in the document.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Entity, ExtractionCandidate, Investigation, Statement
from app.services.documents import extract_document, store_document
from app.services.exports import build_investigation_export, inspect_export
from app.services.openaleph_analysis import Analysis, import_analysis_proposals

client = TestClient(app)
TEXT = "Contract file.\n\nJane Doe signed for Meridian Holdings Ltd. Reach her at jane.doe@meridian.example or +44 20 7946 0958."


def _ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


@pytest.fixture()
def case(tmp_path):
    """A document read by OpenAleph with its analysis imported: two entity
    proposals (Person, Address), an email and a phone proposal."""
    with SessionLocal() as db:
        inv = Investigation(name="Owners")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = store_document(db, investigation_id=inv.id, title="Contract", filename="contract.txt", mime_type="text/plain",
                             data=TEXT.encode(), storage_dir=tmp_path / "docs")
        chunks = [{"locator": f"paragraph {i}", "page_number": None, "text": part,
                   "provenance": {"provider": "openaleph", "collection_id": "7", "extraction_method": "openaleph_ingest_file"}}
                  for i, part in enumerate(TEXT.split("\n\n"), 1)]
        extract_document(db, doc.id, text=(chunks, []), find_names=False)
        import_analysis_proposals(db, doc.id, Analysis(collection_id="7", entity_id="e1", schema="PlainText", properties={
            "peopleMentioned": ["jane doe"], "locationMentioned": ["meridian holdings ltd"],
            "emailMentioned": ["jane.doe@meridian.example"], "phoneMentioned": ["+442079460958"], "detectedLanguage": ["eng"]}))
        other = Investigation(name="Elsewhere")
        db.add(other); db.commit(); db.refresh(other)
        foreign = Entity(investigation_id=other.id, ftm_id="f1", schema="Person", caption="Somebody Else", properties={"name": ["Somebody Else"]})
        db.add(foreign); db.commit(); db.refresh(foreign)
        rows = {}
        for row in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id,
                                                                ExtractionCandidate.candidate_type.in_(("entity", "identifier")))):
            rows[row.payload.get("kind") or row.payload["suggested_schema"]] = row.id
        return {"inv": inv.id, "doc": doc.id, "foreign": foreign.id, **rows}


def _entity(case, caption, schema="Person"):
    return _ok(client.post("/api/entities", json={"investigation_id": case["inv"], "schema": schema, "caption": caption,
                                                  "properties": {}, "dataset": "reporter", "origin": "test"}))["id"]


def test_accepting_needs_the_entity_it_belongs_to(case):
    review = f"/api/extraction-candidates/{case['email']}/review"
    reply = client.post(review, json={"decision": "accept"})
    assert reply.status_code == 400
    assert reply.json()["detail"] == "Choose which entity an email address belongs to before accepting it"
    address = _entity(case, "Meridian House", "Address")
    reply = client.post(review, json={"decision": "accept", "target_entity_id": address})
    assert reply.json()["detail"] == "An Address cannot have an email address; choose a person, company or organisation"
    reply = client.post(review, json={"decision": "accept", "target_entity_id": case["foreign"]})
    assert reply.json()["detail"] == "The chosen entity is missing or outside this investigation"
    reply = client.post(f"/api/extraction-candidates/{case['phone']}/review", json={"decision": "accept"})
    assert reply.json()["detail"] == "Choose which entity a phone number belongs to before accepting it"
    with SessionLocal() as db:
        assert db.get(ExtractionCandidate, case["email"]).review_status == "proposed"


def test_a_merged_entity_cannot_be_chosen(case):
    survivor = _entity(case, "Jane Doe")
    alias = _entity(case, "J. Doe")
    with SessionLocal() as db:
        db.get(Entity, alias).merged_into_entity_id = survivor
        db.commit()
    reply = client.post(f"/api/extraction-candidates/{case['email']}/review", json={"decision": "accept", "target_entity_id": alias})
    assert reply.status_code == 400
    assert reply.json()["detail"] == "The chosen entity was merged into another one; choose that one instead"


def test_accepting_adds_a_statement_that_points_at_the_document(case):
    person = _entity(case, "Jane Doe")
    reply = _ok(client.post(f"/api/extraction-candidates/{case['email']}/review",
                            json={"decision": "accept", "target_entity_id": person, "note": "Her work address"}))
    assert reply["candidate"]["review_status"] == "accepted"
    assert reply["candidate"]["accepted_record_type"] == "statement"
    record = reply["record"]
    span = reply["candidate"]["payload"]["span"]
    assert record == {
        "id": reply["candidate"]["accepted_record_id"], "entity_id": person, "prop": "email",
        "value": "jane.doe@meridian.example", "dataset": "openaleph:7",
        "origin": f"document:{case['doc']}#paragraph 2@chars:{span['start_char']}-{span['end_char']}",
        "original_value": "jane.doe@meridian.example",
    }
    phone = _ok(client.post(f"/api/extraction-candidates/{case['phone']}/review", json={"decision": "accept", "target_entity_id": person}))
    assert phone["record"]["value"] == "+442079460958" and phone["record"]["original_value"] == "+44 20 7946 0958"
    with SessionLocal() as db:
        entity = db.get(Entity, person)
        assert entity.properties["email"] == ["jane.doe@meridian.example"]
        assert entity.properties["phone"] == ["+442079460958"]
        props = sorted(s.prop for s in db.scalars(select(Statement).where(Statement.entity_id == person)))
        assert props == ["email", "name", "phone"]
    # Accepting a second email proposal of the same value onto the entity does not list it twice.
    with SessionLocal() as db:
        again = ExtractionCandidate(investigation_id=case["inv"], document_id=case["doc"], candidate_type="identifier",
                                    payload={"kind": "email", "value": "jane.doe@meridian.example"}, confidence=1.0)
        db.add(again); db.commit(); db.refresh(again)
    _ok(client.post(f"/api/extraction-candidates/{again.id}/review", json={"decision": "accept", "target_entity_id": person}))
    with SessionLocal() as db:
        assert db.get(Entity, person).properties["email"] == ["jane.doe@meridian.example"]
        # Each acceptance is its own statement; one without a place or a
        # provider points at the document as a whole.
        rows = db.scalars(select(Statement).where(Statement.entity_id == person, Statement.prop == "email")).all()
        assert sorted((row.dataset, row.origin) for row in rows) == [
            (f"document:{case['doc']}", f"document:{case['doc']}#document"),
            ("openaleph:7", record["origin"]),
        ]


def test_rejecting_is_as_for_other_proposals(case):
    reply = _ok(client.post(f"/api/extraction-candidates/{case['phone']}/review", json={"decision": "reject", "note": "switchboard"}))
    assert reply["candidate"]["review_status"] == "rejected" and reply["record"] is None


def test_the_choice_lists_this_documents_entities_first(case):
    accepted = _ok(client.post(f"/api/extraction-candidates/{case['Person']}/review", json={"decision": "accept"}))["record"]["id"]
    other = _entity(case, "Aaron Other")
    _entity(case, "Some Bank Account", "BankAccount")
    with SessionLocal() as db:
        db.add(ExtractionCandidate(investigation_id=case["inv"], document_id=case["doc"], candidate_type="entity",
                                   payload={"caption": "Audit Desk", "suggested_schema": "LegalEntity", "schema_question": True},
                                   confidence=0.5))
        db.commit()
    targets = _ok(client.get(f"/api/extraction-candidates/{case['email']}/identifier-targets"))
    assert targets["kind"] == "email" and targets["property"] == "email" and targets["value"] == "jane.doe@meridian.example"
    assert targets["document_entities"] == [{"entity_id": accepted, "caption": "Jane Doe", "schema": "Person"}]
    # The Address proposal cannot hold an email; the LegalEntity proposal can.
    assert [(p["caption"], p["suggested_schema"], p["schema_question"]) for p in targets["document_proposals"]] == [("Audit Desk", "LegalEntity", True)]
    assert targets["other_entities"] == [{"entity_id": other, "caption": "Aaron Other", "schema": "Person"}]


def test_the_choice_is_only_for_email_and_phone_proposals(case):
    reply = client.get(f"/api/extraction-candidates/{case['Person']}/identifier-targets")
    assert reply.status_code == 400 and reply.json()["detail"] == "This proposal is not an email address or phone number"
    assert client.get("/api/extraction-candidates/missing/identifier-targets").status_code == 404


def test_identifier_proposals_explain_themselves(case):
    expl = _ok(client.get(f"/api/extraction-candidates/{case['phone']}/explanation"))
    assert expl["summary"] == "Phone number “+442079460958”"
    assert expl["method"]["id"] == "openaleph_ftm_analyze" and expl["rationale_basis"] == "provider"
    assert [p["id"] for p in expl["parts"]] == ["value", "owner"]
    reasoning = expl["parts"][0]["reasoning"]
    assert reasoning[0] == "OpenAleph's ftm-analyze matched “+442079460958” with its phone pattern and listed it under phone numbers (phoneMentioned)."
    assert reasoning[1] == "The Workbench found it in the document text at paragraph 2, written “+44 20 7946 0958”."
    assert reasoning[2] == "OpenAleph stores it as “+442079460958”, the form FollowTheMoney uses for a phone number."
    chunk = next(s for s in expl["parts"][0]["sources"] if s["kind"] == "chunk")
    assert chunk["excerpt"]["match"] == "+44 20 7946 0958" and chunk["extraction_method"] == "openaleph_ingest_file"
    assert expl["parts"][1]["value"] is None and "you choose the entity" in expl["parts"][1]["reasoning"][0]
    assert expl["caveats"][0].startswith("Accepting adds the phone number to the entity you choose")
    assert expl["confidence"]["basis"].startswith("Fixed value of 1.0: the value matched OpenAleph's pattern")


def test_names_from_openaleph_explain_how_they_were_found(case):
    person = _ok(client.get(f"/api/extraction-candidates/{case['Person']}/explanation"))
    reasoning = person["parts"][0]["reasoning"]
    assert reasoning[0] == ("OpenAleph's ftm-analyze found “jane doe” with spaCy's named-entity recognition (en_core_web_sm) "
                            "and listed it under people (peopleMentioned).")
    assert reasoning[1] == "The Workbench found it in the document text at paragraph 2, written “Jane Doe”."
    assert person["parts"][1]["reasoning"] == ["OpenAleph filed it under people, so the proposal is a Person."]
    assert person["confidence"]["basis"].startswith("Fixed value of 0.85 for every name ftm-analyze finds")
    assert any("Named-entity models make mistakes" in c for c in person["caveats"])
    place = _ok(client.get(f"/api/extraction-candidates/{case['Address']}/explanation"))
    assert place["parts"][0]["reasoning"][1] == "The Workbench found it in the document text at paragraph 2, written “Meridian Holdings Ltd”."
    assert place["parts"][1]["reasoning"] == ["OpenAleph filed it under locations, so the proposal is an Address."]
    # A value that is not in the text says so.
    with SessionLocal() as db:
        row = ExtractionCandidate(investigation_id=case["inv"], document_id=case["doc"], candidate_type="entity", confidence=0.5, payload={
            "caption": "Audit Desk", "suggested_schema": "LegalEntity", "openaleph_value": "Audit Desk", "located": False,
            "schema_question": True, "provenance": {"provider": "openaleph", "collection_id": "7", "provider_entity_id": "e1",
                                                    "provider_property": "namesMentioned", "extraction_method": "openaleph_ftm_analyze",
                                                    "found_by": "ingest-file email headers"}})
        db.add(row); db.commit(); db.refresh(row)
    unknown = _ok(client.get(f"/api/extraction-candidates/{row.id}/explanation"))
    assert unknown["parts"][0]["reasoning"][0] == ("OpenAleph read “Audit Desk” from the email's sender and recipient headers "
                                                    "and listed it under names (namesMentioned).")
    assert "could not find it in the document text" in unknown["parts"][0]["reasoning"][1]
    assert "whether it is a person, a company or an organisation" in unknown["parts"][1]["reasoning"][0]
    assert unknown["confidence"]["basis"].startswith("Fixed value of 0.5")
    assert any("no highlighted place" in c for c in unknown["caveats"])


def test_an_accepted_email_survives_a_backup(case):
    person = _entity(case, "Jane Doe")
    _ok(client.post(f"/api/extraction-candidates/{case['email']}/review", json={"decision": "accept", "target_entity_id": person}))
    with SessionLocal() as db:
        package, manifest = build_investigation_export(db, case["inv"], include_documents=True)
    lineage = manifest["lineage_integrity"]
    assert lineage["valid"] is True and lineage["accepted_record_counts"]["statement"] == 1
    inspected, records = inspect_export(package)
    assert inspected["lineage_integrity"] == lineage
    exported = next(row for row in records["extraction_candidates"] if row["id"] == case["email"])
    assert exported["accepted_record_type"] == "statement"
    assert exported["accepted_record_id"] in {row["id"] for row in records["statements"]}
