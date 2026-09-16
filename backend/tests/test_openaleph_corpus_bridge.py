from pathlib import Path

import pytest

from app.core.config import settings
from app.models.domain import Investigation, DocumentCorpusSync, InvestigationCorpusBinding
from app.db.session import SessionLocal, engine, Base
from app.services.documents import ingest_document
from app.services.openaleph_corpus import ensure_openaleph_collection, sync_document_to_openaleph
from app.services.exports import collect_investigation_records





@pytest.fixture(autouse=True)
def _clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

class FakeOpenAlephClient:
    def __init__(self):
        self.collections = {}
        self.uploads = []

    def load_collection_by_foreign_id(self, foreign_id, config=None):
        if foreign_id not in self.collections:
            self.collections[foreign_id] = {
                "id": "oa-collection-1",
                "foreign_id": foreign_id,
                "label": (config or {}).get("label", foreign_id),
            }
        return self.collections[foreign_id]

    def ingest_upload(self, *, collection_id, file_path, metadata, sync=False, index=True):
        self.uploads.append((collection_id, Path(file_path), metadata, sync, index))
        return {"id": "oa-document-1", "foreign_id": metadata["foreign_id"]}


def test_openaleph_corpus_binding_and_document_sync(tmp_path, monkeypatch):
    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Gary investigation", description="Local corpus")
    db.add(inv); db.commit(); db.refresh(inv)
    client = FakeOpenAlephClient()

    binding = ensure_openaleph_collection(db, inv.id, client_factory=lambda: client)
    assert binding.collection_id == "oa-collection-1"
    assert binding.foreign_id == f"journalism-workbench:{inv.id}"
    assert db.query(InvestigationCorpusBinding).count() == 1

    # Idempotent binding: do not create a second OpenAleph collection mapping.
    same = ensure_openaleph_collection(db, inv.id, client_factory=lambda: client)
    assert same.id == binding.id
    assert db.query(InvestigationCorpusBinding).count() == 1

    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Evidence note",
        filename="evidence.txt",
        mime_type="text/plain",
        data=b"Eddie Melton served in public office. This is a test document.",
        storage_dir=tmp_path / "documents",
    )
    sync_row = sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)
    assert sync_row.status == "synced"
    assert sync_row.collection_id == binding.collection_id
    assert sync_row.provider_record_id == "oa-document-1"
    assert sync_row.response_json["foreign_id"] == f"journalism-workbench-document:{doc.id}"
    assert len(client.uploads) == 1
    coll, path, metadata, sync, index = client.uploads[0]
    assert coll == binding.collection_id
    assert path.read_bytes().startswith(b"Eddie Melton")
    assert metadata["sha256"] == doc.sha256
    assert sync is False and index is True

    # Already-synced documents are not uploaded a second time.
    again = sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)
    assert again.id == sync_row.id
    assert len(client.uploads) == 1
    assert db.query(DocumentCorpusSync).count() == 1
    records = collect_investigation_records(db, inv.id)
    assert len(records["investigation_corpus_bindings"]) == 1
    assert len(records["document_corpus_syncs"]) == 1


def test_openaleph_sync_failure_is_persisted(tmp_path, monkeypatch):
    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Failure case")
    db.add(inv); db.commit(); db.refresh(inv)

    class FailingClient(FakeOpenAlephClient):
        def ingest_upload(self, **kwargs):
            raise RuntimeError("OpenAleph unavailable")

    client = FailingClient()
    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Document",
        filename="note.txt",
        mime_type="text/plain",
        data=b"A document that should remain in Workbench when OpenAleph sync fails.",
        storage_dir=tmp_path / "documents",
    )
    row = sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)
    assert row.status == "failed"
    assert "OpenAleph unavailable" in (row.error or "")
    assert db.get(type(doc), doc.id) is not None


