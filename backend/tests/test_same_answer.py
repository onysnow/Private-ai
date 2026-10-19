"""Answer once, apply to the batch (app/services/same_answer.py): the other waiting proposals of the same name in
the drop a document came in, else in the case."""

import hashlib

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, Entity, ExtractionCandidate, IngestionBatch, IngestionBatchItem, Source

client = TestClient(app)


def _doc(db, inv, src, name, parent=None):
    d = Document(investigation_id=inv, source_id=src, filename=name, sha256=hashlib.sha256(name.encode()).hexdigest(), storage_path=f"/nowhere/{name}",
                 extraction_status="complete", parent_document_id=parent)
    db.add(d)
    db.flush()
    return d


def _name(db, inv, doc, caption, status="proposed", chunk=None):
    row = ExtractionCandidate(investigation_id=inv, document_id=doc.id, candidate_type="entity", review_status=status,
                              chunk_id=chunk, payload={"caption": caption, "suggested_schema": "Company"})
    db.add(row)
    db.flush()
    return row.id


def test_the_same_name_waiting_in_the_same_drop_is_offered_the_same_answer():
    inv = client.post("/api/investigations", json={"name": "Harbour"}).json()["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Files", source_type="document")
        db.add(src)
        db.flush()
        batch = IngestionBatch(investigation_id=inv, label="minutes.pdf and 1 more")
        db.add(batch)
        db.flush()
        minutes, mail, elsewhere = _doc(db, inv, src.id, "minutes.pdf"), _doc(db, inv, src.id, "letters.mbox"), _doc(db, inv, src.id, "later.pdf")
        inside = _doc(db, inv, src.id, "one.eml", parent=mail.id)
        for i, d in enumerate([minutes, mail]):
            db.add(IngestionBatchItem(batch_id=batch.id, position=i, filename=d.filename, outcome="saved", document_id=d.id))
        chunk = DocumentChunk(document_id=inside.id, locator="body ¶2", ordinal=0, text="Harbour Nominees Limited wrote.")
        db.add(chunk)
        db.flush()
        first = _name(db, inv, minutes, "Harbour Nominees Ltd")
        same_inside = _name(db, inv, inside, "Harbour Nominees Limited", chunk=chunk.id)
        _name(db, inv, minutes, "Harbour Nominees Ltd", status="accepted")       # already decided
        _name(db, inv, minutes, "Kestrel SA")                                    # another name
        _name(db, inv, elsewhere, "Harbour Nominees Ltd")                        # another drop
        claim = ExtractionCandidate(investigation_id=inv, document_id=minutes.id, candidate_type="claim", review_status="proposed", payload={"text": "x"})
        db.add(claim)
        db.commit()
        alone = _doc(db, inv, src.id, "alone.pdf")
        lone = _name(db, inv, alone, "Harbour Nominees")
        db.commit()
        claim_id, batch_id = claim.id, batch.id
    body = client.get(f"/api/extraction-candidates/{first}/same-answer").json()
    assert body["scope"] == "drop" and body["label"] == "minutes.pdf and 1 more"
    assert [(c["candidate_id"], c["caption"], c["filename"], c["locator"]) for c in body["candidates"]] == [
        (same_inside, "Harbour Nominees Limited", "one.eml", "body ¶2")]
    # A document brought in on its own is compared with the whole case; "Harbour Nominees" is not the same name.
    lone_body = client.get(f"/api/extraction-candidates/{lone}/same-answer").json()
    assert lone_body["scope"] == "case" and lone_body["candidates"] == []
    assert client.get(f"/api/extraction-candidates/{claim_id}/same-answer").status_code == 400
    assert client.get("/api/extraction-candidates/no-such/same-answer").status_code == 404
    assert batch_id


def test_a_record_already_in_the_case_says_how_much_it_holds():
    inv = client.post("/api/investigations", json={"name": "Facts"}).json()["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Files", source_type="document")
        db.add(src)
        db.flush()
        db.add(Entity(investigation_id=inv, ftm_id="ftm-1", schema="Company", caption="Harbour Nominees Limited",
                      properties={"name": ["Harbour Nominees Limited"], "address": ["14 Quay Street"], "jurisdiction": ["xx"]}))
        proposal = _name(db, inv, _doc(db, inv, src.id, "minutes.pdf"), "Harbour Nominees Ltd")
        db.commit()
    body = client.get(f"/api/extraction-candidates/{proposal}/entity-matches").json()
    assert body["strong_match"]["caption"] == "Harbour Nominees Limited" and body["strong_match"]["facts"] == 3
