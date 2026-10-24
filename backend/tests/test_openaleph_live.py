"""OpenAleph used in full, end to end against a running OpenAleph (ADR-0006).

Runs only when OPENALEPH_LIVE_URL points at an OpenAleph 5.3.x API whose
ingest service runs with OPENALEPH_PROCRASTINATE_DEHYDRATE_ENTITIES=false
(both compose files set it), e.g.

    OPENALEPH_LIVE_URL=http://127.0.0.1:8001 TZ=UTC python -m pytest tests/test_openaleph_live.py

Each test uploads real files through the Workbench's own upload route, so
OpenAleph reads them, ftm-analyze finds their names, and the Workbench turns
the result into proposals. Every investigation gets its own OpenAleph
collection, which the test deletes afterwards; nothing else on the stack is
touched.
"""

from __future__ import annotations

import io
import os
import time
import zipfile
from email.message import EmailMessage

import httpx
import pymupdf
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import ExtractionCandidate, InvestigationCorpusBinding
from app.services import openaleph_corpus

LIVE_URL = os.environ.get("OPENALEPH_LIVE_URL", "")
pytestmark = pytest.mark.skipif(not LIVE_URL, reason="needs OPENALEPH_LIVE_URL (a running OpenAleph)")

MEMO = (
    "Memo from the finance desk.\n\n"
    "Jane Doe met Angela Merkel and Emmanuel Macron to discuss Meridian Holdings Ltd.\n\n"
    "Payments went to GB82WEST12345698765432, which the bank statement prints as GB82 WEST 1234 5698 7654 32. "
    "A second account appears only in print: GB33 BUKB 2020 1555 5555 55.\n\n"
    "Contact jane.doe@meridian.example or call +44 20 7946 0958."
)


@pytest.fixture()
def live(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", LIVE_URL.rstrip("/"))
    monkeypatch.setattr(settings, "openaleph_api_key", "")
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 1.0)
    monkeypatch.setattr(settings, "openaleph_read_timeout_seconds", 300.0)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 180.0)
    monkeypatch.setattr(settings, "enable_local_entity_suggestions", True)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {})
    client = TestClient(app)
    created: list[str] = []
    yield client, created
    token = httpx.get(f"{LIVE_URL.rstrip('/')}/api/2/metadata", timeout=10).json().get("token")
    for collection_id in created:
        httpx.delete(f"{LIVE_URL.rstrip('/')}/api/2/collections/{collection_id}",
                     headers={"Authorization": f"Token {token}"}, timeout=30)


def _investigation(live, name: str) -> str:
    client, _created = live
    reply = client.post("/api/investigations", json={"name": f"{name} {time.strftime('%H%M%S')}"})
    assert reply.status_code == 200, reply.text
    return reply.json()["id"]


def _remember_collection(live, investigation_id: str) -> str:
    _client, created = live
    with SessionLocal() as db:
        binding = db.scalar(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == investigation_id))
        assert binding is not None
        if binding.collection_id not in created:
            created.append(binding.collection_id)
        return binding.collection_id


def _upload(live, investigation_id: str, name: str, data: bytes, mime: str) -> dict:
    client, _created = live
    reply = client.post("/api/documents/upload", data={"investigation_id": investigation_id, "title": name},
                        files={"file": (name, data, mime)})
    _remember_collection(live, investigation_id)
    assert reply.status_code == 200, reply.text
    document = reply.json()
    assert document["job"]["status"] == "succeeded", document["job"]
    return document


def _proposals(document_id: str, kind: str | None = None) -> list[ExtractionCandidate]:
    with SessionLocal() as db:
        stmt = select(ExtractionCandidate).where(ExtractionCandidate.document_id == document_id)
        if kind:
            stmt = stmt.where(ExtractionCandidate.candidate_type == kind)
        rows = list(db.scalars(stmt.order_by(ExtractionCandidate.created_at)).all())
        for row in rows:
            db.expunge(row)
        return rows


def _pdf(*pages: str) -> bytes:
    pdf = pymupdf.open()
    for text in pages:
        pdf.new_page().insert_text((72, 72), text, fontsize=11)
    return pdf.tobytes()


