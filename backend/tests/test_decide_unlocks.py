"""Decide › "by what it unlocks" (CHECK_1; app/services/unlocks.py): a dry run of what a Yes would change, with
nothing written. A link that would close an ownership loop names the Red Flag it raises; a claim kept from a
primary official record meets Confirmed's rules, one from a social post meets nothing; the order puts the most
consequence first."""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.domain import (
    Claim,
    Document,
    ExtractionCandidate,
    PatternFlag,
    RelationshipEdge,
    Source,
)
from app.services.documents import extract_document, store_document
from tests.test_red_flags import _inv, _link, _party, client

SENTENCE = "The company was registered in Limassol in 2014 by the harbour authority."


def _document(inv: str, name: str, source_type: str) -> str:
    with SessionLocal() as db:
        doc = store_document(db, investigation_id=inv, title=name, filename=f"{name}.txt", mime_type="text/plain",
                             data=SENTENCE.encode(), storage_dir=settings.document_storage_dir)
        db.get(Source, doc.source_id).source_type = source_type
        db.commit()
        extract_document(db, doc.id, text=([{"locator": "line 1", "page_number": None, "text": SENTENCE}], []), find_names=False)
        return doc.id


def _decisions(inv: str, order: str) -> list[dict]:
    r = client.get(f"/api/investigations/{inv}/decisions", params={"order": order})
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_what_a_yes_unlocks_is_worked_out_without_writing_and_sorts_the_queue():
    inv = _inv("Harbour holdings")
    a, b, c = _party(inv, "Alder Ltd"), _party(inv, "Birch Ltd"), _party(inv, "Cedar Ltd")
    _link(inv, "Ownership", a, b)
    _link(inv, "Ownership", b, c)
    record = _document(inv, "registry-extract", "public_record")
    post = _document(inv, "a-post", "social")
    with SessionLocal() as db:
        loop = ExtractionCandidate(investigation_id=inv, document_id=post, candidate_type="relationship", confidence=0.0,
                                   payload={"schema": "Ownership", "label": "Ownership", "caption": "Cedar Ltd → Alder Ltd",
                                            "source_entity_id": c, "target_entity_id": a, "properties": {}})
        db.add(loop)
        db.commit()
        loop_id = loop.id

    items = _decisions(inv, "unlocks")
    first = items[0]
    assert first["id"] == loop_id and first["unlocks"] == ["Raises the Red Flag “Circular ownership” (Textbook)"], first
    claims = {i["evidence"]["filename"]: i for i in items if i["proposal"].startswith("Claim")}
    assert claims["registry-extract.txt"]["unlocks"] == ["Kept, the claim meets every rule for Confirmed (a primary official record says it)"]
    assert claims["a-post.txt"]["unlocks"] == []
    order = [i["id"] for i in items]
    assert order.index(claims["registry-extract.txt"]["id"]) < order.index(claims["a-post.txt"]["id"])
    # The card says it in any order, and nothing was saved by asking.
    assert {i["id"]: i["unlocks"] for i in _decisions(inv, "source")}[loop_id] == first["unlocks"]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PatternFlag).where(PatternFlag.investigation_id == inv)) == 0
        assert db.scalar(select(func.count()).select_from(Claim).where(Claim.investigation_id == inv)) == 0
        assert db.scalar(select(func.count()).select_from(RelationshipEdge).where(RelationshipEdge.investigation_id == inv)) == 2
        assert db.scalar(select(func.count()).select_from(Document).where(Document.investigation_id == inv)) == 2


def test_a_flag_already_raised_is_not_unlocked_again_and_a_rejected_end_unlocks_nothing():
    inv = _inv("Harbour holdings, raised")
    a, b, c = _party(inv, "Alder Ltd"), _party(inv, "Birch Ltd"), _party(inv, "Cedar Ltd")
    _link(inv, "Ownership", a, b)
    _link(inv, "Ownership", b, c)
    _link(inv, "Ownership", c, a)
    doc = _document(inv, "a-post", "social")
    with SessionLocal() as db:
        again = ExtractionCandidate(investigation_id=inv, document_id=doc, candidate_type="relationship", confidence=0.0,
                                    payload={"schema": "Ownership", "caption": "Cedar Ltd → Alder Ltd", "source_entity_id": c,
                                             "target_entity_id": a, "properties": {}})
        gone = ExtractionCandidate(investigation_id=inv, document_id=doc, candidate_type="entity", confidence=0.9,
                                   payload={"caption": "Dogwood Ltd"}, review_status="rejected")
        db.add_all([again, gone])
        db.flush()
        table = ExtractionCandidate(investigation_id=inv, document_id=doc, candidate_type="relationship", confidence=0.9,
                                    payload={"schema": "Ownership", "caption": "Dogwood Ltd → Alder Ltd", "rows": [2],
                                             "source_candidate_id": gone.id, "target_candidate_id": gone.id, "properties": {}})
        db.add(table)
        db.commit()
        ids = again.id, table.id
    unlocks = {i["id"]: i["unlocks"] for i in _decisions(inv, "unlocks")}
    assert unlocks[ids[0]] == [] and unlocks[ids[1]] == []
