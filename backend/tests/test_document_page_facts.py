"""What the reading room shows of a document (INTAKE_2): each page's OCR legibility as the reader measured it, and the
languages OpenAleph detected, read from its proposals; nothing guessed where nothing was recorded."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, ExtractionCandidate, Source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _document(inv: str, name: str) -> str:
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title=name, source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename=name, sha256="0" * 64, storage_path=f"/nowhere/{name}",
                       extraction_status="complete")
        db.add(doc)
        db.commit()
        return doc.id


def test_each_page_carries_its_legibility_and_the_document_its_detected_languages():
    inv = ok(client.post("/api/investigations", json={"name": "Page facts"}))["id"]
    doc_id = _document(inv, "minutes.pdf")
    with SessionLocal() as db:
        scanned = DocumentChunk(document_id=doc_id, locator="page 1 (OCR)", page_number=1, ordinal=0, text="Minutes", ocr_legibility=91.4)
        typed = DocumentChunk(document_id=doc_id, locator="page 2", page_number=2, ordinal=1, text="Annex")
        db.add_all([scanned, typed])
        db.flush()
        for langs in (["eng", "fra"], ["fra", "en"], None):
            provenance = {"provider": "openaleph", "detected_languages": langs} if langs is not None else {"ner_engine": "rules"}
            db.add(ExtractionCandidate(investigation_id=inv, document_id=doc_id, chunk_id=scanned.id, candidate_type="entity",
                                       payload={"name": "x", "provenance": provenance}, confidence=0.5))
        db.commit()
    detail = ok(client.get(f"/api/documents/{doc_id}"))
    assert [(c["page_number"], c["ocr_legibility"]) for c in detail["chunks"]] == [(1, 91.4), (2, None)]
    # Each language once, in the order first seen; a two-letter code is read as its three-letter one.
    assert detail["languages"] == [{"code": "eng", "name": "English"}, {"code": "fra", "name": "French"}]


def test_a_document_openaleph_has_not_read_has_no_language():
    inv = ok(client.post("/api/investigations", json={"name": "No language"}))["id"]
    doc_id = _document(inv, "note.txt")
    assert ok(client.get(f"/api/documents/{doc_id}"))["languages"] == []
