"""OpenAleph reads uploads; the Workbench's own reader is the fallback (ADR-0004).

OpenAleph is faked at its HTTP-facing seams (sync, entity fetch, page
search); the response shapes are the ones OpenAleph 5.3.1 returned in the
Docker stack on 2026-10-01 (see app/services/openaleph_reader.py).
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest

from app.core.config import settings
from app.db.session import SessionLocal
from app.jobs.handlers import HANDLERS
from app.jobs.records import create_job, execute_job
from app.models.domain import BackgroundJob, Document, DocumentChunk, ExtractionCandidate, Investigation
from app.services import openaleph_corpus, openaleph_reader
from app.services.documents import store_document
from app.services.openaleph_reader import OpenAlephUnavailable, read_with_openaleph

TEXT = b"Acme Holdings Inc. paid the Harbor Commission on 12 March 2024.\n\nMaria Lopez approved the contract.\n"


@pytest.fixture()
def openaleph_on(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.1)
    monkeypatch.setattr(settings, "enable_local_entity_suggestions", False)


def _document(tmp_path, filename="memo.txt", data=TEXT) -> str:
    with SessionLocal() as db:
        inv = Investigation(name="OpenAleph reading")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = store_document(db, investigation_id=inv.id, title="Memo", filename=filename, mime_type="text/plain",
                             data=data, storage_dir=tmp_path / "docs")
        return doc.id


def _synced(monkeypatch, record_id="2.abc", collection_id="7"):
    calls: list[str] = []

    def fake_sync(db, document_id):
        calls.append(document_id)
        return SimpleNamespace(status="synced", provider_record_id=record_id, collection_id=collection_id, error=None)

    monkeypatch.setattr(openaleph_corpus, "sync_document_to_openaleph", fake_sync)
    return calls


def _entity(status, schema="Pages", **props):
    properties = {"processingStatus": [status]} if status else {}
    properties.update({key: [value] for key, value in props.items()})
    return {"id": "2.abc", "schema": schema, "properties": properties}


def _page(number, text, page_id=None):
    return {"id": page_id or f"page-{number}", "schema": "Page", "properties": {"index": [str(number)], "bodyText": [text]}}


def _run(document_id) -> tuple[str | None, BackgroundJob]:
    with SessionLocal() as db:
        inv_id = db.get(Document, document_id).investigation_id
        job_id = create_job(db, kind="extract_document", investigation_id=inv_id, subject_type="document", subject_id=document_id).id
    status = execute_job(SessionLocal, job_id, HANDLERS)
    with SessionLocal() as db:
        job = db.get(BackgroundJob, job_id)
        db.expunge(job)
    return status, job


def test_paged_document_is_read_by_openaleph_page_by_page(tmp_path, monkeypatch, openaleph_on):
    document_id = _document(tmp_path, "scan.pdf", b"%PDF-not-really")
    _synced(monkeypatch)
    answers = iter([None, _entity(None), _entity("success")])  # not indexed, indexed but busy, done
    monkeypatch.setattr(openaleph_reader, "fetch_openaleph_entity", lambda record_id: next(answers))
    pages = [_page(2, "The council approved the contract on 3 May."), _page(1, "Acme Holdings Inc. paid the Harbor Commission."), _page(3, "   ")]
    monkeypatch.setattr(openaleph_corpus, "_openaleph_search", lambda **kw: pages)
    monkeypatch.setattr(openaleph_corpus, "_openaleph_mention_search",
                        lambda **kw: [{"id": "m1", "schema": "Mention", "properties": {"name": ["Acme Holdings Inc."], "detectedSchema": ["Company"]}}])
    monkeypatch.setattr(openaleph_corpus, "get_document_sync",
                        lambda db, document_id: SimpleNamespace(status="synced", provider_record_id="2.abc", collection_id="7"))

    status, job = _run(document_id)
    assert status == "succeeded", job.error
    assert job.message == "Read by OpenAleph (2 page(s)); 1 name(s) from OpenAleph"
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        assert doc.extraction_status == "complete"
        assert doc.extraction_issues == ["1 of 3 page(s) produced no text in OpenAleph (blank, or unreadable even with OCR)."]
        chunks = db.query(DocumentChunk).filter_by(document_id=document_id).order_by(DocumentChunk.ordinal).all()
        assert [(c.locator, c.page_number) for c in chunks] == [("page 1", 1), ("page 2", 2)]
        candidates = db.query(ExtractionCandidate).filter_by(document_id=document_id).all()
        kinds = sorted(c.candidate_type for c in candidates)
        assert kinds == ["claim", "entity", "evidence", "evidence"]  # "Inc." splits page 1 into two short sentences
        evidence = next(c for c in candidates if c.candidate_type == "evidence" and c.chunk_id == chunks[0].id)
        assert evidence.payload["provenance"] == {
            "provider": "openaleph", "collection_id": "7", "provider_document_id": "2.abc",
            "extraction_method": "openaleph_ingest_file", "provider_entity_id": "page-1", "provider_schema": "Page",
        }
        entity = next(c for c in candidates if c.candidate_type == "entity")
        assert entity.payload["provenance"]["extraction_method"] == "openaleph_ftm_analyze"


def test_unpaged_text_is_read_by_openaleph_paragraph_by_paragraph(tmp_path, monkeypatch, openaleph_on):
    document_id = _document(tmp_path)
    _synced(monkeypatch, record_id="1.txt")
    body = "Acme Holdings Inc. paid the Harbor Commission on 12 March 2024.\n\nMaria Lopez, the commission chair,\napproved the contract."
    monkeypatch.setattr(openaleph_reader, "fetch_openaleph_entity", lambda record_id: _entity("success", "PlainText", bodyText=body))
    monkeypatch.setattr(openaleph_corpus, "_openaleph_search", lambda **kw: [])
    monkeypatch.setattr(openaleph_corpus, "_openaleph_mention_search", lambda **kw: [])
    status, job = _run(document_id)
    assert status == "succeeded" and job.message == "Read by OpenAleph (2 paragraph(s))"
    with SessionLocal() as db:
        chunks = db.query(DocumentChunk).filter_by(document_id=document_id).order_by(DocumentChunk.ordinal).all()
        assert [(c.locator, c.text) for c in chunks] == [
            ("paragraph 1", "Acme Holdings Inc. paid the Harbor Commission on 12 March 2024."),
            ("paragraph 2", "Maria Lopez, the commission chair, approved the contract."),
        ]


@pytest.mark.parametrize("scenario, reason", [
    ("unreachable", "could not send the file to OpenAleph (ConnectError)"),
    ("rejected", "OpenAleph did not accept the file (HTTP 413)"),
    ("failure", "OpenAleph could not read the file: Unsupported file format"),
    ("timeout", "OpenAleph had not finished reading after 1 minute(s)"),
    ("empty", "OpenAleph returned no text for this file"),
])
def test_workbench_reader_is_the_fallback_when_openaleph_cannot_deliver(tmp_path, monkeypatch, openaleph_on, scenario, reason):
    document_id = _document(tmp_path)
    if scenario == "unreachable":
        def boom(db, document_id):
            raise httpx.ConnectError("refused")
        monkeypatch.setattr(openaleph_corpus, "sync_document_to_openaleph", boom)
    elif scenario == "rejected":
        monkeypatch.setattr(openaleph_corpus, "sync_document_to_openaleph",
                            lambda db, document_id: SimpleNamespace(status="failed", provider_record_id=None, collection_id="7", error="HTTP 413"))
    else:
        _synced(monkeypatch)
    entity = {"failure": _entity("failure", processingError="Unsupported file format"), "timeout": _entity(None),
              "empty": _entity("success", "PlainText", bodyText="  ")}.get(scenario)
    monkeypatch.setattr(openaleph_reader, "fetch_openaleph_entity", lambda record_id: entity)
    monkeypatch.setattr(openaleph_corpus, "_openaleph_search", lambda **kw: [])
    monkeypatch.setattr(settings, "openaleph_read_timeout_seconds", 0.3)

    status, job = _run(document_id)
    assert status == "succeeded", job.error
    assert job.message == f"Read by the Workbench's own reader; {reason}"
    with SessionLocal() as db:
        chunks = db.query(DocumentChunk).filter_by(document_id=document_id).all()
        assert [c.locator for c in sorted(chunks, key=lambda c: c.ordinal)] == ["line 1", "line 3"]
        assert all("provenance" not in (c.payload or {}) for c in db.query(ExtractionCandidate).filter_by(document_id=document_id))


def test_local_reader_setting_never_contacts_openaleph(tmp_path, monkeypatch, openaleph_on):
    monkeypatch.setattr(settings, "document_reader", "local")
    monkeypatch.setattr(openaleph_corpus, "sync_document_to_openaleph", lambda db, document_id: pytest.fail("contacted OpenAleph"))
    status, job = _run(_document(tmp_path))
    assert status == "succeeded" and job.message == "Document read"


def test_reading_choice(monkeypatch):
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert openaleph_reader.reading_with_openaleph() is False
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    assert openaleph_reader.reading_with_openaleph() is True
    monkeypatch.setattr(settings, "document_reader", "local")
    assert openaleph_reader.reading_with_openaleph() is False
    monkeypatch.setattr(settings, "document_reader", "openaleph")
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert openaleph_reader.reading_with_openaleph() is True


def test_lost_contact_while_waiting_is_a_fallback_reason(tmp_path, monkeypatch, openaleph_on):
    document_id = _document(tmp_path)
    _synced(monkeypatch)

    def drop(record_id):
        raise httpx.ReadTimeout("slow")

    with SessionLocal() as db, pytest.raises(OpenAlephUnavailable, match="lost contact with OpenAleph"):
        read_with_openaleph(db, document_id, lambda p, m: None, fetch_entity=drop)


def test_auth_uses_the_api_key_else_the_single_user_token(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json={"app": {"title": "OpenAleph"}, "token": "single-user-token"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
    monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {})
    monkeypatch.setattr(settings, "openaleph_api_key", "configured-key")
    assert openaleph_corpus.openaleph_auth_headers(transport) == {"Authorization": "ApiKey configured-key"}
    assert seen == []
    monkeypatch.setattr(settings, "openaleph_api_key", "")
    assert openaleph_corpus.openaleph_auth_headers(transport) == {"Authorization": "Token single-user-token"}
    assert openaleph_corpus.openaleph_auth_headers(transport) == {"Authorization": "Token single-user-token"}
    assert seen == ["/api/2/metadata"], "the token is reused, not fetched per request"

    monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {})
    no_token = httpx.MockTransport(lambda request: httpx.Response(200, json={"app": {}}))
    assert openaleph_corpus.openaleph_auth_headers(no_token) == {}
    down = httpx.MockTransport(lambda request: httpx.Response(503))
    assert openaleph_corpus.openaleph_auth_headers(down) == {}