def test_a_memo_read_by_openaleph_becomes_name_and_identifier_proposals(live):
    client, _created = live
    inv = _investigation(live, "Wave A memo")
    document = _upload(live, inv, "memo.txt", MEMO.encode(), "text/plain")
    message = document["job"]["message"]
    assert message.startswith("Read by OpenAleph (4 paragraph(s)); "), message
    assert "from OpenAleph" in message, message

    entities = {(row.payload["suggested_schema"], row.payload["caption"]): row for row in _proposals(document["id"], "entity")}
    # ftm-analyze's names, in the memo's own spelling, each with its place.
    for key in [("Person", "Jane Doe"), ("Person", "Angela Merkel"), ("Person", "Emmanuel Macron"),
                ("Company", "Meridian Holdings Ltd")]:
        assert key in entities, sorted(entities)
        row = entities[key]
        assert row.payload["located"] is True and row.payload["span"] and row.chunk_id
        assert row.payload["provenance"]["ner_models"] == ["en_core_web_sm"]
    # The pattern finder stays off when OpenAleph analysed the document.
    assert not any(row.payload.get("rationale", {}).get("rule") == "capitalized_name_sequence" for row in entities.values())
    # ftm-analyze finds an IBAN only written without spaces (its IBAN_REGEX
    # wants seven digits in a row after the bank code); the Workbench then
    # finds that number in both its forms. The print-only IBAN is not found.
    account = entities[("BankAccount", "GB82WEST12345698765432")]
    assert account.payload["occurrence_count"] == 2
    assert [o["text"] for o in account.payload["occurrences"]] == ["GB82WEST12345698765432", "GB82 WEST 1234 5698 7654 32"]
    assert not any("GB33" in caption.replace(" ", "") for _schema, caption in entities)

    identifiers = {row.payload["kind"]: row for row in _proposals(document["id"], "identifier")}
    assert identifiers["email"].payload["value"] == "jane.doe@meridian.example" and identifiers["email"].payload["located"]
    assert identifiers["phone"].payload["value"] == "+442079460958"
    assert identifiers["phone"].payload["caption"] == "+44 20 7946 0958"

    # Find names again: OpenAleph analyses the memo again; nothing new.
    again = client.post(f"/api/documents/{document['id']}/openaleph/analyze").json()
    assert again["status"] == "succeeded", again
    assert again["message"] == "OpenAleph found no new names", again

    # The email belongs to Jane Doe: accept her, then attach it to her.
    jane = client.post(f"/api/extraction-candidates/{entities[('Person', 'Jane Doe')].id}/review", json={"decision": "accept"}).json()
    targets = client.get(f"/api/extraction-candidates/{identifiers['email'].id}/identifier-targets").json()
    assert targets["document_entities"][0]["entity_id"] == jane["record"]["id"]
    accepted = client.post(f"/api/extraction-candidates/{identifiers['email'].id}/review",
                           json={"decision": "accept", "target_entity_id": jane["record"]["id"]}).json()
    assert accepted["record"]["prop"] == "email" and accepted["record"]["origin"].startswith(f"document:{document['id']}#paragraph 4@chars:")


def test_reading_progress_follows_openaleph_until_it_is_idle(live, tmp_path):
    """Files go straight to OpenAleph here (not through a Workbench upload,
    which in developer mode answers only once everything is read), so the
    status route can be asked while OpenAleph works on them."""
    client, _created = live
    inv = _investigation(live, "Wave A progress")
    assert client.get(f"/api/investigations/{inv}/corpus/status").json()["state"] == "no_collection"
    ensured = client.post(f"/api/investigations/{inv}/corpus/openaleph/ensure")
    assert ensured.status_code == 200, ensured.text
    collection_id = _remember_collection(live, inv)
    aleph = openaleph_corpus._client_factory()
    for number in range(3):
        memo = tmp_path / f"progress-{number}.txt"
        memo.write_text(MEMO, encoding="utf-8")
        aleph.ingest_upload(collection_id, memo, {"file_name": memo.name})

    seen: list[dict] = []
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        status = client.get(f"/api/investigations/{inv}/corpus/status").json()
        seen.append(status)
        if status["state"] == "idle" and any(row["state"] == "working" for row in seen):
            break
        time.sleep(0.25)
    working = [row for row in seen if row["state"] == "working"]
    assert working, [row["state"] for row in seen]
    assert all(row["collection_id"] == collection_id and row["active"] for row in working)
    labels = {stage["label"] for row in working for stage in row["stages"]}
    assert "Reading files" in labels, labels
    assert all(stage["pending"] + stage["running"] + stage["finished"] > 0 for row in working for stage in row["stages"])
    final = seen[-1]
    assert final["state"] == "idle" and final["stages"] == [] and final["active"] is False, final


