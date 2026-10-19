"""What the app used to work out each time and now keeps (mockups CHECK_2 and KEEP_2): each quote's anchor
(ADR-0015) with the passage's lines it spans, who made each decision, how legible an OCR'd page was, and when the
case was last backed up."""

import hashlib
import shutil

import pytest
from fastapi.testclient import TestClient

from app.core.authorization import AuthorizationScope, authorization_scope_context
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import (
    AppUser,
    Claim,
    ClaimEvidenceLink,
    ClaimReviewEvent,
    Document,
    DocumentChunk,
    Evidence,
    ExtractionCandidate,
    Investigation,
    Source,
)
from app.services.anchor_text import find_anchor, refind_anchor
from app.services.legibility import mean_word_confidence

client = TestClient(app)

PAGE = ("STOCK TRANSFER FORM J30\nFernhill Ltd\n"
        "...to the person(s) named below: Harbour Nominees\nLimited, being forty per cent (40%) of the issued share capital,\n"
        "with effect from 14 March 2018.\n")
QUOTE = "Harbour Nominees\nLimited, being forty per cent (40%) of the issued share capital"


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _case_with_page(tmp_path, *, text=PAGE, locator="page 3 (OCR)", legibility=None):
    inv = ok(client.post("/api/investigations", json={"name": "Stored"}))["id"]
    body = b"J30 scan"
    path = tmp_path / "j30.pdf"
    path.write_bytes(body)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Stock transfer form J30", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="j30.pdf", sha256=hashlib.sha256(body).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator=locator, page_number=3, ordinal=1, text=text, ocr_legibility=legibility))
        db.commit()
        return inv, src.id, doc.id


# --- anchors, the matching itself -------------------------------------------------------------------------------

def test_an_anchor_keeps_the_place_the_text_either_side_and_the_lines():
    chunks = [{"id": "c1", "locator": "page 3", "page_number": 3, "text": PAGE}]
    found = find_anchor(chunks, QUOTE)
    assert found["chunk_id"] == "c1" and found["match"] == "exact" and found["occurrences"] == 1
    assert PAGE[found["start"]:found["end"]] == QUOTE
    assert found["prefix"] == PAGE[found["start"] - 32:found["start"]] and found["suffix"] == PAGE[found["end"]:found["end"] + 32]
    assert (found["line_start"], found["line_end"]) == (3, 4)


def test_case_and_spacing_differences_are_found_and_said():
    chunks = [{"id": "c1", "locator": "page 1", "page_number": 1, "text": "Paid to  KESTREL\nSA on 2 May"}]
    assert find_anchor(chunks, "paid to  kestrel\nsa")["match"] == "case"
    spaced = find_anchor(chunks, "Paid to KESTREL SA")
    assert spaced["match"] == "spacing" and chunks[0]["text"][spaced["start"]:spaced["end"]] == "Paid to  KESTREL\nSA"
    assert find_anchor(chunks, "not in the text") is None and find_anchor(chunks, "  ") is None


def test_found_again_held_moved_or_lost():
    page = {"id": "c1", "locator": "page 3", "page_number": 3, "text": PAGE}
    stored = find_anchor([page], QUOTE)
    assert refind_anchor(stored, [page], QUOTE)[1] == "held"
    # Read again: the passage has a new id and a line more above it.
    reread = {"id": "c2", "locator": "page 3", "page_number": 3, "text": "Filed copy\n" + PAGE}
    now, state = refind_anchor(stored, [reread], QUOTE)
    assert state == "moved" and now["chunk_id"] == "c2" and (now["line_start"], now["line_end"]) == (4, 5)
    assert refind_anchor(stored, [{"id": "c3", "locator": "page 3", "page_number": 3, "text": "illegible"}], QUOTE) == (None, "lost")
    assert refind_anchor(None, [page], QUOTE)[1] == "not anchored"


def test_of_several_places_the_one_with_the_same_text_either_side_is_chosen():
    text = "Director: A. Razak. Signed by the director.\n...\nWitness: B. Low. Signed by the director."
    chunks = [{"id": "c1", "locator": "page 1", "page_number": 1, "text": text}]
    second = text.rindex("Signed by the director")
    found = find_anchor(chunks, "Signed by the director", prefix=text[second - 10:second], suffix=".")
    assert found["start"] == second and found["occurrences"] == 2


# --- anchors, stored as quotes are saved and shown in the chain ---------------------------------------------------

