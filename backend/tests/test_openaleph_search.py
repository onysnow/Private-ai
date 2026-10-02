"""Searching the corpus in OpenAleph, and similar documents (ADR-0006, Wave A).

OpenAleph is faked (tests/openaleph_fake.py) with the reply shapes
OpenAleph 5.3.1 returned live on 2026-10-02: with ``filter:schemata`` set to
Document and Page, a PDF's matching page comes back as a ``Page`` with its
``index`` and ``document`` beside the whole ``Pages`` document; highlights
mark each match with ``<em>`` and escape the text around it.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.schemas import responses as r
from app.services import openaleph_analysis
from app.services.openaleph_search import highlight_segments, search_corpus, similar_documents
from openaleph_fake import FakeOpenAleph, entity, page


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    fake = FakeOpenAleph().install(monkeypatch)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.01)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 5)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setattr(openaleph_analysis, "SEARCH_REFRESH_SECONDS", 0)
    return fake


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Corpus search")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(investigation_id: str, name: str, data: bytes, mime: str) -> dict:
    reply = TestClient(app).post("/api/documents/upload", data={"investigation_id": investigation_id, "title": name},
                                 files={"file": (name, data, mime)})
    assert reply.status_code == 200, reply.text
    return reply.json()


def _corpus(fake: FakeOpenAleph) -> tuple[str, dict, dict]:
    """A memo (1.upload) and a two-page PDF (2.upload) read by OpenAleph."""
    inv = _investigation()
    memo = _upload(inv, "memo.txt", b"Jane Doe paid Zanzibar Trading.", "text/plain")
    fake.entities["2.upload"] = entity("2.upload", "Pages", fileName="minutes.pdf")
    fake.pages["2.upload"] = [page("2.upload", 1, "Board minutes."), page("2.upload", 2, "The Zanzibar transfer was approved.")]
    minutes = _upload(inv, "minutes.pdf", b"%PDF-", "application/pdf")
    return inv, memo, minutes


def test_a_highlight_becomes_plain_pieces_with_the_matches_marked():
    assert highlight_segments("Paid &lt;b&gt; <em>Zanzibar</em> &amp; co") == [
        {"text": "Paid <b> ", "match": False}, {"text": "Zanzibar", "match": True}, {"text": " & co", "match": False}]


def test_search_finds_documents_and_the_page_that_matched(fake):
    inv, memo, minutes = _corpus(fake)
    fake.search_hits = [
        {"id": "1.upload", "schema": "PlainText", "caption": "memo.txt", "score": 3.5,
         "highlight": {"content": ["Jane Doe paid <em>Zanzibar</em> Trading."], "text": ["context only"]}},
        {"id": "2.upload-page-2", "schema": "Page", "caption": "minutes.pdf", "score": 2.0,
         "properties": {"index": ["2"], "document": [{"id": "2.upload", "schema": "Pages"}]},  # nested, as search nests it
         "highlight": {"content": ["The <em>Zanzibar</em> transfer was approved."]}},
        {"id": "2.upload", "schema": "Pages", "caption": "minutes.pdf", "score": 1.0,
         "highlight": {"content": ["The <em>Zanzibar</em> transfer was approved."]}},
        {"id": "someone-elses", "schema": "PlainText", "caption": "uploaded in OpenAleph", "score": 0.5},
    ]
    reply = TestClient(app).get(f"/api/investigations/{inv}/corpus/search", params={"q": "Zanzibar"})
    assert reply.status_code == 200, reply.text
    found = reply.json()
    assert found["state"] == "ok" and found["query"] == "Zanzibar" and found["total"] == 4
    assert [(hit["document_id"], hit["page_number"], hit["schema"]) for hit in found["results"]] == [
        (memo["id"], None, "PlainText"), (minutes["id"], 2, "Page"), (None, None, "PlainText")]
    assert found["results"][0]["highlights"][0] == [
        {"text": "Jane Doe paid ", "match": False}, {"text": "Zanzibar", "match": True}, {"text": " Trading.", "match": False}]
    # The fragment with a match comes first.
    assert found["results"][0]["highlights"][1] == [{"text": "context only", "match": False}]
    (search,) = [request for request in fake.calls("GET", "/api/2/search") if request.url.params.get("q") == "Zanzibar"]
    assert search.url.params.get_list("filter:schemata") == ["Document", "Page"]
    assert search.url.params["highlight"] == "true" and search.url.params["filter:collection_id"] == "7"


def test_search_says_why_there_is_nothing_to_search(fake, monkeypatch):
    inv = _investigation()
    client = TestClient(app)
    assert client.get(f"/api/investigations/{inv}/corpus/search", params={"q": "x"}).json()["state"] == "no_collection"
    assert client.get("/api/investigations/missing/corpus/search", params={"q": "x"}).status_code == 404
    assert client.get(f"/api/investigations/{inv}/corpus/search", params={"q": ""}).status_code == 422
    inv2, _memo, _minutes = _corpus(fake)
    fake.fail["/api/2/search"] = 502
    down = client.get(f"/api/investigations/{inv2}/corpus/search", params={"q": "x"}).json()
    assert down["state"] == "unreachable" and down["detail"] == "OpenAleph answered 502 to the search" and down["results"] == []
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert client.get(f"/api/investigations/{inv2}/corpus/search", params={"q": "x"}).json()["state"] == "not_configured"


def test_similar_documents_are_linked_and_listed_once(fake):
    inv, memo, minutes = _corpus(fake)
    fake.similar["1.upload"] = [
        {"id": "2.upload-page-2", "schema": "Page", "caption": "minutes.pdf", "score": 4.0, "properties": {"index": ["2"], "document": ["2.upload"]}},
        {"id": "2.upload", "schema": "Pages", "caption": "minutes.pdf", "score": 3.0},
        {"id": "1.upload", "schema": "PlainText", "caption": "memo.txt", "score": 9.0},
    ]
    reply = TestClient(app).get(f"/api/documents/{memo['id']}/similar")
    assert reply.status_code == 200, reply.text
    similar = reply.json()
    assert similar["state"] == "ok"
    assert [(row["document_id"], row["filename"], row["page_number"]) for row in similar["results"]] == [(minutes["id"], "minutes.pdf", 2)]
    (request,) = fake.calls("GET", "/api/2/entities/1.upload/more_like_this")
    assert request.url.params["filter:collection_id"] == "7"


def test_similar_documents_of_a_document_openaleph_does_not_hold(fake, monkeypatch):
    monkeypatch.setattr(settings, "document_reader", "local")
    inv = _investigation()
    memo = _upload(inv, "memo.txt", b"Jane Doe met the board.", "text/plain")
    client = TestClient(app)
    assert client.get(f"/api/documents/{memo['id']}/similar").json()["state"] == "no_collection"
    assert client.get("/api/documents/missing/similar").status_code == 404


def test_the_replies_keep_their_declared_shape(fake):
    inv, memo, _minutes = _corpus(fake)
    fake.search_hits = [{"id": "1.upload", "schema": "PlainText", "caption": "memo.txt", "highlight": {"content": ["<em>Jane</em>"]}}]
    fake.similar["1.upload"] = []
    with SessionLocal() as db:
        found = search_corpus(db, inv, "Jane")
        r.CorpusSearchOut.model_validate(found)
        assert r.CorpusSearchOut.model_validate(found).model_dump(mode="json", by_alias=True)["results"][0]["schema"] == "PlainText"
        r.SimilarDocumentsOut.model_validate(similar_documents(db, memo["id"]))

        def down(_path, _params):
            raise httpx.ConnectError("refused")

        assert search_corpus(db, inv, "Jane", fetch=down)["detail"] == "OpenAleph did not answer (ConnectError)"