def _email(*, attachment: bool = True) -> bytes:
    message = EmailMessage()
    message["From"] = "Jane Doe <jane.doe@meridian.example>"
    message["To"] = "Audit Desk <audit@kestrelwood.example>"
    message["Cc"] = "Maria Fernandez <maria@kestrelwood.example>"
    message["Subject"] = "Transfer to Meridian"
    message["Date"] = "Tue, 01 Sep 2026 10:00:00 +0000"
    message["Message-ID"] = "<transfer@meridian.example>"
    message.set_content("Please find the ledger attached. Jonathan Whitaker approved the transfer.")
    if attachment:
        message.add_attachment(b"Ledger: GB82WEST12345698765432 paid 10,000 EUR to Meridian Holdings Ltd.",
                               maintype="text", subtype="plain", filename="ledger.txt")
    return message.as_bytes()


def _reply() -> bytes:
    message = EmailMessage()
    message["From"] = "Audit Desk <audit@kestrelwood.example>"
    message["To"] = "Jane Doe <jane.doe@meridian.example>"
    message["Subject"] = "Re: Transfer to Meridian"
    message["Date"] = "Wed, 02 Sep 2026 09:00:00 +0000"
    message["Message-ID"] = "<reply@kestrelwood.example>"
    message["In-Reply-To"] = "<transfer@meridian.example>"
    message["References"] = "<transfer@meridian.example>"
    message.set_content("Thanks Jane, Rebecca Thornton will review the ledger.")
    return message.as_bytes()


def _zip(**files: str) -> bytes:
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, "w") as archive:
        for name, text in files.items():
            archive.writestr(name.replace("__", "/"), text)
    return bundle.getvalue()


def test_formats_only_openaleph_reads_are_accepted_and_read_by_it(live):
    client, _created = live
    formats = client.get("/api/document-formats").json()
    # .eml and .zip also have the Workbench's own reader (app/services/container_readers.py), so the formats only
    # OpenAleph reads are the ones it adds beyond that: word-processor, presentation and legacy office files, say.
    assert formats["reader"] == "openaleph" and {"doc", "pptx", "rtf"} <= set(formats["openaleph_only_extensions"])
    assert not {"eml", "zip"} & set(formats["openaleph_only_extensions"])
    inv = _investigation(live, "Wave A formats")
    email = _upload(live, inv, "transfer.eml", _email(), "message/rfc822")
    assert email["job"]["message"].startswith("Read by OpenAleph (1 paragraph(s))"), email["job"]["message"]
    bundle = _upload(live, inv, "bundle.zip", _zip(first="Jane Doe wrote to Meridian.", second="Angela Merkel replied."),
                     "application/zip")
    assert bundle["job"]["message"].startswith("Read by OpenAleph (no text)"), bundle["job"]["message"]
    assert bundle["chunk_count"] == 0
    refused = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "setup"},
                          files={"file": ("setup.exe", b"MZ\x90\x00", "application/octet-stream")})
    assert refused.status_code == 415, refused.text