def test_a_quote_saved_from_a_read_document_is_anchored_and_the_chain_shows_its_lines(tmp_path):
    inv, src_id, doc_id = _case_with_page(tmp_path)
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": QUOTE, "locator": "p.3"}))
    with SessionLocal() as db:
        anchor = db.get(Evidence, ev["id"]).anchor
    assert anchor["document_id"] == doc_id and anchor["match"] == "exact" and anchor["anchored_at"]
    assert (anchor["line_start"], anchor["line_end"]) == (3, 4) and len(anchor["prefix"]) == 32

    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Harbour Nominees held 40% of Fernhill Ltd"}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))
    row = ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))["rows"][0]
    assert row["anchor"]["state"] == "held" and row["anchor"]["stored"] is True and (row["anchor"]["before"], row["anchor"]["after"]) == (32, 32)
    passage = next(c for c in row["cards"] if c["kind"] == "passage")
    assert (passage["line_start"], passage["line_end"]) == (3, 4)


def test_a_quote_saved_before_its_document_is_read_is_anchored_by_the_read(tmp_path):
    inv = ok(client.post("/api/investigations", json={"name": "Before the read"}))["id"]
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Minutes", source_type="document")
        db.add(src)
        db.flush()
        path = tmp_path / "minutes.txt"
        path.write_text("Council minutes\nThe land was sold to Kestrel SA for EUR 42,000.\n")
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.txt", sha256="x", storage_path=str(path),
                       extraction_status="pending")
        db.add(doc)
        db.commit()
        src_id, doc_id = src.id, doc.id
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": "sold to Kestrel SA for EUR 42,000"}))
    with SessionLocal() as db:
        assert db.get(Evidence, ev["id"]).anchor is None
        from app.services.documents import extract_document

        extract_document(db, doc_id, find_names=False)
        anchor = db.get(Evidence, ev["id"]).anchor
    assert anchor is not None and anchor["document_id"] == doc_id and anchor["match"] == "exact"


def test_a_quote_the_new_reading_no_longer_holds_keeps_its_old_place_marked_lost(tmp_path):
    inv, src_id, doc_id = _case_with_page(tmp_path)
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": QUOTE}))
    with SessionLocal() as db:
        from app.services.anchors import anchor_document_quotes

        chunk = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).one()
        chunk.text = "a page the new OCR could not read"
        anchor_document_quotes(db, db.get(Document, doc_id))
        db.commit()
        anchor = db.get(Evidence, ev["id"]).anchor
    assert anchor["lost_at"] and anchor["line_start"] == 3


# --- who decided ---------------------------------------------------------------------------------------------------

def test_decisions_keep_who_made_them_by_account(tmp_path):
    inv, src_id, doc_id = _case_with_page(tmp_path)
    scope = AuthorizationScope(actor_id="user-ony", investigation_ids=None, role="admin")
    with SessionLocal() as db:
        db.add(AppUser(id="user-ony", display_name="Ony", token_digest="d" * 64, global_role="admin"))
        db.commit()
        with authorization_scope_context(scope):
            claim = Claim(investigation_id=inv, text="Harbour Nominees held 40%")
            ev = Evidence(source_id=src_id, quote=QUOTE)
            db.add_all([claim, ev])
            db.flush()
            link = ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, stance="supports")
            human = ClaimReviewEvent(claim_id=claim.id, from_status="unverified", to_status="supported", from_confidence=0,
                                     to_confidence=0.8, rationale="two sources")
            ai = ClaimReviewEvent(claim_id=claim.id, from_status="supported", to_status="supported", from_confidence=0.8,
                                  to_confidence=0.8, rationale="AI check", reviewer_type="AI_ASSISTED")
            cand = ExtractionCandidate(investigation_id=inv, document_id=doc_id, candidate_type="entity", payload={})
            db.add_all([link, human, ai, cand])
            db.commit()
            assert cand.decided_by_id is None  # still a proposal
            cand.review_status = "accepted"
            db.commit()
        assert (link.decided_by_id, link.decided_by_name) == ("user-ony", "Ony")
        assert (human.decided_by_id, human.decided_by_name) == ("user-ony", "Ony")
        assert ai.decided_by_id is None
        assert (cand.decided_by_id, cand.decided_by_name) == ("user-ony", "Ony")
        claim_id = claim.id
    chain = ok(client.get(f"/api/claims/{claim_id}/custody-chain"))
    assert any(e["who"] == "Ony" and e["what"].startswith("Linked as supporting") for e in chain["log"])
    assert any(e["who"] == "Ony" and e["what"].startswith("Set the claim supported") for e in chain["log"])
    assert chain["seal"]["people"] == 1


def test_on_this_computer_without_an_account_a_decision_says_a_person(tmp_path):
    inv, src_id, _doc = _case_with_page(tmp_path)
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Harbour Nominees held 40%"}))
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": QUOTE}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))
    with SessionLocal() as db:
        link = db.query(ClaimEvidenceLink).filter(ClaimEvidenceLink.claim_id == claim["id"]).one()
        assert (link.decided_by_id, link.decided_by_name) == ("local-owner", None)
    chain = ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))
    assert any(e["who"] == "a person" and e["what"].startswith("Linked as supporting") for e in chain["log"])


