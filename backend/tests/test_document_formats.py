"""Which uploads are accepted, for the reader that reads them (ADR-0006, Wave A).

While OpenAleph reads uploads, every format one of ingest-file's ingestors
claims is accepted (app/services/openaleph_formats.py, generated from the
image); the Workbench's own reader keeps its narrower list. A file only
OpenAleph can read waits for OpenAleph: uploaded while OpenAleph is down,
its read fails with a reason the reporter can act on and can be retried.
Emails, mailboxes, .zip archives and workbooks are read by the Workbench
too (app/services/container_readers.py), so they no longer wait for it.
OpenAleph is faked (tests/openaleph_fake.py).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, Investigation
from app.schemas import responses as r
from app.services import openaleph_analysis, openaleph_formats
from app.services.document_formats import (
    LOCAL_EXTENSIONS, UnsupportedFormat, accepted_formats, check_upload, needs_openaleph, readable_by_openaleph,
)
from openaleph_fake import FakeOpenAleph, entity

ROOT = Path(__file__).resolve().parents[2]
DECK_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
EMAIL = (b"From: Jane Doe <jane.doe@meridian.example>\r\nTo: audit@kestrelwood.example\r\n"
         b"Subject: Transfer\r\n\r\nPlease find the ledger attached.\r\n")


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


@pytest.fixture()
def local_reader(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_reader", "local")
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Formats")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(name: str, data: bytes, mime: str = "application/octet-stream"):
    return TestClient(app).post("/api/documents/upload", data={"investigation_id": _investigation(), "title": name},
                                files={"file": (name, data, mime)})


# --- The lists ---------------------------------------------------------------------

def test_the_generated_list_matches_the_ingest_file_image_the_stack_runs():
    """Regenerate with tools/openaleph_ingest_formats.py when the OpenAleph tag changes."""
    for compose in ("docker-compose.yml", "docker-compose.prod.yml"):
        tags = set(re.findall(r"ghcr\.io/openaleph/ingest-file:\$\{OPENALEPH_TAG:-([^}]+)\}", (ROOT / compose).read_text()))
        assert tags == {openaleph_formats.INGEST_FILE_IMAGE.rsplit(":", 1)[1]}, compose


def test_openaleph_reads_everything_the_workbench_reads_and_more():
    recordings = {"mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "mp4", "m4v", "mov", "webm", "mkv"}
    photos = {"heic", "heif", "dng", "cr2", "cr3", "nef", "nrw", "arw", "raf", "rw2", "pef", "orf"}
    assert LOCAL_EXTENSIONS == {"txt", "md", "csv", "html", "htm", "pdf", "docx", "png", "jpg", "jpeg",
                                "eml", "mbox", "zip", "xlsx"} | recordings | photos
    # Recordings are transcribed on this computer whichever reader reads the rest (ADR-0020), and HEIC and RAW photos
    # are read through a viewable copy made here (ADR-0021): OpenAleph does not do either, and its list leaves some out.
    assert LOCAL_EXTENSIONS - recordings - photos <= openaleph_formats.EXTENSIONS
    assert {"eml", "msg", "mbox", "pst", "zip", "7z", "tar", "xlsx", "pptx", "odt", "jpg", "tiff"} <= openaleph_formats.EXTENSIONS
    assert {"message/rfc822", "application/zip", "application/pdf"} <= openaleph_formats.MIME_TYPES
    # Formats whose auction IgnoreIngestor wins are stored by OpenAleph but never read.
    assert not {"exe", "dll", "log", "ini"} & openaleph_formats.EXTENSIONS
    assert not {"application/x-dosexec", "text/css"} & openaleph_formats.MIME_TYPES
    assert {"json", "ics"} <= openaleph_formats.EXTENSIONS


@pytest.mark.parametrize("filename, mime, expected", [
    ("Transfer.EML", None, True),                       # extension, any case
    ("message", "message/rfc822", True),                # MIME type alone
    ("ledger.bin", "application/zip; charset=binary", True),
    ("setup.exe", "application/octet-stream", False),   # only IgnoreIngestor claims it
    ("server.log", "text/plain", False),                # IgnoreIngestor (2) outbids plain text (1)
    ("records.json", "application/json", True),         # JSON (3) outbids IgnoreIngestor (2)
    ("meeting.ics", None, True),                        # Calendar (10) outbids IgnoreIngestor (2)
    (None, None, False),
])
def test_a_file_goes_to_the_ingestor_ingest_files_auction_would_pick(filename, mime, expected):
    assert readable_by_openaleph(filename, mime) is expected


def test_the_upload_check_follows_the_reader(fake, monkeypatch):
    check_upload("transfer.eml", None)
    check_upload("deck.pptx", None)
    with pytest.raises(UnsupportedFormat, match=r"^OpenAleph cannot read \.exe files, so this file was not uploaded\.$"):
        check_upload("setup.exe", "application/octet-stream")
    monkeypatch.setattr(settings, "document_reader", "local")
    check_upload("memo.txt", "text/plain")
    check_upload("transfer.eml", "message/rfc822")   # the Workbench reads emails itself
    with pytest.raises(UnsupportedFormat) as refused:
        check_upload("deck.pptx", DECK_MIME)
    assert str(refused.value) == (
        "The Workbench's own reader reads .aac, .arw, .cr2, .cr3, .csv, .dng, .docx, .eml, .flac, .heic, .heif, .htm, .html, .jpeg, .jpg, .m4a, .m4v, .mbox, .md, "
        ".mkv, .mov, .mp3, .mp4, .nef, .nrw, .oga, .ogg, .opus, .orf, .pdf, .pef, .png, .raf, .rw2, .txt, .wav, .webm, .xlsx, .zip files; "
        "it cannot read .pptx files, "
        "so this file was not uploaded. OpenAleph reads them, but this deployment does not read uploads with OpenAleph.")
    assert needs_openaleph("deck.pptx") and not needs_openaleph("memo.TXT")
    assert not any(needs_openaleph(name) for name in ("transfer.eml", "inbox.mbox", "bundle.ZIP", "ledger.xlsx"))


def test_the_formats_route_lists_what_uploads_accept_now(fake, monkeypatch):
    client = TestClient(app)
    with_openaleph = client.get("/api/document-formats").json()
    assert with_openaleph["reader"] == "openaleph"
    assert with_openaleph["ingest_file_image"] == openaleph_formats.INGEST_FILE_IMAGE
    assert set(with_openaleph["extensions"]) == openaleph_formats.EXTENSIONS | LOCAL_EXTENSIONS
    only = with_openaleph["openaleph_only_extensions"]
    assert "pptx" in only and "msg" in only and not {"pdf", "eml", "mbox", "zip", "xlsx"} & set(only)
    assert ".eml" in with_openaleph["accept"].split(",") and "message/rfc822" in with_openaleph["accept"].split(",")
    assert with_openaleph["max_bytes"] == settings.max_document_bytes
    monkeypatch.setattr(settings, "document_reader", "local")
    local = client.get("/api/document-formats").json()
    assert local["reader"] == "workbench" and local["mime_types"] == [] and local["openaleph_only_extensions"] == []
    assert local["accept"] == (".aac,.arw,.cr2,.cr3,.csv,.dng,.docx,.eml,.flac,.heic,.heif,.htm,.html,.jpeg,.jpg,.m4a,.m4v,.mbox,.md,"
                               ".mkv,.mov,.mp3,.mp4,.nef,.nrw,.oga,.ogg,.opus,.orf,.pdf,.pef,.png,.raf,.rw2,.txt,.wav,.webm,.xlsx,.zip")
    assert local["ingest_file_image"] is None
    r.DocumentFormatsOut.model_validate(with_openaleph)
    r.DocumentFormatsOut.model_validate(local)


# --- Uploading ---------------------------------------------------------------------

def test_an_email_is_accepted_and_read_by_openaleph(fake):
    reply = _upload("transfer.eml", EMAIL, "message/rfc822")
    assert reply.status_code == 200, reply.text
    assert reply.json()["job"]["message"].startswith("Read by OpenAleph"), reply.json()["job"]
    assert fake.uploads and fake.uploads[0][1].name.endswith("transfer.eml")


def test_a_kind_of_file_nobody_reads_is_refused_before_it_is_stored(fake, tmp_path):
    reply = _upload("setup.exe", b"MZ\x90\x00", "application/octet-stream")
    assert reply.status_code == 415
    assert reply.json()["detail"] == "OpenAleph cannot read .exe files, so this file was not uploaded."
    assert not fake.uploads
    with SessionLocal() as db:
        assert db.scalar(select(Document).where(Document.filename == "setup.exe")) is None


def test_the_workbench_reader_keeps_its_own_list(local_reader):
    assert _upload("deck.pptx", b"PK\x03\x04", DECK_MIME).status_code == 415
    assert _upload("memo.txt", b"Jane Doe met the board.", "text/plain").status_code == 200
    email = _upload("transfer.eml", EMAIL, "message/rfc822")
    assert email.status_code == 200 and email.json()["extraction_status"] == "complete", email.text


def test_a_file_only_openaleph_reads_waits_for_openaleph_and_can_be_retried(fake):
    fake.refuse_uploads = ConnectionError("OpenAleph is not running")
    reply = _upload("deck.pptx", b"Jane Doe presented the ledger.", DECK_MIME)
    assert reply.status_code == 422, reply.text
    detail = reply.json()["detail"]
    expected = "deck.pptx needs OpenAleph to read; retry when it is running"
    assert detail["error"].startswith(expected), detail
    assert detail["job"]["status"] == "failed" and detail["job"]["error"].startswith(expected)
    with SessionLocal() as db:
        doc = db.get(Document, detail["document"]["id"])
        assert doc.extraction_status == "failed" and doc.extraction_error.startswith(expected)

    fake.refuse_uploads = None   # OpenAleph is back
    retried = TestClient(app).post(f"/api/jobs/{detail['job']['id']}/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "succeeded", retried.json()
    with SessionLocal() as db:
        doc = db.get(Document, detail["document"]["id"])
        assert doc.extraction_status == "complete" and doc.extraction_error is None


def test_a_file_the_workbench_reads_too_falls_back_when_openaleph_is_down(fake):
    fake.refuse_uploads = ConnectionError("OpenAleph is not running")
    reply = _upload("memo.txt", b"Jane Doe met the board.\n\nShe signed.", "text/plain")
    assert reply.status_code == 200, reply.text
    assert reply.json()["job"]["message"].startswith("Read by the Workbench's own reader; OpenAleph did not accept the file")


def test_an_email_falls_back_to_the_workbench_reader_when_openaleph_is_down(fake):
    fake.refuse_uploads = ConnectionError("OpenAleph is not running")
    reply = _upload("transfer.eml", EMAIL, "message/rfc822")
    assert reply.status_code == 200, reply.text
    document = reply.json()
    assert document["extraction_status"] == "complete", document
    assert document["job"]["message"].startswith("Read by the Workbench's own reader; OpenAleph did not accept the file")
    with SessionLocal() as db:
        locators = list(db.scalars(select(DocumentChunk.locator).where(DocumentChunk.document_id == document["id"])
                                   .order_by(DocumentChunk.ordinal)))
    assert locators == ["headers", "body, paragraph 1"]


def test_an_email_openaleph_finds_no_text_in_gets_the_workbench_reading(fake):
    """OpenAleph often gives an email no text; its proposals would then have
    no passage. The Workbench's own reading is used as the text instead."""
    fake.entities["1.upload"] = entity("1.upload", "Email", fileName="transfer.eml")
    reply = _upload("transfer.eml", EMAIL, "message/rfc822")
    assert reply.status_code == 200, reply.text
    document = reply.json()
    assert document["extraction_status"] == "complete" and document["chunk_count"] == 2, document
    assert "OpenAleph read this file and found no text in it." not in (document["extraction_issues"] or [])
    assert document["job"]["message"].startswith("Read by OpenAleph (2 paragraph(s))"), document["job"]
    assert document["job"]["message"].endswith("OpenAleph found no text, so the text is the Workbench's own reading")
    with SessionLocal() as db:
        chunks = list(db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document["id"])
                                 .order_by(DocumentChunk.ordinal)))
    assert [c.locator for c in chunks] == ["headers", "body, paragraph 1"]
    assert chunks[1].text == "Please find the ledger attached."


