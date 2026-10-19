"""Files inside an archive and an email's attachments (ADR-0006, Wave A).

OpenAleph is faked over HTTP (tests/openaleph_fake.py) in the shapes
OpenAleph 5.3.1 returned live on 2026-10-02: a zip is a ``Package`` whose
files name it (or a ``Folder`` in it) as ``parent``; an email is an
``Email`` with its headers as properties and its attachments as children;
each file's bytes come from ``/api/2/archive/resolve`` and the signed
``/api/2/archive`` link it answers.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import BackgroundJob, Document, ExtractionCandidate, Investigation, Source
from app.services import openaleph_analysis, openaleph_children
from app.services.exports import _parents_first
from openaleph_fake import FakeOpenAleph, entity

EMAIL = b"From: Jane Doe <jane.doe@meridian.example>\r\nSubject: Transfer\r\n\r\nPlease find the ledger attached.\r\n"


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    fake = FakeOpenAleph().install(monkeypatch)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.01)
    monkeypatch.setattr(settings, "openaleph_read_timeout_seconds", 5)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 5)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setattr(openaleph_analysis, "SEARCH_REFRESH_SECONDS", 0)
    return fake


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Children")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(investigation_id: str, name: str, data: bytes, mime: str) -> dict:
    reply = TestClient(app).post("/api/documents/upload", data={"investigation_id": investigation_id, "title": name},
                                 files={"file": (name, data, mime)})
    assert reply.status_code == 200, reply.text
    return reply.json()


def _documents(investigation_id: str) -> list[dict]:
    reply = TestClient(app).get(f"/api/investigations/{investigation_id}/documents")
    assert reply.status_code == 200, reply.text
    return reply.json()


def _zip(fake: FakeOpenAleph) -> None:
    fake.entities["1.upload"] = entity("1.upload", "Package", fileName="bundle.zip")
    fake.add_child("1.upload", "folder-letters", "letters", None, schema="Folder")
    fake.add_child("folder-letters", "child-first", "first.txt", b"Jane Doe wrote to Meridian Holdings Ltd.",
                   peopleMentioned=["jane doe"], detectedLanguage=["eng"])
    fake.add_child("1.upload", "child-second", "second.txt", b"Angela Merkel replied.",
                   peopleMentioned=["angela merkel"], detectedLanguage=["eng"])


def test_each_file_in_an_archive_becomes_a_document_under_it(fake):
    inv = _investigation()
    _zip(fake)
    bundle = _upload(inv, "bundle.zip", b"PK\x03\x04", "application/zip")
    message = bundle["job"]["message"]
    assert message == "Read by OpenAleph (no text); 2 file(s) inside added as documents", message
    documents = {row["filename"]: row for row in _documents(inv)}
    assert set(documents) == {"bundle.zip", "letters/first.txt", "second.txt"}
    parent = documents["bundle.zip"]
    assert parent["openaleph_schema"] == "Package" and parent["parent_document_id"] is None
    # An archive's text is its files: no "no text" issue once they are found.
    assert parent["extraction_issues"] == []
    for name, person in (("letters/first.txt", "Jane Doe"), ("second.txt", "Angela Merkel")):
        child = documents[name]
        assert child["parent_document_id"] == parent["id"]
        assert child["extraction_status"] == "complete" and child["chunk_count"] == 1
        assert child["openaleph_document_id"] in {"child-first", "child-second"}
        with SessionLocal() as db:
            captions = [row.payload["caption"] for row in db.scalars(select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == child["id"], ExtractionCandidate.candidate_type == "entity"))]
            assert captions == [person]
            # Each child was read by a job of its own, so it can be retried from its row.
            assert db.scalar(select(BackgroundJob).where(BackgroundJob.subject_id == child["id"])).status == "succeeded"
            source = db.get(Source, child["source_id"])
            assert source.metadata_json["found_in_document_id"] == parent["id"]
            assert source.metadata_json["path"] == name
    # The copy the Workbench keeps is OpenAleph's file.
    with SessionLocal() as db:
        first = db.get(Document, documents["letters/first.txt"]["id"])
        assert open(first.storage_path, "rb").read() == b"Jane Doe wrote to Meridian Holdings Ltd."
    archive = fake.calls("GET", "/api/2/archive")
    assert archive and all("authorization" not in request.headers for request in archive)


def test_looking_again_adds_only_the_files_not_held(fake):
    inv = _investigation()
    _zip(fake)
    bundle = _upload(inv, "bundle.zip", b"PK\x03\x04", "application/zip")
    client = TestClient(app)
    again = client.post(f"/api/documents/{bundle['id']}/openaleph/children").json()
    assert again["status"] == "succeeded" and again["message"] == "2 file(s) inside were already added", again
    fake.add_child("1.upload", "child-third", "third.txt", b"A third memo.")
    third = client.post(f"/api/documents/{bundle['id']}/openaleph/children").json()
    assert third["message"] == "1 file(s) inside added as documents; 2 file(s) inside were already added", third
    assert third["result"] == {"added": 1, "already": 2, "not_added": 0, "unread": 0}
    assert len(_documents(inv)) == 4


def test_files_that_cannot_be_added_are_named_on_the_archive(fake, monkeypatch):
    inv = _investigation()
    fake.entities["1.upload"] = entity("1.upload", "Package", fileName="bundle.zip")
    fake.add_child("1.upload", "child-big", "big.txt", b"x" * 300)
    fake.add_child("1.upload", "child-nofile", "ghost.txt", None, schema="PlainText")
    fake.add_child("1.upload", "child-ok", "ok.txt", b"Fine.")
    monkeypatch.setattr(settings, "max_document_bytes", 200)
    bundle = _upload(inv, "bundle.zip", b"PK\x03\x04", "application/zip")
    assert bundle["job"]["message"].endswith("1 file(s) inside added as documents; 2 file(s) inside not added")
    parent = next(row for row in _documents(inv) if row["id"] == bundle["id"])
    assert parent["extraction_issues"] == [
        "Not added from inside: big.txt: larger than the 200 byte upload limit",
        "Not added from inside: ghost.txt: OpenAleph keeps no file for it",
    ]


def test_an_archive_whose_files_cannot_be_listed_is_still_read(fake, monkeypatch):
    inv = _investigation()
    fake.entities["1.upload"] = entity("1.upload", "Package", fileName="bundle.zip")

    def down(collection_id, entity_id):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(openaleph_children, "_search_children", down)
    bundle = _upload(inv, "bundle.zip", b"PK\x03\x04", "application/zip")
    assert bundle["job"]["status"] == "succeeded"
    assert bundle["job"]["message"] == "Read by OpenAleph (no text); the files inside could not be listed"
    parent = _documents(inv)[0]
    assert parent["extraction_issues"][-1].startswith("The files inside could not be listed: OpenAleph did not answer (ConnectError)")


def _email(fake: FakeOpenAleph) -> None:
    fake.entities["1.upload"] = entity(
        "1.upload", "Email", fileName="transfer.eml", bodyText="Please find the ledger attached.",
        **{"from": ["Jane Doe <jane.doe@meridian.example>"], "to": ["Audit Desk <audit@kestrelwood.example>"],
           "cc": ["Maria Fernandez <maria@kestrelwood.example>"], "date": ["2026-09-01T10:00:00"],
           "subject": ["Transfer to Meridian"], "messageId": ["first@meridian.example"]})
    fake.add_child("1.upload", "child-ledger", "ledger.txt", b"Ledger: paid Meridian Holdings Ltd.",
                   companiesMentioned=["meridian holdings ltd"])
    fake.threads["1.upload"] = {"total": 2, "total_type": "eq", "results": [
        {"id": "1.upload", "schema": "Email", "caption": "Transfer to Meridian", "properties": {
            "subject": ["Transfer to Meridian"], "from": ["Jane Doe <jane.doe@meridian.example>"], "date": ["2026-09-01T10:00:00"]}},
        {"id": "reply-1", "schema": "Email", "caption": "Re: Transfer to Meridian", "properties": {
            "subject": ["Re: Transfer to Meridian"], "from": ["Audit Desk <audit@kestrelwood.example>"], "date": ["2026-09-02T09:00:00"]}},
    ]}


def test_an_email_shows_its_headers_its_thread_and_its_attachment(fake):
    inv = _investigation()
    _email(fake)
    email = _upload(inv, "transfer.eml", EMAIL, "message/rfc822")
    assert email["job"]["message"].endswith("; 1 file(s) inside added as documents"), email["job"]["message"]
    ledger = next(row for row in _documents(inv) if row["filename"] == "ledger.txt")
    assert ledger["parent_document_id"] == email["id"]
    reply = TestClient(app).get(f"/api/documents/{email['id']}/email")
    assert reply.status_code == 200, reply.text
    shown = reply.json()
    assert shown["headers"] == {
        "from": ["Jane Doe <jane.doe@meridian.example>"], "to": ["Audit Desk <audit@kestrelwood.example>"],
        "cc": ["Maria Fernandez <maria@kestrelwood.example>"], "bcc": [], "date": "2026-09-01T10:00:00",
        "subject": "Transfer to Meridian", "message_id": "first@meridian.example", "in_reply_to": [],
    }
    assert [(m["subject"], m["document_id"], m["current"]) for m in shown["thread"]] == [
        ("Transfer to Meridian", email["id"], True), ("Re: Transfer to Meridian", None, False)]
    assert shown["thread_note"] is None
    # The headers stay with the document while OpenAleph is down.
    fake.fail["/api/2/entities/1.upload/thread"] = 503
    down = TestClient(app).get(f"/api/documents/{email['id']}/email").json()
    assert down["headers"]["subject"] == "Transfer to Meridian" and down["thread"] == []
    assert down["thread_note"] == "OpenAleph did not answer (HTTPStatusError); the thread shows when it is running"


def test_only_emails_and_archives_answer_those_routes(fake):
    inv = _investigation()
    memo = _upload(inv, "memo.txt", b"Jane Doe met the board.", "text/plain")
    client = TestClient(app)
    assert client.get(f"/api/documents/{memo['id']}/email").json() == {"detail": "This document is not an email"}
    assert client.get("/api/documents/missing/email").status_code == 404
    refused = client.post(f"/api/documents/{memo['id']}/openaleph/children")
    assert refused.status_code == 409 and refused.json()["detail"] == "Only an archive or an email has files inside"
    assert client.post("/api/documents/missing/openaleph/children").status_code == 404


def test_a_backup_keeps_which_archive_each_file_came_from(fake, tmp_path):
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker

    from app.db.session import Base
    from app.services.exports import build_investigation_export, restore_investigation_export

    inv = _investigation()
    _zip(fake)
    bundle = _upload(inv, "bundle.zip", b"PK\x03\x04", "application/zip")
    with SessionLocal() as db:
        package, manifest = build_investigation_export(db, inv, include_documents=True)
    assert manifest["lineage_integrity"]["valid"], manifest["lineage_integrity"]
    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _foreign_keys_on(connection, _record):   # as PostgreSQL would, refuse a file before its archive
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as fresh:
        restore_investigation_export(fresh, package, tmp_path / "restored-docs")
        children = fresh.scalars(select(Document).where(Document.parent_document_id == bundle["id"])).all()
        assert sorted(child.filename for child in children) == ["letters/first.txt", "second.txt"]


def test_a_backup_restores_an_archive_before_its_files():
    rows = [{"id": "c", "parent_document_id": "b"}, {"id": "a", "parent_document_id": None},
            {"id": "b", "parent_document_id": "a"}, {"id": "d", "parent_document_id": "elsewhere"}]
    assert [row["id"] for row in _parents_first(rows)] == ["a", "d", "b", "c"]