# --- OCR legibility ------------------------------------------------------------------------------------------------

def test_legibility_is_the_mean_confidence_of_the_words():
    tsv = ("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
           "1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t\n"
           "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t96.5\tHarbour\n"
           "5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t91.5\tNominees\n"
           "5\t1\t1\t1\t1\t3\t0\t0\t10\t10\t30\t \n")
    assert mean_word_confidence(tsv) == 94.0
    assert mean_word_confidence("level\tconf\ttext\n") is None


def test_the_chain_says_how_legible_the_page_was(tmp_path):
    inv, src_id, _doc = _case_with_page(tmp_path, legibility=96.2)
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Harbour Nominees held 40%"}))
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": QUOTE}))
    ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))
    chain = ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))
    reading = next(c for c in chain["rows"][0]["cards"] if c["kind"] == "reading")
    assert reading["legibility"] == 96.2 and reading["lines"][0] == "read by OCR · 96% legible"


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="needs the Tesseract program")
def test_a_scanned_page_is_measured(tmp_path):
    import fitz

    from app.services.legibility import measure_pdf_pages
    from app.services.pdf_ocr import ocr_runtime_status

    if not ocr_runtime_status("eng").available:
        pytest.skip("needs Tesseract's English language data")
    words = fitz.open()
    page = words.new_page(width=600, height=200)
    page.insert_text((40, 100), "Harbour Nominees Limited holds forty per cent", fontsize=24)
    picture = fitz.open()
    picture.new_page(width=600, height=200).insert_image(fitz.Rect(0, 0, 600, 200), pixmap=page.get_pixmap(dpi=200))
    path = tmp_path / "scan.pdf"
    picture.save(path)
    measured, why = measure_pdf_pages(str(path), [1, 9], "eng", 200)
    assert why is None and set(measured) == {1} and measured[1] is not None and 50 < measured[1] <= 100


# --- the last backup -----------------------------------------------------------------------------------------------

def test_a_backup_is_remembered_on_the_case(tmp_path):
    inv, _src, _doc = _case_with_page(tmp_path)
    assert next(i for i in ok(client.get("/api/investigations")) if i["id"] == inv)["last_backup"] is None
    reply = client.get(f"/api/investigations/{inv}/export?include_documents=true")
    assert reply.status_code == 200
    last = next(i for i in ok(client.get("/api/investigations")) if i["id"] == inv)["last_backup"]
    assert last["bytes"] == len(reply.content) and last["sha256"] == hashlib.sha256(reply.content).hexdigest()
    assert last["documents_included"] is True and last["at"]
    with SessionLocal() as db:
        assert db.get(Investigation, inv).last_backup == last


# --- the read job, restore and the migration ------------------------------------------------------------------------

def test_after_the_read_the_job_measures_each_scanned_page(tmp_path, monkeypatch):
    from app.jobs import handlers
    from app.services import document_reader

    _inv, _src, doc_id = _case_with_page(tmp_path)
    with SessionLocal() as db:
        db.add(DocumentChunk(document_id=doc_id, locator="page 1", page_number=1, ordinal=0, text="a page with a text layer"))
        db.commit()
    asked: list[list[int]] = []

    def fake_measure(path, pages):
        asked.append(pages)
        return {pages[0]: 91.4}, None

    monkeypatch.setattr(document_reader, "measure_legibility", fake_measure)
    told: list[str] = []
    with SessionLocal() as db:
        message = handlers._measure_legibility(db, doc_id, lambda _p, m: told.append(m or ""), "Document read")
    assert asked == [[3]]   # the page read by OCR only
    assert message == "Document read; legibility measured on 1 of 1 scanned page"
    assert told == ["Read · measuring how legible the scan is · page 1 of 1"]
    with SessionLocal() as db:
        by_page = {c.page_number: c.ocr_legibility for c in db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id)}
    assert by_page == {3: 91.4, 1: None}

    # With no Tesseract program the read still succeeds, and says why there is no figure.
    with SessionLocal() as db:
        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).update({"ocr_legibility": None})
        db.commit()
    monkeypatch.setattr(document_reader, "measure_legibility", lambda path, pages: ({}, "no Tesseract program was found to measure it with"))
    with SessionLocal() as db:
        assert handlers._measure_legibility(db, doc_id, lambda *_: None, "Document read") == \
            "Document read; legibility not measured: no Tesseract program was found to measure it with"