def test_openaleph_page_text_is_staged_for_human_review(tmp_path, monkeypatch):
    from sqlalchemy import select
    from app.models.domain import DocumentChunk, ExtractionCandidate, Evidence
    from app.services.openaleph_corpus import import_openaleph_evidence_candidates
    from app.services.documents import review_candidate, serialize_extraction_lineage

    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Extraction bridge")
    db.add(inv); db.commit(); db.refresh(inv)
    client = FakeOpenAlephClient()
    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Scanned filing",
        filename="filing.txt",
        mime_type="text/plain",
        data=b"Local compatibility extraction remains available during migration.",
        storage_dir=tmp_path / "documents",
    )
    sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)

    def fake_searcher(*, collection_id, document_record_id):
        assert collection_id == "oa-collection-1"
        assert document_record_id == "oa-document-1"
        return [
            {
                "id": "oa-page-1",
                "schema": "Page",
                "properties": {"index": ["1"], "bodyText": ["Exact extracted page text from OpenAleph."]},
            },
            {
                "id": "oa-page-2",
                "schema": "Page",
                "properties": {"index": ["2"], "bodyText": ["Second page extracted by ingest-file."]},
            },
        ]

    evidence_before = db.query(Evidence).count()
    result = import_openaleph_evidence_candidates(db, doc.id, searcher=fake_searcher)
    assert result["created_candidates"] == 2
    assert result["review_required"] is True
    candidates = [
        row for row in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id)).all()
        if (row.payload or {}).get("provenance", {}).get("provider") == "openaleph"
    ]
    assert len(candidates) == 2
    assert all(row.review_status == "proposed" for row in candidates)
    assert db.query(Evidence).count() == evidence_before

    lineage = serialize_extraction_lineage(db, candidates[0])
    assert lineage["chunk"]["extraction_method"] == "openaleph_ingest_file"
    assert lineage["candidate"]["payload"]["provenance"]["provider_entity_id"] == "oa-page-1"

    accepted = review_candidate(db, candidates[0], decision="accept", note="Reporter verified against the source page")
    assert accepted["candidate"].review_status == "accepted"
    evidence = db.get(Evidence, accepted["record"]["id"])
    assert evidence.quote == "Exact extracted page text from OpenAleph."
    assert evidence.locator == "openaleph:page:oa-page-1"

    # Import is idempotent: already staged provider pages are not duplicated.
    again = import_openaleph_evidence_candidates(db, doc.id, searcher=fake_searcher)
    assert again["created_candidates"] == 0
    assert db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id, DocumentChunk.locator.like("openaleph:%"))).all()


def test_openaleph_import_requires_synced_provider_record(tmp_path, monkeypatch):
    from app.services.openaleph_corpus import import_openaleph_evidence_candidates

    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Unsynced extraction")
    db.add(inv); db.commit(); db.refresh(inv)
    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Not synced",
        filename="note.txt",
        mime_type="text/plain",
        data=b"This document has not been synchronized to OpenAleph yet.",
        storage_dir=tmp_path / "documents",
    )
    try:
        import_openaleph_evidence_candidates(db, doc.id, searcher=lambda **kwargs: [])
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "successfully synchronized" in str(exc)


def test_openaleph_search_uses_exact_collection_and_parent_filters(monkeypatch):
    import httpx
    from app.services.openaleph_corpus import _openaleph_search

    monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "secret")

    def handler(request: httpx.Request):
        assert request.url.path == "/api/2/search"
        params = request.url.params
        assert params["q"] == "*"
        assert params["filter:collection_id"] == "collection-7"
        assert params["filter:schema"] == "Page"
        assert params["filter:properties.document"] == "document-9"
        assert request.headers["authorization"] == "ApiKey secret"
        return httpx.Response(200, json={"results": [{"id": "page-1", "schema": "Page", "properties": {"bodyText": ["Text"]}}]})

    rows = _openaleph_search(
        collection_id="collection-7",
        document_record_id="document-9",
        transport=httpx.MockTransport(handler),
    )
    assert rows[0]["id"] == "page-1"


