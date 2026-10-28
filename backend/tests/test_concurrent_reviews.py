"""Two people deciding the same thing at the same moment (PostgreSQL).

Each person's request has its own database session. Both read the record
before either writes, which is what happens when two reporters press a
button within the same instant. The second decision must see the first:
a proposal is accepted once, and a claim's review history says what the
status really was before each change.

Runs only against PostgreSQL (POSTGRES_TEST_URL, as the Procrastinate
tests); SQLite has one writer at a time.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimReviewEvent, Entity, ExtractionCandidate, Investigation
from app.services.claims import review_claim
from app.services.documents import review_candidate
from tests.document_helpers import ingest_document

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL", "")
pytestmark = pytest.mark.skipif(not POSTGRES_URL.startswith("postgresql"), reason="needs POSTGRES_TEST_URL")


@pytest.fixture()
def engine():
    from app.db.session import Base

    engine = create_engine(POSTGRES_URL)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def _both_at_once(engine, load, act) -> list[object]:
    """Run ``act`` for two people, each after ``load`` has read the record in
    their own session and neither has written yet. Returns each one's result
    or the exception it raised."""
    ready = threading.Barrier(2)
    results: list[object] = [None, None]

    def person(n: int) -> None:
        with Session(engine) as db:
            record = load(db)
            ready.wait()
            try:
                results[n] = act(db, record, n)
            except Exception as exc:  # the loser's refusal
                db.rollback()
                results[n] = exc

    threads = [threading.Thread(target=person, args=(n,)) for n in (0, 1)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    return results


def test_a_proposal_two_people_accept_at_once_becomes_one_record(engine, tmp_path: Path):
    with Session(engine) as db:
        inv = Investigation(name="Two reviewers")
        db.add(inv); db.commit()
        doc = ingest_document(db, investigation_id=inv.id, title="Memo", filename="memo.txt", mime_type="text/plain",
                              data=b"Acme Holdings Inc. announced a program.\n", storage_dir=tmp_path / "docs")
        candidate_id = db.scalar(select(ExtractionCandidate.id).where(
            ExtractionCandidate.document_id == doc.id, ExtractionCandidate.candidate_type == "entity"))
        assert candidate_id is not None
        inv_id = inv.id

    results = _both_at_once(
        engine, lambda db: db.get(ExtractionCandidate, candidate_id),
        lambda db, candidate, n: review_candidate(db, candidate, decision="accept" if n == 0 else "reject",
                                                  entity_schema="Company"))
    refused = [r for r in results if isinstance(r, Exception)]
    assert len(refused) == 1, results
    assert str(refused[0]) == "Candidate has already been reviewed"
    with Session(engine) as db:
        status = db.get(ExtractionCandidate, candidate_id).review_status
        entities = db.query(Entity).filter(Entity.investigation_id == inv_id).count()
    assert (status, entities) in {("accepted", 1), ("rejected", 0)}


def test_two_reviews_of_one_claim_at_once_both_record_the_status_they_changed(engine):
    with Session(engine) as db:
        inv = Investigation(name="Two reviewers")
        db.add(inv); db.commit()
        claim = Claim(investigation_id=inv.id, text="Acme paid Beta.", status="lead", confidence=0.2)
        db.add(claim); db.commit()
        claim_id = claim.id

    to = ["unverified", "disputed"]
    results = _both_at_once(
        engine, lambda db: db.get(Claim, claim_id),
        lambda db, claim, n: review_claim(db, claim, status=to[n], confidence=0.5, rationale=f"Reviewer {n}"))
    assert not [r for r in results if isinstance(r, Exception)], results
    with Session(engine) as db:
        events = db.scalars(select(ClaimReviewEvent).where(ClaimReviewEvent.claim_id == claim_id)
                            .order_by(ClaimReviewEvent.created_at)).all()
        final = db.get(Claim, claim_id).status
    # The history chains: the second change starts where the first ended.
    assert [e.from_status for e in events] == ["lead", events[0].to_status]
    assert final == events[1].to_status