def test_a_restore_keeps_who_decided_and_does_not_stamp_the_person_restoring(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import StaticPool

    from app.db.session import Base
    from app.services.exports import build_investigation_export, restore_investigation_export

    inv, src_id, _doc = _case_with_page(tmp_path)
    with SessionLocal() as db:
        claim = Claim(investigation_id=inv, text="Harbour Nominees held 40%")
        ev = Evidence(source_id=src_id, quote=QUOTE)
        db.add_all([claim, ev])
        db.flush()
        db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, stance="supports", decided_by_id="user-ony", decided_by_name="Ony"))
        db.add(ClaimReviewEvent(claim_id=claim.id, from_status="unverified", to_status="supported", from_confidence=0,
                                to_confidence=0.8, rationale="before names were kept"))
        db.commit()
        package, _ = build_investigation_export(db, inv, include_documents=True)
        anchor = db.get(Evidence, ev.id).anchor
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as target, authorization_scope_context(AuthorizationScope(actor_id="someone-else", role="admin")):
        restore_investigation_export(target, package, tmp_path / "restored")
        link = target.query(ClaimEvidenceLink).one()
        event = target.query(ClaimReviewEvent).one()
        assert (link.decided_by_id, link.decided_by_name) == ("user-ony", "Ony")
        assert event.decided_by_id is None
        assert target.query(Evidence).one().anchor == anchor
    engine.dispose()


def test_the_migration_anchors_the_quotes_already_in_a_case(tmp_path):
    import os
    import sqlite3
    import subprocess
    from pathlib import Path

    db_path = tmp_path / "before.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path.as_posix()}"}
    backend = Path(__file__).resolve().parents[1]
    subprocess.run(["alembic", "upgrade", "e8c4a1f7b293"], cwd=backend, env=env, check=True, capture_output=True)
    with sqlite3.connect(db_path) as con:
        con.execute("insert into investigations (id, name, is_demo, created_at) values ('i', 'Old', 0, '2026-10-01')")
        con.execute("insert into sources (id, investigation_id, title, source_type, metadata_json, created_at) "
                    "values ('s', 'i', 'J30', 'document', '{}', '2026-10-01')")
        con.execute("insert into documents (id, investigation_id, source_id, filename, mime_type, sha256, storage_path, extraction_status, created_at) "
                    "values ('d', 'i', 's', 'j30.pdf', 'application/pdf', 'x', '/nowhere', 'complete', '2026-10-01')")
        con.execute("insert into document_chunks (id, document_id, locator, page_number, ordinal, text, created_at) "
                    "values ('c', 'd', 'page 3', 3, 1, ?, '2026-10-01')", (PAGE,))
        con.execute("insert into evidence (id, source_id, quote) values ('e', 's', ?)", (QUOTE,))
        con.execute("insert into evidence (id, source_id, quote) values ('gone', 's', 'not on the page')")
    subprocess.run(["alembic", "upgrade", "head"], cwd=backend, env=env, check=True, capture_output=True)
    import json

    with sqlite3.connect(db_path) as con:
        rows = dict(con.execute("select id, anchor from evidence"))
    anchor = json.loads(rows["e"])
    assert anchor["chunk_id"] == "c" and anchor["document_id"] == "d" and (anchor["line_start"], anchor["line_end"]) == (3, 4)
    assert rows["gone"] is None


# --- review findings: the evidence's own locator, and viewers' backups ------------------------------------------------

def test_the_evidences_own_span_and_passage_come_before_the_first_match():
    p1 = {"id": "c1", "locator": "page 1", "page_number": 1, "text": "Paid to Kestrel SA. Later: paid to Kestrel SA."}
    p2 = {"id": "c2", "locator": "page 2", "page_number": 2, "text": "Again paid to Kestrel SA."}
    second = p1["text"].rindex("paid to Kestrel SA")
    by_span = find_anchor([p1, p2], "paid to Kestrel SA", locator=f"page 1@chars:{second}-{second + 18}")
    assert (by_span["chunk_id"], by_span["start"], by_span["match"], by_span["occurrences"]) == ("c1", second, "exact", 2)
    assert find_anchor([p1, p2], "paid to Kestrel SA", locator="page 2")["chunk_id"] == "c2"
    # A span that no longer holds the words falls back to looking for them.
    assert find_anchor([p1, p2], "paid to Kestrel SA", locator="page 1@chars:0-5")["start"] == second
    assert find_anchor([p1, p2], "paid to Kestrel SA", locator="p.9")["chunk_id"] == "c1"


def test_a_viewer_can_download_a_backup_and_it_is_not_recorded(tmp_path):
    from app.services.exports import build_investigation_export, record_backup

    inv, _src, _doc = _case_with_page(tmp_path)
    viewer = AuthorizationScope(actor_id="v", investigation_ids=frozenset({inv}), role="member", investigation_roles=((inv, "viewer"),))
    with SessionLocal() as db, authorization_scope_context(viewer):
        data, manifest = build_investigation_export(db, inv, include_documents=True)
        record_backup(db, inv, data, manifest)
        assert db.get(Investigation, inv).last_backup is None