def test_openaleph_mentions_are_staged_as_entity_candidates_without_auto_resolution(tmp_path, monkeypatch):
    from sqlalchemy import select
    from app.models.domain import ExtractionCandidate, Entity, Statement
    from app.services.openaleph_corpus import import_openaleph_entity_candidates
    from app.services.documents import review_candidate

    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Entity extraction bridge")
    db.add(inv); db.commit(); db.refresh(inv)
    client = FakeOpenAlephClient()
    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Investigative filing",
        filename="filing.txt",
        mime_type="text/plain",
        data=b"NiSource and Eddie Melton are mentioned in this filing.",
        storage_dir=tmp_path / "documents",
    )
    sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)

    def fake_searcher(*, collection_id, document_record_id):
        assert collection_id == "oa-collection-1"
        assert document_record_id == "oa-document-1"
        return [
            {
                "id": "oa-mention-1",
                "schema": "Mention",
                "properties": {
                    "name": ["Eddie Melton"],
                    "document": ["oa-document-1"],
                    "detectedSchema": ["Person"],
                    "resolved": ["oa-person-777"],
                },
            },
            {
                "id": "oa-mention-2",
                "schema": "Mention",
                "properties": {
                    "name": ["NiSource Inc."],
                    "document": ["oa-document-1"],
                    "detectedSchema": ["ORG"],
                },
            },
        ]

    entity_count_before = db.query(Entity).count()
    result = import_openaleph_entity_candidates(db, doc.id, searcher=fake_searcher)
    assert result["created_candidates"] == 2
    assert result["review_required"] is True
    assert result["automatic_resolution"] is False
    assert db.query(Entity).count() == entity_count_before

    candidates = [
        row for row in db.scalars(
            select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == doc.id,
                ExtractionCandidate.candidate_type == "entity",
            )
        ).all()
        if (row.payload or {}).get("provenance", {}).get("provider") == "openaleph"
    ]
    assert len(candidates) == 2
    person = next(c for c in candidates if c.payload["caption"] == "Eddie Melton")
    org = next(c for c in candidates if c.payload["caption"] == "NiSource Inc.")
    assert person.payload["suggested_schema"] == "Person"
    assert org.payload["suggested_schema"] == "Organization"
    assert person.payload["provenance"]["provider_resolved_entity_id"] == "oa-person-777"
    assert person.review_status == "proposed"

    # A provider-side resolved target is metadata only; reporter acceptance creates
    # the Workbench entity but still does not create a canonical merge decision.
    accepted = review_candidate(db, person, decision="accept", note="Reporter confirmed the name in the source")
    entity = db.get(Entity, accepted["record"]["id"])
    assert entity.schema == "Person"
    statements = db.scalars(select(Statement).where(Statement.entity_id == entity.id)).all()
    assert len(statements) == 1
    assert statements[0].dataset == "openaleph:oa-collection-1"
    assert statements[0].origin == "openaleph:entity:oa-mention-1"

    # Reimport does not create duplicate provider Mention candidates.
    again = import_openaleph_entity_candidates(db, doc.id, searcher=fake_searcher)
    assert again["created_candidates"] == 0


def test_openaleph_mention_search_uses_exact_collection_and_document_filters(monkeypatch):
    import httpx
    from app.services.openaleph_corpus import _openaleph_mention_search

    monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "secret")

    def handler(request: httpx.Request):
        assert request.url.path == "/api/2/search"
        params = request.url.params
        assert params["q"] == "*"
        assert params["filter:collection_id"] == "collection-7"
        assert params["filter:schema"] == "Mention"
        assert params["filter:properties.document"] == "document-9"
        assert request.headers["authorization"] == "ApiKey secret"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "mention-1",
                        "schema": "Mention",
                        "properties": {"name": ["Example Person"], "detectedSchema": ["Person"]},
                    }
                ]
            },
        )

    rows = _openaleph_mention_search(
        collection_id="collection-7",
        document_record_id="document-9",
        transport=httpx.MockTransport(handler),
    )
    assert rows[0]["id"] == "mention-1"