def test_openaleph_reading_a_file_without_text_completes_it_with_an_issue(fake):
    """A package's files are read as documents of their own
    (tests/test_openaleph_children.py), so its own empty read stands."""
    fake.entities["1.upload"] = entity("1.upload", "Package", fileName="bundle.zip")
    reply = _upload("bundle.zip", b"PK\x03\x04", "application/zip")
    assert reply.status_code == 200, reply.text
    document = reply.json()
    assert document["extraction_status"] == "complete" and document["chunk_count"] == 0
    assert document["extraction_issues"] == ["OpenAleph read this file and found no text in it."]
    assert document["job"]["message"].startswith("Read by OpenAleph (no text)"), document["job"]
    with SessionLocal() as db:
        assert db.scalar(select(DocumentChunk).where(DocumentChunk.document_id == document["id"])) is None


def test_openaleph_failing_to_read_a_file_only_it_reads_says_why(fake):
    fake.entities["1.upload"] = entity("1.upload", "Document", status="failure", processingError="Could not open archive")
    reply = _upload("bundle.7z", b"7z\xbc\xaf\x27\x1c", "application/x-7z-compressed")
    assert reply.status_code == 422
    assert reply.json()["detail"]["error"] == (
        "OpenAleph could not read the file: Could not open archive; the Workbench's own reader cannot read .7z files")
