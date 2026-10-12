"""Chain of Custody (app/services/custody_chain.py, mockup CHECK_2): from the file to the sentence."""

import hashlib

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, IngestionBatch, IngestionBatchItem, Source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_each_piece_of_evidence_is_a_row_from_the_file_to_the_claim(tmp_path):
    inv = ok(client.post("/api/investigations", json={"name": "Custody"}))["id"]
    body = b"Share transfer form J30"
    path = tmp_path / "transfer.pdf"
    path.write_bytes(body)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Share transfer", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="transfer.pdf", sha256=hashlib.sha256(body).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="page 3 (OCR)", page_number=3, ordinal=2,
                             text="the person named below: Harbour Nominees Limited, being forty per cent (40%) of the issued share capital"))
        db.add(DocumentChunk(document_id=doc.id, locator="page 1 (OCR)", page_number=1, ordinal=0, text="Form J30"))
        batch = IngestionBatch(investigation_id=inv, label="drop", created_by="Ony")
        db.add(batch)
        db.flush()
        db.add(IngestionBatchItem(batch_id=batch.id, position=0, filename="transfer.pdf", outcome="saved", document_id=doc.id))
        typed = Source(investigation_id=inv, title="Companies House note", source_type="web", url="https://example.test/cs01")
        db.add(typed)
        db.commit()
        src_id, typed_id, doc_id = src.id, typed.id, doc.id
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Harbour Nominees held 40% of Fernhill Ltd"}))
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": "being forty per cent (40%) of the issued share capital", "locator": "p.3"}))
    against = ok(client.post("/api/evidence", json={"source_id": typed_id, "quote": "Shareholder: Kestrel SA, 100%", "locator": "p.1"}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": against["id"], "stance": "contradicts", "note": "filed 14 Dec 2017, before the transfer"}))

    chain = ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))
    assert chain["claim"]["text"] == "Harbour Nominees held 40% of Fernhill Ltd"
    support, contra = chain["rows"]
    assert support["stance"] == "supports" and contra["stance"] == "contradicts"
    kinds = [c["kind"] for c in support["cards"]]
    assert kinds == ["file", "reading", "passage", "decision"]
    file, reading, passage, decision = support["cards"]
    assert file["checks"] == [{"label": "hash", "ok": True}] and file["who"] == "Ony" and file["sha256"] == hashlib.sha256(body).hexdigest()
    assert reading["title"] == "Page 3 of 3"
    assert reading["lines"][0] == "read by OCR"
    assert passage["checks"] == [{"label": "says it", "ok": True}] and passage["page"] == 3
    assert decision["title"] == "Quote saved" and decision["wire"] == {"style": "confirmed", "words": "supports"}
    # Typed in by hand: no file behind it, and the answer to it is on the card.
    assert [c["kind"] for c in contra["cards"]] == ["source", "decision"]
    assert contra["cards"][1]["title"] == "Answered" and contra["cards"][1]["wire"]["style"] == "against"
    assert chain["seal"]["hashes_intact"] is True and chain["seal"]["sources_for"] == 1 and chain["seal"]["against"] == 1
    assert chain["seal"]["app_services"] == 1 and chain["seal"]["people"] == 1
    whats = [e["what"] for e in chain["log"]]
    assert "Uploaded transfer.pdf · SHA-256 recorded at intake" in whats
    assert any(w.startswith("Linked as against the claim: filed 14 Dec 2017") for w in whats)

    # The file changes on disk: the chain says the hash no longer matches, and the re-check says so too.
    path.write_bytes(b"changed")
    assert ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))["seal"]["hashes_intact"] is False
    assert ok(client.post(f"/api/documents/{doc_id}/recheck-hash"))["matches"] is False
    assert client.get("/api/claims/no-such-claim/custody-chain").status_code == 404
