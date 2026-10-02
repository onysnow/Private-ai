"""ADR-0006 Wave B against a running OpenAleph (5.3.1), end to end.

Runs only when OPENALEPH_LIVE_URL is set, e.g.

    OPENALEPH_LIVE_URL=http://127.0.0.1:8001 TZ=UTC PYTHONPATH=. \\
        python -m pytest tests/test_openaleph_live_corpus.py -o addopts=""

Each run makes its own investigations, and so its own OpenAleph
collections; nothing it did not make is changed. OpenAleph is reached with
the single-user token (GET /api/2/metadata), as the Docker stack runs it.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any, Callable

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.jobs import corpus as corpus_jobs
from app.models.domain import (
    CorpusSyncState, CrossReferenceDecision, CrossReferenceProposal, Entity, Investigation, InvestigationCorpusBinding,
    OpenAlephEntityLink,
)
from app.schemas.api import EntityCreate
from app.services import openaleph_corpus
from app.services.cross_references import decide_cross_reference
from app.services.entities import create_entity
from app.services.entity_merge import execute_entity_merge, preview_entity_merge
from app.services.relationships import create_relationship
from app.services.resolution import record_canonical_resolution

LIVE_URL = os.environ.get("OPENALEPH_LIVE_URL", "").strip()
pytestmark = pytest.mark.skipif(not LIVE_URL, reason="needs OPENALEPH_LIVE_URL (a running OpenAleph)")


@pytest.fixture()
def live(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", LIVE_URL)
    monkeypatch.setattr(settings, "openaleph_api_key", "")
    monkeypatch.setattr(settings, "openaleph_corpus_poll_seconds", 1.0)
    monkeypatch.setattr(settings, "openaleph_corpus_push_delay_seconds", 1.0)
    monkeypatch.setattr(settings, "openaleph_xref_timeout_seconds", 300.0)
    monkeypatch.setattr(settings, "openaleph_sync_now_wait_seconds", 300.0)
    monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {})
    token = httpx.get(f"{LIVE_URL}/api/2/metadata", timeout=30).json()["token"]
    with httpx.Client(base_url=LIVE_URL, headers={"Authorization": f"Token {token}"}, timeout=60) as http:
        yield http


def _wait(check: Callable[[], Any], what: str, timeout: float = 120.0) -> Any:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(1.0)
    raise AssertionError(f"timed out waiting for {what}")


def _investigation(db, label: str) -> Investigation:
    inv = Investigation(name=f"Wave B live {label} {uuid.uuid4().hex[:8]}")
    db.add(inv); db.commit(); db.refresh(inv)
    return inv


def _entity(db, inv: Investigation, schema: str, caption: str, **props: list[str]) -> Entity:
    return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=dict(props)))


def _link(db, record_id: str) -> OpenAlephEntityLink:
    db.expire_all()
    row = db.scalar(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == record_id))
    assert row is not None, f"no link for {record_id}"
    return row


def _state(db, inv: Investigation) -> CorpusSyncState:
    db.expire_all()
    state = db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == inv.id))
    assert state is not None
    return state


def test_confirmed_records_reach_openaleph_and_a_merge_removes_the_merged_away_one(live):
    with SessionLocal() as db:
        inv = _investigation(db, "push")
        company = _entity(db, inv, "Company", "Meridian Holdings Ltd", jurisdiction=["gb"], registrationNumber=["09876543"])
        person = _entity(db, inv, "Person", "Jane Doe")
        duplicate = _entity(db, inv, "Company", "Meridian Holdings Limited", registrationNumber=["09876543"])
        directorship = create_relationship(db, investigation_id=inv.id, schema="Directorship", source_entity_id=person.id,
                                           target_entity_id=duplicate.id, properties={"role": ["director"]})
        corpus_jobs.sync_now(SessionLocal, inv.id)
        state = _state(db, inv)
        assert state.push_status == "succeeded", state.push_error
        assert state.push_counts["sent"] == 4

        company_id = _link(db, company.id).openaleph_entity_id
        stored = _wait(lambda: live.get(f"/api/2/entities/{company_id}").json() if live.get(
            f"/api/2/entities/{company_id}").status_code == 200 else None, "the company to be indexed")
        assert stored["schema"] == "Company" and stored["properties"]["registrationNumber"] == ["09876543"]
        binding = db.scalar(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == inv.id))
        assert str(stored["collection"]["id"]) == binding.collection_id

        # Merge the duplicate into the company: the directorship is re-sent
        # pointing at the company and the duplicate leaves OpenAleph once
        # OpenAleph has indexed that.
        record_canonical_resolution(db, db.get(Entity, duplicate.id), db.get(Entity, company.id), decision="same",
                                    confidence=0.95, rationale="Same registration number")
        preview = preview_entity_merge(db, db.get(Entity, duplicate.id), db.get(Entity, company.id))
        execute_entity_merge(db, db.get(Entity, duplicate.id), db.get(Entity, company.id), preview_digest=preview["preview_digest"])
        duplicate_id = _link(db, duplicate.id).openaleph_entity_id
        directorship_id = _link(db, directorship.relationship_entity_id).openaleph_entity_id
        corpus_jobs.sync_now(SessionLocal, inv.id)
        state = _state(db, inv)
        assert state.push_status == "succeeded", (state.push_status, state.push_message, state.push_error)
        assert state.push_counts["removed"] == 1
        assert db.scalar(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == duplicate.id)) is None
        _wait(lambda: live.get(f"/api/2/entities/{duplicate_id}").status_code == 404, "the merged-away record to go")
        relationship = _wait(lambda: live.get(f"/api/2/entities/{directorship_id}").json() if live.get(
            f"/api/2/entities/{directorship_id}").status_code == 200 else None, "the re-pointed directorship")
        organization = relationship["properties"]["organization"][0]
        assert (organization["id"] if isinstance(organization, dict) else organization) == company_id


def _binding(db, inv: Investigation) -> InvestigationCorpusBinding:
    binding = db.scalar(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == inv.id))
    assert binding is not None
    return binding


def test_two_investigations_sharing_a_company_are_cross_referenced_and_judged(live):
    """Two investigations hold the same company, spelled two ways: OpenAleph's
    cross-referencing finds it, the Workbench offers it for review, and the
    reporter's "Same entity" reaches OpenAleph as a match judgement."""
    number = f"WB{uuid.uuid4().hex[:10].upper()}"  # this run's company, not an earlier run's
    with SessionLocal() as db:
        harbour = _investigation(db, "xref harbour")
        port = _investigation(db, "xref port")
        ours = _entity(db, harbour, "Company", "Meridian Holdings Ltd", jurisdiction=["gb"], registrationNumber=[number])
        theirs = _entity(db, port, "Company", "Meridian Holdings Limited", jurisdiction=["gb"], registrationNumber=[number])
        corpus_jobs.sync_now(SessionLocal, port.id)
        corpus_jobs.sync_now(SessionLocal, harbour.id)
        state = _state(db, harbour)
        assert state.push_status == "succeeded", state.push_error
        assert state.xref_status == "succeeded", (state.xref_status, state.xref_error)
        ours_id, theirs_id = _link(db, ours.id).openaleph_entity_id, _link(db, theirs.id).openaleph_entity_id

        proposal = db.scalar(select(CrossReferenceProposal).where(
            CrossReferenceProposal.entity_id == ours.id, CrossReferenceProposal.match_openaleph_id == theirs_id))
        assert proposal is not None, [(row.match_caption, row.match_collection_label, row.score) for row in db.scalars(
            select(CrossReferenceProposal).where(CrossReferenceProposal.investigation_id == harbour.id))]
        assert (proposal.match_kind, proposal.match_investigation_id) == ("corpus", port.id)
        assert proposal.match_caption == "Meridian Holdings Limited" and proposal.match_schema == "Company"
        assert proposal.match_collection_label == _binding(db, port).collection_label
        # OpenAleph lists matches scoring over 0.5 (aleph/search/query.py
        # XrefQuery, SCORE_CUTOFF in aleph/logic/xref.py).
        assert 0.5 < proposal.score <= 1.0 and proposal.method
        assert {"name", "identifier"} <= {row["property_type"] for row in proposal.matched_properties}
        print(f"\nlive cross-reference: score {proposal.score} by {proposal.method}; matched {proposal.matched_properties}")

        reply = decide_cross_reference(db, proposal, decision="same", note="Same registration number")
        assert reply["identity_finding_id"] and reply["decision"]["judgement_status"] == "pending"
        corpus_jobs.sync_now(SessionLocal, harbour.id)
        db.expire_all()
        decision = db.get(CrossReferenceDecision, reply["decision"]["id"])
        assert decision.judgement_status == "sent", decision.judgement_error
        assert decision.openaleph_profile_id

        collection_id = _binding(db, harbour).collection_id

        def judged() -> dict[str, Any] | None:
            rows = live.get(f"/api/2/collections/{collection_id}/xref", params={"limit": 100}).json()["results"]
            for row in rows:
                if row["entity"]["id"] == ours_id and row["match"]["id"] == theirs_id and row.get("judgement") == "positive":
                    return dict(row)
            return None

        row = _wait(judged, "OpenAleph to show the reporter's judgement on the match")
        assert row["score"] == pytest.approx(proposal.score)