def test_an_archives_files_and_an_emails_attachment_become_documents_under_them(live):
    client, _created = live
    inv = _investigation(live, "Wave A children")
    bundle = _upload(live, inv, "bundle.zip", _zip(
        letters__first="Jane Doe wrote to Meridian Holdings Ltd about the transfer.",
        second="Angela Merkel met Emmanuel Macron to discuss the audit."), "application/zip")
    assert bundle["job"]["message"] == "Read by OpenAleph (no text); 2 file(s) inside added as documents", bundle["job"]
    email = _upload(live, inv, "transfer.eml", _email(), "message/rfc822")
    assert email["job"]["message"].endswith("; 1 file(s) inside added as documents"), email["job"]["message"]

    documents = {row["filename"]: row for row in client.get(f"/api/investigations/{inv}/documents").json()}
    assert documents["bundle.zip"]["openaleph_schema"] == "Package" and documents["transfer.eml"]["openaleph_schema"] == "Email"
    expected = {"letters/first": (bundle["id"], "Jane Doe"), "second": (bundle["id"], "Angela Merkel"),
                "ledger.txt": (email["id"], "Meridian Holdings Ltd")}
    for name, (parent_id, caption) in expected.items():
        child = documents[name]
        assert child["parent_document_id"] == parent_id and child["extraction_status"] == "complete", child
        assert caption in [row.payload["caption"] for row in _proposals(child["id"], "entity")], name

    # OpenAleph answers no thread for a message nothing replies to (5.3.1).
    alone = client.get(f"/api/documents/{email['id']}/email").json()
    assert alone["thread"] == [] and alone["thread_note"] == "OpenAleph found no other message in this email's thread"
    reply = _upload(live, inv, "reply.eml", _reply(), "message/rfc822")
    shown = client.get(f"/api/documents/{email['id']}/email").json()
    assert shown["headers"]["subject"] == "Transfer to Meridian"
    assert shown["headers"]["from"] == ["Jane Doe <jane.doe@meridian.example>"]
    assert shown["headers"]["cc"] == ["Maria Fernandez <maria@kestrelwood.example>"]
    assert [(m["subject"], m["document_id"], m["current"]) for m in shown["thread"]] == [
        ("Transfer to Meridian", email["id"], True), ("Re: Transfer to Meridian", reply["id"], False)]


def test_the_corpus_is_searched_with_highlights_and_similar_documents_are_found(live):
    client, _created = live
    inv = _investigation(live, "Wave A search")
    memo = _upload(live, inv, "memo.txt", MEMO.encode(), "text/plain")
    minutes = _upload(live, inv, "minutes.pdf", _pdf(
        "Board minutes of Kestrelwood Holdings Limited.",
        "Page two: Jonathan Whitaker approved the Zanzibar transfer to Meridian Holdings Ltd."), "application/pdf")
    # The note repeats what it shares with the memo, so more_like_this has terms to go on (the same fixture as
    # PR #82 / #93, where this test kept passing).
    other = _upload(
        live, inv, "note.txt",
        b"Meridian Holdings Ltd records show Jane Doe paid Angela Merkel. "
        b"Meridian Holdings Ltd records show Jane Doe paid Angela Merkel.",
        "text/plain",
    )

    found = client.get(f"/api/investigations/{inv}/corpus/search", params={"q": "Zanzibar"}).json()
    assert found["state"] == "ok", found
    assert len(found["results"]) == 1, found
    (hit,) = found["results"]
    assert hit["document_id"] == minutes["id"] and hit["page_number"] == 2, hit
    assert any(piece["match"] and piece["text"] == "Zanzibar" for snippet in hit["highlights"] for piece in snippet), hit

    meridian = client.get(f"/api/investigations/{inv}/corpus/search", params={"q": "Meridian"}).json()
    assert {row["document_id"] for row in meridian["results"]} == {memo["id"], minutes["id"], other["id"]}, meridian

    # more_like_this reads Elasticsearch's term statistics, which can lag the
    # indexing a search already sees (run 69 of this workflow found none), so ask
    # again for a while before calling it a miss.
    deadline = time.monotonic() + 30
    while True:
        similar = client.get(f"/api/documents/{other['id']}/similar").json()
        assert similar["state"] == "ok", similar
        if memo["id"] in [row["document_id"] for row in similar["results"]] or time.monotonic() > deadline:
            break
        time.sleep(2)
    assert memo["id"] in [row["document_id"] for row in similar["results"]], similar
    assert other["id"] not in [row["document_id"] for row in similar["results"]]


def test_a_pdf_gets_its_names_on_their_pages(live):
    inv = _investigation(live, "Wave A pdf")
    document = _upload(live, inv, "minutes.pdf", _pdf(
        "Board minutes of Kestrelwood Holdings Limited. Maria Fernandez chaired the meeting.",
        "Page two: Jonathan Whitaker approved the transfer. Questions to audit@kestrelwood.example.",
    ), "application/pdf")
    assert document["job"]["message"].startswith("Read by OpenAleph (2 page(s)); "), document["job"]["message"]
    by_caption = {row.payload["caption"]: row for row in [*_proposals(document["id"], "entity"), *_proposals(document["id"], "identifier")]}
    assert by_caption["Maria Fernandez"].payload["locator"] == "page 1"
    assert by_caption["Jonathan Whitaker"].payload["locator"] == "page 2"
    assert by_caption["audit@kestrelwood.example"].candidate_type == "identifier"
