"""Your safety (app/services/your_safety.py, research §13): signs from the case's own records, apart from Red Flags,
with no level made up; the questions only the reporter can answer, whose answers this server never receives."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.derived import DocumentPhoto
from app.models.domain import PatternFlag

client = TestClient(app)


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


def _case() -> str:
    return client.post("/api/investigations", json={"name": "Harbour"}).json()["id"]


def test_a_case_with_nothing_in_it_has_no_signs_and_asks_the_four_questions():
    body = client.get(f"/api/investigations/{_case()}/your-safety").json()
    assert body["signs"] == [] and body["levels_set"] is False
    assert [q["id"] for q in body["questions"]] == ["SA-013", "SA-014", "SA-015", "SA-018"]
    assert all(q["question"].endswith("?") and q["innocent"] for q in body["questions"])
    assert {g["publisher"] for g in body["guides"]} >= {"Committee to Protect Journalists", "Rory Peck Trust"}


def test_signs_come_from_flags_in_the_areas_politically_exposed_parties_and_photo_traces():
    inv = _case()
    client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Ann Example",
                                       "properties": {"name": ["Ann Example"], "topics": ["role.pep"]}})
    client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Bob Sample", "properties": {"name": ["Bob Sample"]}})
    doc = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "pier.txt"},
                      files={"file": ("pier.txt", b"a note", "text/plain")}).json()["id"]
    with SessionLocal() as db:
        db.add(PatternFlag(investigation_id=inv, indicator_id="OC-001", fingerprint="a" * 64, level="faint"))
        db.add(PatternFlag(investigation_id=inv, indicator_id="OC-002", fingerprint="b" * 64, level="strong", status="dismissed"))
        db.add(DocumentPhoto(document_id=doc, investigation_id=inv, kind="JPEG", tool="Pillow", claims={"gps": {"latitude": 1.0, "longitude": 2.0}, "serial_number": "X1"}))
        db.commit()
    signs = {s["id"]: s for s in client.get(f"/api/investigations/{inv}/your-safety").json()["signs"]}
    assert set(signs) == {"SA-007", "SA-008", "SA-033"}
    assert signs["SA-007"]["evidence"] == "From your records: 1 open Red Flag in this area (OC-001)."
    assert "1 party is a politically exposed person: Ann Example" in signs["SA-008"]["evidence"] and "Bob Sample" not in signs["SA-008"]["evidence"]
    assert signs["SA-033"]["documents"] == [{"document_id": doc, "filename": "pier.txt", "traces": ["where it was taken", "the camera's serial number"]}]
    assert all(s["level"] is None for s in signs.values())


def test_an_unknown_case_is_not_found():
    assert client.get("/api/investigations/nope/your-safety").status_code == 404
