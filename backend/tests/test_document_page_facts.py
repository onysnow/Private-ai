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


def test_proposals_from_a_page_too_hard_to_read_are_held_back_from_decide_but_can_still_be_decided():
    """The OCR quality gate (app/jobs/handlers.py hold_illegible): noise read from a blurred photo is not offered in
    Decide as names and claims; it waits beside the page, with the page's figure, for a person to check by eye."""
    from app.jobs.handlers import hold_illegible

    inv = ok(client.post("/api/investigations", json={"name": "Blurred"}))["id"]
    doc_id = _document(inv, "photo.jpg")
    with SessionLocal() as db:
        blurred = DocumentChunk(document_id=doc_id, locator="image (OCR)", ordinal=0, text="Wl1 Ham Trnst", ocr_legibility=38.2)
        clear = DocumentChunk(document_id=doc_id, locator="page 2 (OCR)", page_number=2, ordinal=1, text="Fernhill Ltd", ocr_legibility=93.0)
        db.add_all([blurred, clear])
        db.flush()
        noise = ExtractionCandidate(investigation_id=inv, document_id=doc_id, chunk_id=blurred.id, candidate_type="entity",
                                    payload={"caption": "Wl1 Ham Trnst"}, confidence=0.5)
        name = ExtractionCandidate(investigation_id=inv, document_id=doc_id, chunk_id=clear.id, candidate_type="entity",
                                   payload={"caption": "Fernhill Ltd"}, confidence=0.5)
        db.add_all([noise, name])
        db.commit()
        assert hold_illegible(db, doc_id) == 1
        db.refresh(noise)
        db.refresh(name)
        assert (noise.review_status, name.review_status) == ("held", "proposed")
        assert "only 38% legible" in (noise.reviewer_note or "")
        noise_id = noise.id
    standing = ok(client.get(f"/api/investigations/{inv}/standing"))
    assert standing["to_decide_by_kind"].get("proposal", 0) == 1
    rejected = client.post(f"/api/extraction-candidates/{noise_id}/review", json={"decision": "reject"})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["candidate"]["review_status"] == "rejected"