def test_openaleph_review_status_and_combined_refresh(tmp_path, monkeypatch):
    from sqlalchemy import select
    from app.models.domain import ExtractionCandidate
    from app.services.openaleph_corpus import (
        get_openaleph_review_status,
        refresh_openaleph_review_candidates,
    )
    from app.services.documents import review_candidate

    db = SessionLocal()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = Investigation(name="Combined OpenAleph review")
    db.add(inv); db.commit(); db.refresh(inv)
    client = FakeOpenAlephClient()
    doc = ingest_document(
        db,
        investigation_id=inv.id,
        title="Provider refresh",
        filename="refresh.txt",
        mime_type="text/plain",
        data=b"Example Person appears in this exact provider-derived page text.",
        storage_dir=tmp_path / "documents",
    )

    before = get_openaleph_review_status(db, doc.id)
    assert before["ready_for_import"] is False
    assert before["provider_candidate_total"] == 0
    assert before["sync"] is None

    sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)

    def page_searcher(*, collection_id, document_record_id):
        assert collection_id == "oa-collection-1"
        assert document_record_id == "oa-document-1"
        return [{
            "id": "oa-page-refresh-1",
            "schema": "Page",
            "properties": {"index": ["1"], "bodyText": ["Provider page text for review."]},
        }]

    def mention_searcher(*, collection_id, document_record_id):
        assert collection_id == "oa-collection-1"
        assert document_record_id == "oa-document-1"
        return [
            {
                "id": "oa-mention-refresh-1",
                "schema": "Mention",
                "properties": {"name": ["Example Person"], "detectedSchema": ["Person"]},
            },
            # Duplicate provider rows must still stage only one review candidate.
            {
                "id": "oa-mention-refresh-1",
                "schema": "Mention",
                "properties": {"name": ["Example Person"], "detectedSchema": ["Person"]},
            },
        ]

    refreshed = refresh_openaleph_review_candidates(
        db,
        doc.id,
        evidence_searcher=page_searcher,
        entity_searcher=mention_searcher,
    )
    assert refreshed["evidence"]["created_candidates"] == 1
    assert refreshed["entities"]["created_candidates"] == 1
    status = refreshed["status"]
    assert status["ready_for_import"] is True
    assert status["candidate_counts"]["evidence"]["proposed"] == 1
    assert status["candidate_counts"]["entity"]["proposed"] == 1
    assert status["provider_candidate_total"] == 2
    assert status["provider_candidate_pending_review"] == 2

    entity_candidate = next(
        row for row in db.scalars(
            select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == doc.id,
                ExtractionCandidate.candidate_type == "entity",
            )
        ).all()
        if (row.payload or {}).get("provenance", {}).get("provider") == "openaleph"
    )
    review_candidate(db, entity_candidate, decision="reject", note="Reporter rejected provider extraction")
    after_review = get_openaleph_review_status(db, doc.id)
    assert after_review["provider_candidate_pending_review"] == 1
    assert after_review["provider_candidate_rejected"] == 1

    # The combined refresh is idempotent across both Page and Mention imports.
    again = refresh_openaleph_review_candidates(
        db,
        doc.id,
        evidence_searcher=page_searcher,
        entity_searcher=mention_searcher,
    )
    assert again["evidence"]["created_candidates"] == 0
    assert again["entities"]["created_candidates"] == 0
    assert again["status"]["provider_candidate_total"] == 2


def test_openaleph_review_status_api_is_safe_before_provider_sync(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(settings, "openaleph_enabled", False)
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Review status API"})
    assert inv.status_code == 200, inv.text
    investigation_id = inv.json()["id"]
    upload = client.post(
        "/api/documents/upload",
        data={"investigation_id": investigation_id, "title": "Status source"},
        files={"file": ("status.txt", b"A provider has not processed this document yet.", "text/plain")},
    )
    assert upload.status_code == 200, upload.text
    document_id = upload.json()["id"]

    response = client.get(f"/api/documents/{document_id}/corpus/openaleph/review-status")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "openaleph"
    assert body["ready_for_import"] is False
    assert body["sync"] is None
    assert body["provider_candidate_total"] == 0
