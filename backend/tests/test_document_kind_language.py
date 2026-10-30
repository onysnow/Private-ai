"""What a document is and its language (app/services/document_facts.py; DECISIONS_LOG 32): filled where the app knows
(its file type, its source's record, the language detected in its text, OpenAleph's detection, the language a
recording was heard in), kept with how each was set, set by a person in the Library or the reading room, never replaced
by the machine once a person set it, and carried by a backup."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import Base, SessionLocal
from app.main import app
from app.models.domain import Document
from app.services import document_facts, transcription
from app.services.documents import store_document
from app.services.exports import (
    build_investigation_export,
    restore_investigation_export,
)
from app.services.openaleph_analysis import Analysis, import_analysis_proposals

client = TestClient(app)

ENGLISH = ("The court found that the defendants had conspired to launder money taken from the fund, "
           "and ordered the forfeiture of the property bought with it.\n")
FRENCH = ("Le tribunal a jugé que les prévenus avaient blanchi les fonds détournés du fonds souverain "
          "et a ordonné la confiscation des biens acquis avec cet argent.\n")


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


def _case(name: str = "Kinds") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _upload(inv: str, name: str, data: bytes, mime: str = "text/plain") -> dict:
    r = client.post("/api/documents/upload", data={"investigation_id": inv}, files={"file": (name, data, mime)})
    assert r.status_code == 200, r.text
    return r.json()


def test_words_records_use_become_the_apps_kinds_and_codes():
    assert document_facts.kind_word("complaint") == "court_filing" and document_facts.kind_word("Press release") == "press_release"
    assert document_facts.kind_word("registry") == "official_record" and document_facts.kind_word("web_page") == "web_capture"
    assert document_facts.kind_word("docx") is None and document_facts.kind_word(None) is None
    assert document_facts.kind_from_file("thread.eml") == "email" and document_facts.kind_from_file("x", "image/jpeg") == "photo"
    assert document_facts.kind_from_file("ledger.XLSX") == "spreadsheet" and document_facts.kind_from_file("ep.mp3") == "recording"
    assert document_facts.kind_from_file("minutes.pdf", "application/pdf") is None
    assert document_facts.kind_from_file(None, None, openaleph_schema="Email") == "email"
    assert [document_facts.language_code(x) for x in ("en", "EN-gb", "eng", "fra", "zz", "", None)] == ["en", "en", "en", "fr", None, None, None]
    assert document_facts.language_name("ms") == "Malay" and document_facts.language_name(None) is None


def test_a_saved_file_gets_the_kind_its_type_gives_and_the_language_of_its_text():
    inv = _case()
    sheet = _upload(inv, "payments.csv", b"date,payer,payee,amount\n2012-05-21,1MDB,Good Star,700000000\n", "text/csv")
    assert (sheet["kind"], sheet["kind_set_by"]) == ("spreadsheet", "reader")
    note = _upload(inv, "jugement.txt", FRENCH.encode() * 2)
    assert note["kind"] is None and note["kind_set_by"] is None
    assert (note["language"], note["language_name"], note["language_set_by"], note["language_by"]) == ("fr", "French", "detected", "py3langid")
    assert note["language_confidence"] >= document_facts.MIN_CONFIDENCE
    listed = {d["id"]: d for d in client.get(f"/api/investigations/{inv}/documents").json()}
    assert listed[note["id"]]["language"] == "fr" and listed[sheet["id"]]["kind"] == "spreadsheet"


def test_too_little_text_is_not_given_a_language():
    inv = _case()
    doc = _upload(inv, "total.txt", b"Total 12 345\n")
    assert doc["language"] is None and doc["language_set_by"] is None


def test_what_a_source_states_is_kept_and_a_detection_does_not_replace_it(tmp_path):
    inv = _case()
    with SessionLocal() as db:
        doc = store_document(db, investigation_id=inv, title="Judgment", filename="judgment.txt", mime_type="text/plain",
                             data=FRENCH.encode() * 2, storage_dir=tmp_path, source_metadata={"kind": "judgment", "language": "ms"})
        assert (doc.kind, doc.kind_set_by, doc.language, doc.language_set_by) == ("judgment", "source", "ms", "source")
        document_facts.fill_from_text(doc, [FRENCH * 2])
        assert doc.language == "ms"
        # A detection replaces a detection: OpenAleph's after the app's own.
        doc.language, doc.language_set_by = "en", "detected"
        document_facts.fill_from_text(doc, [FRENCH * 2])
        assert (doc.language, doc.language_by) == ("fr", "py3langid")


def test_a_person_sets_the_kind_and_language_and_the_machine_keeps_them(tmp_path):
    inv = _case()
    doc = _upload(inv, "statement.txt", ENGLISH.encode() * 2)
    assert doc["language"] == "en"
    r = client.patch(f"/api/documents/{doc['id']}/about", json={"kind": "press_release", "language": "fr-FR"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["kind"], out["kind_set_by"], out["language"], out["language_set_by"], out["language_confidence"]) == (
        "press_release", "person", "fr", "person", None)
    # Only what is sent changes; null clears.
    out = client.patch(f"/api/documents/{doc['id']}/about", json={"kind": None}).json()
    assert (out["kind"], out["kind_set_by"], out["language"]) == (None, "person", "fr")
    assert client.patch(f"/api/documents/{doc['id']}/about", json={"language": "zz"}).status_code == 422
    assert client.patch(f"/api/documents/{doc['id']}/about", json={"kind": "novel"}).status_code == 422
    assert client.patch("/api/documents/nope/about", json={"kind": "article"}).status_code == 404
    with SessionLocal() as db:
        row = db.get(Document, doc["id"])
        document_facts.fill_from_text(row, [ENGLISH * 2])
        assert not document_facts.set_kind(row, "email", "reader")
        assert (row.kind, row.language) == (None, "fr")


def test_openaleph_kind_and_detected_language_are_kept(tmp_path):
    inv = _case()
    with SessionLocal() as db:
        doc = store_document(db, investigation_id=inv, title="Mail", filename="message", mime_type=None, data=b"x",
                             storage_dir=tmp_path)
        doc_id = doc.id
        import_analysis_proposals(db, doc_id, Analysis(collection_id="7", entity_id="e1", schema="Email",
                                                       properties={"detectedLanguage": ["deu"]}))
    detail = client.get(f"/api/documents/{doc_id}").json()
    assert (detail["kind"], detail["kind_by"], detail["language"], detail["language_set_by"], detail["language_by"]) == (
        "email", "OpenAleph", "de", "detected", "OpenAleph")


def test_a_recording_keeps_the_language_it_was_heard_in(monkeypatch):
    def fake(path, progress):
        return transcription.Transcript(kind="audio", duration=3.0, streams=[], outline=[0.0], outline_step=1.0,
                                        segments=[transcription.Segment(0.0, 2.8, "speech", "Selamat pagi semua.", [])],
                                        about={"tool": "faster-whisper", "model": "stand-in", "language": "ms",
                                               "language_probability": 0.91})
    monkeypatch.setattr(transcription, "transcribe", fake)
    inv = _case()
    doc = _upload(inv, "ep.mp3", b"ID3", "audio/mpeg")
    assert (doc["kind"], doc["language"], doc["language_set_by"], doc["language_confidence"]) == ("recording", "ms", "detected", 0.91)


def test_kind_and_language_travel_in_a_backup(tmp_path):
    inv = _case("Backup kinds")
    doc = _upload(inv, "statement.txt", ENGLISH.encode() * 2)
    client.patch(f"/api/documents/{doc['id']}/about", json={"kind": "article"})
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv, include_documents=True)
    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        restore_investigation_export(db, package, Path(tmp_path / "restored-documents"))
        row = db.scalars(select(Document).where(Document.investigation_id == inv)).one()
        assert (row.kind, row.kind_set_by, row.language, row.language_set_by, row.language_by) == (
            "article", "person", "en", "detected", "py3langid")


def test_documents_already_in_a_case_get_their_kind_and_language_when_upgraded(tmp_path):
    import os
    import sqlite3
    import subprocess
    import sys

    db_path = tmp_path / "before.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path.as_posix()}", "TZ": "UTC"}
    backend = Path(__file__).resolve().parents[1]

    def alembic(*args: str) -> None:
        subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, check=True, capture_output=True, text=True)

    alembic("upgrade", "e6c1b4d8a352")
    with sqlite3.connect(db_path) as con:
        con.execute("INSERT INTO investigations (id, name, created_at) VALUES ('i', 'Old', '2026-10-01')")
        rows = [("s1", '{"kind": "complaint"}', "d1", "complaint.pdf", "application/pdf", None),
                ("s2", '{"language": "ms"}', "d2", "sheet.csv", "text/csv", None),
                ("s3", "{}", "d3", "jugement.txt", "text/plain", FRENCH * 2)]
        for sid, meta, did, name, mime, text in rows:
            con.execute("INSERT INTO sources (id, investigation_id, title, source_type, metadata_json, created_at) "
                        "VALUES (?, 'i', ?, 'document', ?, '2026-10-01')", (sid, name, meta))
            con.execute("INSERT INTO documents (id, investigation_id, source_id, filename, mime_type, sha256, storage_path, "
                        "extraction_status, created_at) VALUES (?, 'i', ?, ?, ?, 'x', '/nowhere', 'complete', '2026-10-01')",
                        (did, sid, name, mime))
            if text:
                con.execute("INSERT INTO document_chunks (id, document_id, locator, ordinal, text, created_at) "
                            "VALUES (?, ?, 'p1', 1, ?, '2026-10-01')", (f"c-{did}", did, text))
    alembic("upgrade", "a8d2f6c4e913")
    with sqlite3.connect(db_path) as con:
        got = {r[0]: r[1:] for r in con.execute("SELECT id, kind, kind_set_by, language, language_set_by, language_by FROM documents")}
    assert got["d1"] == ("court_filing", "source", None, None, None)
    assert got["d2"] == ("spreadsheet", "reader", "ms", "source", None)
    assert got["d3"] == (None, None, "fr", "detected", "py3langid")
    alembic("downgrade", "e6c1b4d8a352")
