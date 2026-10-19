"""The Drop (app/services/drop.py): each file as a lane of seven stages with its receipt."""

import hashlib
import json
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import BackgroundJob, Document, DocumentChunk, ExtractionCandidate, IngestionBatch, IngestionBatchItem, Source
from app.services import drop

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


def test_the_receipt_counts_what_each_proposer_s_proposals_came_to():
    """Research §05 "revision rate": per proposer (the rule that proposed it), accepted, rejected and still waiting."""
    inv = ok(client.post("/api/investigations", json={"name": "Drop proposers"}))["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Files", source_type="document")
        db.add(src)
        db.flush()
        memo = _doc(db, inv, src.id, "memo.pdf", "complete")
        other = _doc(db, inv, src.id, "other.pdf", "complete")
        names = {"rationale": {"rule": "capitalized_name_sequence"}}
        claims = {"rationale": {"rule": "sentence_assertion"}}
        for payload, status in [(names, "accepted"), (names, "accepted"), (names, "rejected"), (names, "proposed"),
                                (claims, "rejected"), ({}, "accepted")]:
            db.add(ExtractionCandidate(investigation_id=inv, document_id=memo.id, candidate_type="entity", payload=payload, review_status=status))
        db.add(ExtractionCandidate(investigation_id=inv, document_id=other.id, candidate_type="entity", payload=names, review_status="rejected"))
        db.commit()
    lanes = {lane["filename"]: lane for lane in ok(client.get(f"/api/investigations/{inv}/drop"))["lanes"]}
    assert lanes["memo.pdf"]["receipt"]["by_proposer"] == [
        {"rule": "", "accepted": 1, "rejected": 0, "waiting": 0},
        {"rule": "capitalized_name_sequence", "accepted": 2, "rejected": 1, "waiting": 1},
        {"rule": "sentence_assertion", "accepted": 0, "rejected": 1, "waiting": 0},
    ]
    assert lanes["other.pdf"]["receipt"]["by_proposer"] == [{"rule": "capitalized_name_sequence", "accepted": 0, "rejected": 1, "waiting": 0}]


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


def _case_with(name: str):
    inv = ok(client.post("/api/investigations", json={"name": name}))["id"]
    db = SessionLocal()
    src = Source(investigation_id=inv, title="Files", source_type="document")
    db.add(src)
    db.flush()
    return inv, db, src.id


def test_a_read_that_has_not_moved_for_six_minutes_says_so():
    now = datetime(2026, 10, 19, 12, 0)
    inv, db, src = _case_with("Stalled")
    with db:
        stuck = _doc(db, inv, src, "stuck.pdf", "extracting")
        db.add(BackgroundJob(kind="extract_document", investigation_id=inv, subject_type="document", subject_id=stuck.id, status="running",
                             message="OCR, page 12 of 40", created_at=now - timedelta(minutes=20), started_at=now - timedelta(minutes=19),
                             updated_at=now - timedelta(minutes=7)))
        db.commit()
        lane = drop.drop(db, inv, now=now)["lanes"][0]
        assert lane["stalled_minutes"] == 7
        assert {s["key"]: (s["state"], s["detail"]) for s in lane["stages"]}["read"] == ("active", "No progress for 7 min")
        assert lane["note"] == "No progress for 7 min · it may have stopped"
        # Five minutes is still moving: the job's own message shows.
        lane = drop.drop(db, inv, now=now - timedelta(minutes=2))["lanes"][0]
        assert lane["stalled_minutes"] is None and lane["note"] == "OCR, page 12 of 40"
    inv, db, src = _case_with("Queue not moving")
    with db:
        queued = _doc(db, inv, src, "queued.pdf", "queued")
        db.add(BackgroundJob(kind="extract_document", investigation_id=inv, subject_type="document", subject_id=queued.id,
                             status="queued", created_at=now - timedelta(hours=3), updated_at=now - timedelta(hours=3)))
        db.commit()
        lane = drop.drop(db, inv, now=now)["lanes"][0]
        assert lane["stalled_minutes"] == 180 and lane["note"] == "No progress for 3 h · nothing is being read"
        assert {s["key"]: s["state"] for s in lane["stages"]}["read"] == "waiting"


