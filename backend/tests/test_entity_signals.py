"""How sure the Workbench's own pattern finder may be about a name or a
passage, from what the text shows (app/services/entity_signals.py; design
doc Phase 3)."""

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.entity_signals import SCHEMA_CHOICES, read_name, read_passage

client = TestClient(app)


def test_the_text_says_what_a_name_is():
    company = read_name("Meridian Holdings Ltd", "Payment from ")
    assert (company.schema, company.confidence, company.schema_basis, company.matched) == ("Company", 0.9, "corporate_suffix", "Ltd")
    assert read_name("Bellcastle Trading GmbH", "").schema == "Company"
    ministry = read_name("Ministry of Finance", "the ")
    assert (ministry.schema, ministry.confidence, ministry.schema_basis) == ("Organization", 0.85, "organization_word")
    person = read_name("Alaric Voss", "signed by Dr. ")
    assert (person.schema, person.confidence, person.schema_basis, person.matched) == ("Person", 0.85, "honorific", "Dr")


def test_a_name_the_text_does_not_explain_asks_with_every_kind():
    unknown = read_name("Harborline Civic", "paid ")
    assert (unknown.schema, unknown.confidence, unknown.schema_basis) == ("Person", 0.4, "no_type_signal")
    assert unknown.choices == SCHEMA_CHOICES == ["Person", "Organization", "Company", "LegalEntity"]
    # Place words are not organisation signals: "Union Street" is not a union.
    assert read_name("Union Street", "on ").schema_basis == "no_type_signal"
    # A lower-case "co" or "ab" in a name is not a legal form.
    assert read_name("Coastal Abbey", "").schema_basis == "no_type_signal"


def test_a_name_the_investigation_already_holds_takes_that_records_kind():
    reading = read_name("MERIDIAN HOLDINGS LTD.", "", {"meridian holdings ltd": ("ent-1", "Company")})
    assert (reading.schema, reading.confidence, reading.schema_basis, reading.existing_entity_id) == ("Company", 0.9, "existing_record", "ent-1")


def test_passages_that_rarely_matter_score_low():
    assert read_passage("Page 3 of 12")[0] == 0.2
    assert read_passage("CONFIDENTIAL")[1] == {"rule": "whole_chunk", "signal": "boilerplate"}
    assert read_passage("© 2024 Meridian Holdings")[0] == 0.2
    assert read_passage("Board minutes")[1] == {"rule": "whole_chunk", "signal": "short_passage", "words": 2}
    assert read_passage("The board approved the transfer on 3 March.") == (1.0, {"rule": "whole_chunk"})


def test_an_upload_records_the_signals_and_explains_them(monkeypatch):
    monkeypatch.setattr(settings, "enable_local_entity_suggestions", True)
    inv = client.post("/api/investigations", json={"name": "Signals"}).json()["id"]
    client.post("/api/entities", json={"investigation_id": inv, "schema": "Organization", "caption": "Harbour Board", "properties": {}})
    text = b"CONFIDENTIAL\n\nMr Alaric Voss met the Harbour Board on Monday. It was Meridian Holdings Ltd that paid him."
    doc = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                      files={"file": ("memo.txt", text, "text/plain")}).json()
    rows = client.get(f"/api/documents/{doc['id']}/candidates", params={"explain": "true"}).json()
    names = {row["payload"]["caption"]: row for row in rows if row["candidate_type"] == "entity"}
    assert (names["Alaric Voss"]["payload"]["suggested_schema"], names["Alaric Voss"]["confidence"]) == ("Person", 0.85)
    assert names["Harbour Board"]["payload"]["rationale"]["schema_basis"] == "existing_record"
    assert names["Harbour Board"]["payload"]["suggested_schema"] == "Organization"
    assert names["Meridian Holdings Ltd"]["explanation"]["confidence"]["basis"].startswith("0.90: the legal form in the name")
    stamp = next(row for row in rows if row["candidate_type"] == "evidence" and row["payload"]["quote"] == "CONFIDENTIAL")
    assert stamp["confidence"] == 0.2
    assert "page number, a stamp or a copyright line" in stamp["explanation"]["confidence"]["basis"]
