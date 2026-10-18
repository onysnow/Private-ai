"""The Drop (app/services/drop.py): each file as a lane of seven stages with its receipt."""

import hashlib

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, ExtractionCandidate, Source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _doc(db, inv, src, name, status, parent=None, error=None, sha=None):
    d = Document(investigation_id=inv, source_id=src, filename=name, sha256=sha or hashlib.sha256(name.encode()).hexdigest(), storage_path=f"/nowhere/{name}",
                 extraction_status=status, extraction_error=error, parent_document_id=parent)
    db.add(d)
    db.flush()
    return d


def test_each_file_is_a_lane_of_seven_stages_with_its_receipt():
    inv = ok(client.post("/api/investigations", json={"name": "Drop"}))["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Files", source_type="document")
        db.add(src)
        db.flush()
        minutes = _doc(db, inv, src.id, "minutes.pdf", "complete")
        db.add_all([DocumentChunk(document_id=minutes.id, locator="page 1", page_number=1, ordinal=0, text="The board met."),
                    DocumentChunk(document_id=minutes.id, locator="page 2 (OCR)", page_number=2, ordinal=1, text="Fernhill Ltd")])
        db.add(ExtractionCandidate(investigation_id=inv, document_id=minutes.id, candidate_type="entity", payload={}, review_status="proposed"))
        db.add(ExtractionCandidate(investigation_id=inv, document_id=minutes.id, candidate_type="claim", payload={}, review_status="accepted"))
        mail = _doc(db, inv, src.id, "letters.mbox", "complete")
        _doc(db, inv, src.id, "one.eml", "complete", parent=mail.id)
        _doc(db, inv, src.id, "two.eml", "pending", parent=mail.id)
        _doc(db, inv, src.id, "broken.pdf", "failed", error="The file is damaged")
        _doc(db, inv, src.id, "queued.docx", "pending")
        db.commit()
    body = ok(client.get(f"/api/investigations/{inv}/drop"))
    assert [s["key"] for s in body["stages"]] == ["received", "checked", "read", "passages", "inside", "names", "ready"]
    lanes = {lane["filename"]: lane for lane in body["lanes"]}
    assert set(lanes) == {"minutes.pdf", "letters.mbox", "broken.pdf", "queued.docx"}  # files inside are counted, not lanes
    state = {s["key"]: (s["state"], s["detail"]) for s in lanes["minutes.pdf"]["stages"]}
    assert state["read"] == ("done", "text and OCR (1 of 2 passages)")
    assert state["passages"] == ("done", "2 passages")
    assert state["inside"] == ("skipped", "None")
    assert state["ready"] == ("needs_you", "1 wait for you")
    receipt = lanes["minutes.pdf"]["receipt"]
    assert receipt["pages"] == 2 and receipt["proposals"] == {"entity": 1, "claim": 1} and receipt["waiting"] == {"entity": 1}
    assert {s["key"]: s["state"] for s in lanes["letters.mbox"]["stages"]}["inside"] == "active"
    assert lanes["broken.pdf"]["problem"] is True
    assert {s["key"]: s["detail"] for s in lanes["broken.pdf"]["stages"]}["read"] == "The file is damaged"
    assert {s["key"]: s["state"] for s in lanes["queued.docx"]["stages"]}["read"] == "waiting"
    totals = body["totals"]
    started = totals.pop("started_at")
    assert started
    assert totals == {"files": 4, "files_inside": 2, "read": 3, "unread": 2, "reading": 0, "problems": 1, "passages": 2, "waiting": 1,
                      "by_stage": {"received": 4, "checked": 4, "read": 2, "passages": 1, "inside": 0, "names": 2, "ready": 2}}
    # The line under each name, the files inside as their own lanes, and what waits.
    assert lanes["broken.pdf"]["note"] == "The file is damaged"
    assert lanes["queued.docx"]["note"] == "Waiting its turn · 2nd in line"
    assert lanes["minutes.pdf"]["note"] == "Read cleanly" and lanes["minutes.pdf"]["waiting"] == 1
    assert [c["filename"] for c in lanes["letters.mbox"]["children"]] == ["one.eml", "two.eml"]
    assert body["ready_from"] == 1 and body["ready_unsure"] == 1 and body["watchlist"] == {"hits": 0, "names": []}
    assert body["ready_for_you"] == {"entity": 1}


def test_a_file_already_in_the_case_says_so():
    inv = ok(client.post("/api/investigations", json={"name": "Drop twice"}))["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Files", source_type="document")
        db.add(src)
        db.flush()
        first = _doc(db, inv, src.id, "report.pdf", "complete", sha="cd" * 32)
        _doc(db, inv, src.id, "report (copy).pdf", "complete", sha="cd" * 32)
        db.commit()
        first_id = first.id
    lanes = {lane["filename"]: lane for lane in ok(client.get(f"/api/investigations/{inv}/drop"))["lanes"]}
    copy = lanes["report (copy).pdf"]
    assert copy["same_as"] == first_id and copy["note"] == "Already in the case: same fingerprint"
    assert {s["key"]: s["detail"] for s in copy["stages"]}["checked"] == "= same"
    assert lanes["report.pdf"]["same_as"] is None
