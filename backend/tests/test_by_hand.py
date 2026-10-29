"""Add by hand (app/services/manual_entry.py, mockup ENTRY_1): a party, a link or an event written by a person, with
where it comes from. A passage must be in its document; a source with no file is kept as a source; with no source a
lead to find one is opened and nothing counts toward Supported. The preview writes nothing and says what the case
already holds, what waits in Decide, and what a link would change."""

from __future__ import annotations

import hashlib

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.domain import (
    Document,
    DocumentChunk,
    Entity,
    Evidence,
    ExtractionCandidate,
    Lead,
    RelationshipEdge,
    Source,
    Statement,
    TimelineEvent,
)
from tests.test_red_flags import _inv, _link, _party, client

LINE = "03/03/2019 TRF OUT LOOP TWO BV NL61 RABO 0123 4567 89 29,400.00 EUR ref INV-2019-114"


def _statement(inv: str, tmp_path) -> str:
    path = tmp_path / "statement.txt"
    path.write_text(LINE)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Bank statement, March 2019", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="statement.txt", sha256=hashlib.sha256(LINE.encode()).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="page 3", page_number=3, ordinal=1, text=LINE))
        db.commit()
        return doc.id


def _count(model, **where) -> int:
    with SessionLocal() as db:
        stmt = select(func.count()).select_from(model)
        for k, v in where.items():
            stmt = stmt.where(getattr(model, k) == v)
        return db.scalar(stmt)


def test_a_link_from_a_passage_says_what_it_changes_first_and_starts_with_its_evidence(tmp_path):
    inv = _inv("By hand")
    fern, loop, kestrel = _party(inv, "Fernhill Ltd"), _party(inv, "Loop Two BV", alias=["Loop 2 B.V."]), _party(inv, "Kestrel SA")
    _link(inv, "Ownership", loop, kestrel)
    _link(inv, "Ownership", kestrel, fern)
    doc = _statement(inv, tmp_path)
    assert [s["caption"] for s in client.get(f"/api/investigations/{inv}/by-hand/suggest", params={"q": "loop"}).json()] == ["Loop Two BV"]
    assert client.get(f"/api/investigations/{inv}/by-hand/suggest", params={"q": "loop 2"}).json()[0]["as"] == "another name of it"
    entry = {"kind": "link", "link": {"schema": "Payment", "source": {"entity_id": fern}, "target": {"entity_id": loop},
                                      "properties": {"amount": ["29400"], "currency": ["EUR"], "date": ["2019-03-03"]}},
             "source": {"mode": "passage", "document_id": doc, "quote": "LOOP TWO BV NL61 RABO 0123 4567 89 29,400.00 EUR"}}
    before = _count(RelationshipEdge, investigation_id=inv)
    preview = client.post(f"/api/investigations/{inv}/by-hand/preview", json=entry).json()
    assert preview["already"] == [] and any("Red Flag" in c for c in preview["changes"]), preview
    assert _count(RelationshipEdge, investigation_id=inv) == before  # the preview wrote nothing
    made = client.post(f"/api/investigations/{inv}/by-hand", json=entry)
    assert made.status_code == 201, made.text
    out = made.json()
    with SessionLocal() as db:
        edge = db.get(RelationshipEdge, out["record_id"])
        ev = db.get(Evidence, out["evidence_id"])
        assert edge.schema == "Payment" and ev.locator == "page 3" and "by hand" in ev.notes
        origins = {s.origin for s in db.scalars(select(Statement).where(Statement.entity_id == edge.relationship_entity_id))}
        assert origins == {f"document:{doc}#page 3"}
    again = client.post(f"/api/investigations/{inv}/by-hand/preview", json=entry).json()
    assert again["already"][0]["kind"] == "link" and again["already"][0]["same"]


def test_words_not_in_the_document_are_refused_and_nothing_is_left_half_made(tmp_path):
    inv = _inv("By hand, refused")
    fern = _party(inv, "Fernhill Ltd")
    doc = _statement(inv, tmp_path)
    parties, evidence = _count(Entity, investigation_id=inv), _count(Evidence)
    entry = {"kind": "link", "link": {"schema": "Ownership", "source": {"entity_id": fern}, "target": {"new": {"caption": "Marsh Holdings", "schema": "Company"}}},
             "source": {"mode": "passage", "document_id": doc, "quote": "Marsh Holdings owns Fernhill"}}
    r = client.post(f"/api/investigations/{inv}/by-hand", json=entry)
    assert r.status_code == 422 and "not in statement.txt" in r.json()["detail"]
    same = {**entry, "link": {**entry["link"], "target": {"entity_id": fern}}, "source": {"mode": "none"}}
    assert "two different parties" in client.post(f"/api/investigations/{inv}/by-hand", json=same).json()["detail"]
    assert _count(Entity, investigation_id=inv) == parties and _count(Evidence) == evidence


def test_a_party_with_no_source_yet_gets_a_lead_and_a_source_with_no_file_is_kept(tmp_path):
    inv = _inv("By hand, sources")
    held = _party(inv, "Harbour Nominees Ltd")
    with SessionLocal() as db:
        db.add(ExtractionCandidate(investigation_id=inv, document_id=_statement(inv, tmp_path), candidate_type="entity", confidence=0.8,
                                   payload={"caption": "Marsh Holdings"}))
        db.commit()
    hits = client.post(f"/api/investigations/{inv}/by-hand/preview", json={"kind": "party", "party": {"caption": "Marsh Holdings", "schema": "Company"}}).json()
    assert hits["waiting"][0]["as"] == "waiting in Decide"
    assert client.post(f"/api/investigations/{inv}/by-hand/preview", json={"kind": "party", "party": {"caption": "harbour nominees ltd", "schema": "Company"}}).json()["already"][0]["id"] == held
    out = client.post(f"/api/investigations/{inv}/by-hand", json={"kind": "party", "party": {"caption": "Marsh Holdings", "schema": "Company", "country": "cy"},
                                                                  "source": {"mode": "none"}}).json()
    assert out["evidence_id"] is None and out["lead_id"]
    with SessionLocal() as db:
        lead = db.get(Lead, out["lead_id"])
        assert lead.title == "Find a source for: Marsh Holdings (Company)"
        assert db.get(Entity, out["record_id"]).properties["country"] == ["cy"]
    call = client.post(f"/api/investigations/{inv}/by-hand", json={
        "kind": "event", "event": {"title": "Board meeting on the lease", "date": "2019-03", "precision": "month", "where": "Fernhill harbour office", "entity_ids": [held]},
        "source": {"mode": "record", "title": "Call with a former board member", "source_type": "interview", "notes": "Said the board met in March 2019."}})
    assert call.status_code == 201, call.text
    with SessionLocal() as db:
        ev = db.get(TimelineEvent, call.json()["record_id"])
        assert ev.precision == "month" and ev.verification_status == "asserted" and ev.description == "Where: Fernhill harbour office"
        assert db.get(Source, ev.source_id).title == "Call with a former board member"
    bad = client.post(f"/api/investigations/{inv}/by-hand", json={"kind": "event", "event": {"title": "x", "date": "March"}, "source": {"mode": "none"}})
    assert bad.status_code == 422 and "a year, a month or a day" in bad.json()["detail"]
