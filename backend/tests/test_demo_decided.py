"""The demo's pre-made decisions (app/services/demo_decided.py): a loaded demo case is a finished investigation, so
Decide holds tens of items, not hundreds; every decision is stamped "Demo (pre-decided)", accepts only what the case
already holds, can be undone, and never runs on a case that is not a demo. The 1MDB case is built without
downloads (its eleven core documents are stand-ins that cannot be read; the files shipped with the app are read)."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.decided_by import DEMO_DECIDER_ID, DEMO_DECIDER_NAME
from app.db.session import SessionLocal, build_session_factory, engine
from app.jobs.handlers import EXTRACT_DOCUMENT, HANDLERS
from app.jobs.records import create_job, execute_job
from app.main import app
from app.models.domain import (
    CheckItem,
    Claim,
    ClaimEvidenceLink,
    Document,
    Entity,
    Evidence,
    ExtractionCandidate,
    RelationshipEdge,
    Statement,
)
from app.services import demo_1mdb, demo_decided
from app.services.case_home import decision_counts

client = TestClient(app)


def _offline(url: str) -> bytes:
    raise OSError("offline test")


def _build(db, tmp_path):
    base = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_1mdb.manifest()]
    inv, ids = demo_1mdb.build(db, base + demo_1mdb.fetch_more(_offline), storage_dir=tmp_path)
    assert demo_1mdb.LAST_PROBLEMS == []
    return inv, ids


def _read_all(db, inv, ids):
    factory = build_session_factory(engine)
    for doc_id in ids:
        job = create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=inv.id, subject_type="document", subject_id=doc_id, runner="inline")
        execute_job(factory, job.id, HANDLERS)
    db.expire_all()


def _records(db, inv_id):
    return {model.__name__: db.scalar(select(func.count()).select_from(model).where(model.investigation_id == inv_id))
            for model in (Entity, Claim, RelationshipEdge)}


def _norm(text):
    return re.sub(r"[^\w]+", " ", (text or "").replace("’", "'").casefold()).strip()


def _squash(text):
    return re.sub(r"\s+", " ", (text or "").replace("’", "'").replace("“", '"').replace("”", '"')).strip().casefold()


def _names(entity):
    props = entity.properties or {}
    return {_norm(n) for n in [entity.caption, *[v for p in ("name", "alias", "weakAlias", "previousName") for v in props.get(p) or []]]}


@pytest.fixture
def read_case(tmp_path):
    with SessionLocal() as db:
        inv, ids = _build(db, tmp_path)
        built = sum(decision_counts(db, inv.id).values())
        records = _records(db, inv.id)
        _read_all(db, inv, ids)
        yield db, inv, built, records


def test_a_loaded_demo_leaves_tens_waiting_and_accepts_only_what_it_holds(read_case):
    db, inv, built, records = read_case
    waiting = decision_counts(db, inv.id)
    total = sum(waiting.values())
    decided = list(db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id,
                                                                ExtractionCandidate.decided_by_id == DEMO_DECIDER_ID)))
    set_aside = db.scalar(select(func.count()).select_from(CheckItem).where(CheckItem.investigation_id == inv.id,
                                                                            CheckItem.decided_by_id == DEMO_DECIDER_ID))
    print(f"\nwaiting after the build: {built}; after the reads: {waiting} ({total}); "
          f"pre-decided: {len(decided)} proposals, {set_aside} To check / missing")
    # Without the pass the reads leave about 500 waiting (323 proposals, 175 missing values, 3 checks; measured 30 Oct).
    assert len(decided) + set_aside >= 400
    assert 10 <= total <= 60, waiting
    assert waiting.get("proposal", 0) <= demo_decided.PROPOSALS_WAITING and waiting.get("proposal", 0) >= 10
    assert 0 < waiting.get("missing", 0) <= demo_decided.MISSING_WAITING
    assert waiting.get("to_check", 0) <= demo_decided.TO_CHECK_WAITING
    # The reads' pass made no record: accepting is pointing at what the case holds.
    assert _records(db, inv.id) == records
    # Every decision is the demo's, with its rule; a proposal decided otherwise was held back by the OCR gate.
    others = list(db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id,
                                                               ExtractionCandidate.review_status.not_in(("proposed", "held")),
                                                               ExtractionCandidate.decided_by_id.is_(None))))
    assert others == []
    assert all(c.decided_by_name == DEMO_DECIDER_NAME and c.reviewer_note.startswith("Demo (pre-decided): ") for c in decided)
    accepted = [c for c in decided if c.review_status == "accepted"]
    assert {c.candidate_type for c in accepted} >= {"entity", "relationship"}
    for c in accepted:
        p = c.payload
        doc = db.get(Document, c.document_id)
        if c.candidate_type == "entity":
            record = db.get(Entity, c.accepted_record_id)
            paren = re.fullmatch(r"\s*(.+?)\s*\((.+)\)\s*", p["caption"])
            tries = {_norm(p["caption"]), *([_norm(paren.group(1)), _norm(paren.group(2))] if paren else [])}
            assert record.investigation_id == inv.id and tries & _names(record), (p["caption"], record.caption)
            # Its mention in the document is kept on the record, as "Same record" keeps it.
            assert db.scalar(select(Statement).where(Statement.entity_id == record.id, Statement.value == p["caption"],
                                                     Statement.origin.like(f"document:{doc.id}#%")))
        elif c.candidate_type == "evidence":
            ev = db.get(Evidence, c.accepted_record_id)
            assert ev.source_id == doc.source_id and _squash(ev.quote) in _squash(p["quote"])
        elif c.candidate_type == "claim":
            claim = db.get(Claim, c.accepted_record_id)
            quotes = [_squash(q) for q in db.scalars(select(Evidence.quote).join(ClaimEvidenceLink, ClaimEvidenceLink.evidence_id == Evidence.id)
                                                     .where(ClaimEvidenceLink.claim_id == claim.id, ClaimEvidenceLink.stance == "supports",
                                                            Evidence.source_id == doc.source_id))]
            text = _squash(p["text"])
            assert _squash(claim.text) == text or any(q in text or text in q for q in quotes)
        else:
            edge = db.get(RelationshipEdge, c.accepted_record_id)
            ends = [db.get(ExtractionCandidate, p[k]).accepted_record_id for k in ("source_candidate_id", "target_candidate_id")]
            props = db.get(Entity, edge.relationship_entity_id).properties
            assert edge.schema == "Payment" and [edge.source_entity_id, edge.target_entity_id] == ends
            assert p["properties"]["amount"][0] in props["amount"] and p["properties"]["date"][0] in [d[:10] for d in props.get("date") or []]
    # Rejected ones carry the rule that rejected them; the table's own rows wait for a person.
    rules = {c.reviewer_note for c in decided if c.review_status == "rejected"}
    assert any("court-caption words" in r for r in rules) and any("proposed already" in r for r in rules)
    table = [c for c in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id,
                                                                     ExtractionCandidate.candidate_type == "relationship"))]
    assert table and all(c.review_status in ("proposed", "accepted") for c in table)


def test_the_decisions_can_be_undone_and_a_persons_are_kept(read_case):
    db, inv, _, _ = read_case
    entity = db.scalar(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id, ExtractionCandidate.candidate_type == "entity",
                                                         ExtractionCandidate.review_status == "accepted", ExtractionCandidate.decided_by_id == DEMO_DECIDER_ID))
    record_id, caption = entity.accepted_record_id, entity.payload["caption"]
    mentions = select(func.count()).select_from(Statement).where(Statement.entity_id == record_id, Statement.value == caption,
                                                                 Statement.origin.like(f"document:{entity.document_id}#%"))
    assert db.scalar(mentions)
    body = client.post(f"/api/demo/pre-decided/{inv.id}/undo", json={"kind": "proposal", "id": entity.id}).json()
    assert body["undone"] == 1 and body["decided_by"] == DEMO_DECIDER_NAME
    db.expire_all()
    assert entity.review_status == "proposed" and entity.decided_by_id is None and entity.accepted_record_id is None
    assert db.scalar(mentions) == 0
    # A person decides one waiting proposal and one missing value; undoing all of the demo's leaves theirs.
    waiting = db.scalar(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id, ExtractionCandidate.review_status == "proposed",
                                                          ExtractionCandidate.candidate_type == "evidence"))
    assert client.post(f"/api/extraction-candidates/{waiting.id}/review", json={"decision": "reject"}).status_code == 200
    missing = db.scalar(select(CheckItem).where(CheckItem.investigation_id == inv.id, CheckItem.kind == "missing", CheckItem.status == "open"))
    assert client.post(f"/api/checks/{missing.id}/decide", json={"status": "unknowable", "note": "not public"}).status_code == 200
    db.expire_all()
    assert waiting.decided_by_id not in (None, DEMO_DECIDER_ID) and missing.decided_by_id not in (None, DEMO_DECIDER_ID)
    before = client.get(f"/api/demo/pre-decided/{inv.id}").json()["counts"]
    assert before["check"]["not_needed"] > 100
    body = client.post(f"/api/demo/pre-decided/{inv.id}/undo", json={}).json()
    assert body["undone"] == sum(n for kind in before.values() for n in kind.values())
    assert body["counts"] == {"proposal": {}, "check": {}, "watchlist": {}}
    db.expire_all()
    assert waiting.review_status == "rejected" and missing.status == "unknowable"
    assert db.scalar(select(func.count()).select_from(CheckItem).where(CheckItem.investigation_id == inv.id, CheckItem.decided_by_id.is_not(None),
                                                                       CheckItem.status == "open")) == 0
    # Undone, a decision is not made again by a later document's pass over the case.
    doc = db.scalar(select(Document).where(Document.investigation_id == inv.id))
    demo_decided.decide_checks(db, inv.id, doc.id)
    assert decision_counts(db, inv.id)["missing"] > 100


def test_never_on_a_case_that_is_not_a_demo(tmp_path):
    with SessionLocal() as db:
        inv, ids = _build(db, tmp_path)
        demo_decided.undo(db, inv.id)
        inv.is_demo = False
        db.commit()
        assert demo_decided.after_build(db, inv.id) == {}
        _read_all(db, inv, ids)
        assert db.scalar(select(func.count()).select_from(ExtractionCandidate).where(ExtractionCandidate.decided_by_id == DEMO_DECIDER_ID)) == 0
        assert db.scalar(select(func.count()).select_from(CheckItem).where(CheckItem.decided_by_id == DEMO_DECIDER_ID)) == 0
        assert decision_counts(db, inv.id)["proposal"] > 100
    assert client.get(f"/api/demo/pre-decided/{inv.id}").status_code == 404