def test_history_lists_each_drop_with_what_it_produced():
    inv, db, src = _case_with("History")
    with db:
        batch = IngestionBatch(investigation_id=inv, label="minutes.pdf and 1 more", created_at=datetime(2026, 10, 14, 9, 0))
        db.add(batch)
        db.flush()
        minutes = _doc(db, inv, src, "minutes.pdf", "complete")
        mail = _doc(db, inv, src, "letters.mbox", "complete")
        inside = _doc(db, inv, src, "one.eml", "failed", parent=mail.id)
        db.add_all([DocumentChunk(document_id=minutes.id, locator="page 1", page_number=1, ordinal=0, text="The board met."),
                    DocumentChunk(document_id=inside.id, locator="body", ordinal=0, text="Hello")])
        db.add_all([ExtractionCandidate(investigation_id=inv, document_id=minutes.id, candidate_type="entity", payload={}, review_status="proposed"),
                    ExtractionCandidate(investigation_id=inv, document_id=minutes.id, candidate_type="claim", payload={}, review_status="accepted"),
                    ExtractionCandidate(investigation_id=inv, document_id=inside.id, candidate_type="entity", payload={}, review_status="rejected")])
        for i, (name, outcome, doc_id) in enumerate([("minutes.pdf", "saved", minutes.id), ("letters.mbox", "saved", mail.id),
                                                     ("minutes copy.pdf", "duplicate", minutes.id), ("film.mov", "refused", None)]):
            db.add(IngestionBatchItem(batch_id=batch.id, position=i, filename=name, outcome=outcome, document_id=doc_id))
        alone = _doc(db, inv, src, "note.txt", "queued")
        alone.created_at = datetime(2026, 10, 15, 8, 30)
        db.commit()
        batch_id, alone_id, ids = batch.id, alone.id, [minutes.id, mail.id]
    drops = ok(client.get(f"/api/investigations/{inv}/drop/history"))["drops"]
    assert [d["label"] for d in drops] == ["note.txt", "minutes.pdf and 1 more"]  # newest first
    one, batch_entry = drops
    assert one["batch_id"] is None and one["one_at_a_time"] is True and one["document_ids"] == [alone_id] and one["in_progress"] == 1
    assert batch_entry["batch_id"] == batch_id and batch_entry["document_ids"] == ids
    keys = ("files", "duplicates", "refused", "read", "problems", "in_progress", "files_inside", "passages", "accepted", "waiting")
    assert {k: batch_entry[k] for k in keys} == {"files": 2, "duplicates": 1, "refused": 1, "read": 2, "problems": 1, "in_progress": 0,
                                                 "files_inside": 1, "passages": 2, "accepted": 1, "waiting": 1}
    assert batch_entry["proposals"] == {"entity": 2, "claim": 1}
    assert client.get("/api/investigations/no-such-case/drop/history").status_code == 404


def _events(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.split("\n") if ": " in line)
        out.append((fields["event"], json.loads(fields["data"])))
    return out


def test_the_stream_sends_each_file_then_a_summary_and_ends_once_nothing_is_read():
    inv, db, src = _case_with("Streamed")
    with db:
        minutes = _doc(db, inv, src, "minutes.pdf", "complete")
        db.add(DocumentChunk(document_id=minutes.id, locator="page 1", page_number=1, ordinal=0, text="The board met."))
        _doc(db, inv, src, "broken.pdf", "failed", error="The file is damaged")
        db.commit()
    reply = client.get(f"/api/investigations/{inv}/drop/stream")
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("text/event-stream")
    events = _events(reply.text)
    assert [e for e, _ in events] == ["lane", "lane", "summary", "end"]
    assert {d["filename"] for e, d in events if e == "lane"} == {"minutes.pdf", "broken.pdf"}
    summary = events[2][1]
    assert "lanes" not in summary and len(summary["order"]) == 2 and summary["totals"]["problems"] == 1
    assert client.get("/api/investigations/no-such-case/drop/stream").status_code == 404
    # Kept out of the schema: the generated client has no shape for an event stream.
    assert "/api/investigations/{investigation_id}/drop/stream" not in app.openapi()["paths"]


def test_changes_sends_only_what_changed():
    seen: dict[str, str] = {}
    lane = {"document_id": "d1", "in_progress": True, "note": "Reading"}
    snap = {"investigation_id": "i", "totals": {"files": 1}, "lanes": [lane]}
    assert [e for e, _ in drop.changes(seen, snap, json.dumps)] == ["lane", "summary"]
    assert drop.changes(seen, snap, json.dumps) == []  # nothing moved: nothing sent
    snap = {**snap, "lanes": [{**lane, "note": "OCR, page 2"}]}
    assert [e for e, _ in drop.changes(seen, snap, json.dumps)] == ["lane", "summary"]
    assert drop.changes(seen, {**snap, "lanes": []}, json.dumps)[0] == ("gone", {"document_id": "d1"})
