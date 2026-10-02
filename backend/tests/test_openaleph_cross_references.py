"""OpenAleph's cross-referencing as proposals for reporters (ADR-0006, Wave B,
item 2): storing matches, the review decisions and their judgements in
OpenAleph, matches between our own records as duplicate candidates, the
cross-referencing job, and who may see a match.

OpenAleph is faked at its HTTP surface (tests/openaleph_corpus_fake.py); match rows
have the shape GET /api/2/collections/{id}/xref answered on the live stack.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from followthemoney.namespace import Namespace
from sqlalchemy import select

from app.core.authorization import AuthorizationScope, InvestigationAuthorizationError
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs import corpus as corpus_jobs
from app.main import app, register_domain_routers
from app.models.domain import (
    ConnectorFinding, CorpusSyncState, CrossReferenceDecision, CrossReferenceProposal, Entity, Investigation,
    OpenAlephEntityLink, OpenAlephOperationFailure, ResolutionDecision,
)
from app.schemas.api import EntityCreate
from app.services.corpus_push import corpus_sync_status, push_confirmed_records
from app.services.cross_references import (
    decide_cross_reference, import_cross_references, list_cross_references, matched_properties, send_pending_judgements,
)
from app.services.entities import create_entity
from app.services.resolution import canonical_duplicate_candidates
from tests.openaleph_corpus_fake import BASE_URL, FakeOpenAleph
from tests.test_openaleph_corpus_push import RecordingQueue, _merge

client = TestClient(app)


@pytest.fixture()
def openaleph(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_ui_url", "http://openaleph-ui.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    fake = FakeOpenAleph()
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    return fake


def _investigation(db, name: str) -> Investigation:
    inv = Investigation(name=name)
    db.add(inv); db.commit(); db.refresh(inv)
    return inv


def _entity(db, inv: Investigation, schema: str, caption: str, **props: list[str]) -> Entity:
    return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=dict(props)))


def _served(fake: FakeOpenAleph, collection_id: str, entity_id: str) -> dict[str, Any]:
    """An entity the way OpenAleph's entity serializer nests its collection."""
    stored = dict(fake.entities[collection_id][entity_id])
    collection = fake.collections[collection_id]
    stored["caption"] = (stored.get("properties", {}).get("name") or [stored["schema"]])[0]
    stored["collection"] = {"id": collection_id, "collection_id": collection_id, "label": collection["label"]}
    stored.pop("collection_id", None)
    return stored


def _row(entity: dict[str, Any], match: dict[str, Any], score: float = 0.976, method: str = "regression-v1") -> dict[str, Any]:
    return {"score": score, "method": method, "schema": match["schema"], "collection_id": entity["collection"]["id"],
            "judgement": "no_judgement", "id": f"xref-{entity['id'][:6]}-{match['id'][:6]}", "writeable": True,
            "entity": entity, "match": match}


@pytest.fixture()
def two(openaleph):
    """Two investigations whose collections hold the same company, spelled
    two ways, each pushed to the fake OpenAleph."""
    with SessionLocal() as db:
        harbour = _investigation(db, "Harbour contracts")
        port = _investigation(db, "Port authority")
        ours = _entity(db, harbour, "Company", "Meridian Holdings Ltd", jurisdiction=["gb"], registrationNumber=["09876543"])
        theirs = _entity(db, port, "Company", "Meridian Holdings Limited", jurisdiction=["gb"], registrationNumber=["09876543"])
        gateway = openaleph.gateway()
        push_confirmed_records(db, harbour.id, gateway=gateway)
        push_confirmed_records(db, port.id, gateway=gateway)
        openaleph.finish_indexing()
        ours_id = Namespace("fake-ns-1").sign(ours.id)
        theirs_id = Namespace("fake-ns-2").sign(theirs.id)
        yield db, harbour, port, ours, theirs, _served(openaleph, "1", ours_id), _served(openaleph, "2", theirs_id)


def test_matched_properties_say_what_agrees():
    ours = {"id": "a", "schema": "Company", "properties": {"name": ["Meridian Holdings Ltd"], "registrationNumber": ["09876543"],
                                                         "jurisdiction": ["gb"], "website": ["https://m.example"]}}
    theirs = {"id": "b", "schema": "Company", "properties": {"name": ["Meridian Holdings Limited"], "registrationNumber": ["09876543"],
                                                           "jurisdiction": ["fr"], "parent": [{"id": "nested", "schema": "Company"}]}}
    rows = matched_properties(ours, theirs)
    by_type = {row["property_type"]: row for row in rows}
    # The website is only on one side and the countries differ: neither agrees.
    assert set(by_type) == {"name", "identifier"}
    assert by_type["identifier"] == {"property_type": "identifier", "label": "Identifier", "score": 1.0,
                                     "ours": ["09876543"], "theirs": ["09876543"]}
    assert by_type["name"]["ours"] == ["Meridian Holdings Ltd"] and by_type["name"]["theirs"] == ["Meridian Holdings Limited"]
    assert rows == sorted(rows, key=lambda row: (-row["score"], row["property_type"]))
    assert matched_properties({"id": "a", "schema": "NoSuchSchema"}, theirs) == []


def test_a_match_in_another_collection_becomes_a_cross_reference(two):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    counts = import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    assert counts == {"results": 1, "new": 1, "updated": 0, "duplicates": 0, "skipped": 0}
    proposal = db.scalars(select(CrossReferenceProposal)).one()
    assert (proposal.entity_id, proposal.match_kind, proposal.status) == (ours.id, "corpus", "open")
    assert proposal.match_openaleph_id == theirs_served["id"] and proposal.openaleph_entity_id == ours_served["id"]
    assert (proposal.match_collection_id, proposal.match_collection_label) == ("2", "Port authority")
    assert proposal.match_investigation_id == port.id and proposal.other_entity_id is None
    assert (proposal.match_caption, proposal.match_schema, proposal.score, proposal.method) == (
        "Meridian Holdings Limited", "Company", 0.976, "regression-v1")
    assert proposal.match_properties["registrationNumber"] == ["09876543"]
    assert {row["property_type"] for row in proposal.matched_properties} == {"name", "identifier", "country"}

    # The same match again updates it; a decided one is not reopened.
    proposal.status = "decided"; db.commit()
    again = import_cross_references(db, harbour.id, [_row(ours_served, theirs_served, score=0.99)])
    assert again["updated"] == 1 and again["new"] == 0
    db.refresh(proposal)
    assert (proposal.score, proposal.status) == (0.99, "decided")


def test_rows_the_investigation_has_no_side_in_are_skipped(two):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    stranger = {**theirs_served, "id": "stranger.sig"}
    rows = [_row(theirs_served, stranger), {"score": 0.9, "entity": None, "match": theirs_served}, {"score": 0.9}]
    assert import_cross_references(db, harbour.id, rows) == {"results": 3, "new": 0, "updated": 0, "duplicates": 0, "skipped": 3}
    # Reported the other way round (our record is the match), it is still ours.
    assert import_cross_references(db, harbour.id, [_row(theirs_served, ours_served)])["new"] == 1
    assert db.scalars(select(CrossReferenceProposal)).one().entity_id == ours.id
    # A match in a collection no investigation of ours holds keeps OpenAleph's label.
    outside = {**theirs_served, "id": "outside.sig", "collection": {"id": "99", "label": "Sanctions list"}}
    import_cross_references(db, harbour.id, [_row(ours_served, outside, 0.7)])
    row = db.scalar(select(CrossReferenceProposal).where(CrossReferenceProposal.match_openaleph_id == "outside.sig"))
    assert (row.match_collection_id, row.match_collection_label, row.match_investigation_id) == ("99", "Sanctions list", None)


def test_a_match_on_a_relationship_record_is_not_offered(openaleph):
    """Relationships are not reviewed as identities: OpenAleph only
    cross-references matchable types, and a stray match on one is skipped."""
    from app.services.relationships import create_relationship

    with SessionLocal() as db:
        inv = _investigation(db, "Harbour contracts")
        jane = _entity(db, inv, "Person", "Jane Doe")
        meridian = _entity(db, inv, "Company", "Meridian Holdings Ltd")
        edge = create_relationship(db, investigation_id=inv.id, schema="Directorship", source_entity_id=jane.id,
                                   target_entity_id=meridian.id)
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        openaleph.finish_indexing()
        edge_served = _served(openaleph, "1", Namespace("fake-ns-1").sign(edge.relationship_entity_id))
        elsewhere = {**edge_served, "id": "elsewhere.sig", "collection": {"id": "99", "label": "Elsewhere"}}
        assert import_cross_references(db, inv.id, [_row(edge_served, elsewhere)])["skipped"] == 1
        assert db.scalars(select(CrossReferenceProposal)).all() == []


def test_a_match_between_our_own_records_is_a_duplicate_candidate(openaleph):
    with SessionLocal() as db:
        inv = _investigation(db, "Harbour contracts")
        a = _entity(db, inv, "Company", "Meridian Holdings Ltd", registrationNumber=["09876543"])
        # Nothing in the name, and another type: the Workbench's own name
        # comparison would not offer it (resolution.candidate_entities).
        b = _entity(db, inv, "Organization", "MHL (UK)", registrationNumber=["09876543"])
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        openaleph.finish_indexing()
        ns = Namespace("fake-ns-1")
        a_served, b_served = _served(openaleph, "1", ns.sign(a.id)), _served(openaleph, "1", ns.sign(b.id))
        counts = import_cross_references(db, inv.id, [_row(a_served, b_served, 0.8), _row(b_served, a_served, 0.8)])
        assert counts["duplicates"] == 1 and counts["new"] == 0
        proposal = db.scalars(select(CrossReferenceProposal)).one()
        assert proposal.match_kind == "duplicate" and {proposal.entity_id, proposal.other_entity_id} == {a.id, b.id}
        assert proposal.entity_id == min(a.id, b.id)
        # Not a cross-reference to review here: it joins the dossier's duplicate candidates.
        assert list_cross_references(db, inv.id, scope=None) == []
        for one, other in ((a, b), (b, a)):
            found = next(row for row in canonical_duplicate_candidates(db, db.get(Entity, one.id)) if row["entity_id"] == other.id)
            assert found["found_by"] == ["openaleph_xref"] and found["score"] == 0.8
        # A record the name comparison also finds keeps the higher score and both reasons.
        c = _entity(db, inv, "Company", "Meridian Holdings")
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        openaleph.finish_indexing()
        c_served = _served(openaleph, "1", ns.sign(c.id))
        import_cross_references(db, inv.id, [_row(a_served, c_served, 0.95)])
        both = next(row for row in canonical_duplicate_candidates(db, db.get(Entity, a.id)) if row["entity_id"] == c.id)
        assert both["found_by"] == ["name_overlap", "openaleph_xref"] and both["score"] == 0.95
        # A merged-away record is no longer offered, and its matches are not stored.
        _merge(db, db.get(Entity, b.id), db.get(Entity, c.id))
        assert all(row["entity_id"] != b.id for row in canonical_duplicate_candidates(db, db.get(Entity, a.id)))
        assert import_cross_references(db, inv.id, [_row(b_served, a_served)])["skipped"] == 1
        assert import_cross_references(db, inv.id, [_row(a_served, b_served)])["skipped"] == 1


def test_the_review_list_hides_matches_the_reader_may_not_see(two):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    outside = {**theirs_served, "id": "outside.sig", "collection": {"id": "99", "collection_id": "99", "label": "Sanctions list"}}
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served), _row(ours_served, outside, 0.7)])
    everyone = list_cross_references(db, harbour.id, scope=None)
    assert [row["match"]["collection_label"] for row in everyone] == ["Port authority", "Sanctions list"]  # best score first
    assert everyone[1]["match"]["investigation_id"] is None
    harbour_only = AuthorizationScope("reporter-1", frozenset({harbour.id}), role="reporter")
    assert [row["match"]["openaleph_id"] for row in list_cross_references(db, harbour.id, scope=harbour_only)] == ["outside.sig"]
    assert list_cross_references(db, harbour.id, scope=None, status="decided") == []
    row = everyone[0]
    assert row["match"]["url"] == f"http://openaleph-ui.test/entities/{theirs_served['id']}"
    assert row["entity"] == {"id": ours.id, "caption": "Meridian Holdings Ltd", "schema": "Company"}
    assert row["decision"] is None and row["identity_finding_id"] is None


def test_same_entity_records_an_external_identity_and_queues_the_judgement(two, monkeypatch):
    from app.services.dossier import entity_dossier

    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    queue = RecordingQueue()
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), queue)
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    proposal = db.scalars(select(CrossReferenceProposal)).one()

    reply = decide_cross_reference(db, proposal, decision="same", note="  Same registration number  ")
    assert reply["status"] == "decided"
    assert {key: reply["decision"][key] for key in ("decision", "note", "judgement", "judgement_status")} == {
        "decision": "same", "note": "Same registration number", "judgement": "positive", "judgement_status": "pending"}
    finding = db.get(ConnectorFinding, reply["identity_finding_id"])
    assert (finding.provider, finding.provider_record_id, finding.caption, finding.review_status) == (
        "openaleph", theirs_served["id"], "Meridian Holdings Limited", "accepted")
    assert finding.source_url == f"http://openaleph-ui.test/entities/{theirs_served['id']}"
    assert finding.raw["collection_label"] == "Port authority"
    resolution = db.scalars(select(ResolutionDecision).where(ResolutionDecision.finding_id == finding.id)).one()
    assert (resolution.entity_id, resolution.decision, resolution.confidence) == (ours.id, "positive", 0.976)
    assert resolution.rationale == "Same registration number"
    assert queue.deferred[-1][0].kwargs == {"investigation_id": harbour.id}
    # The dossier lists the OpenAleph entity among the entity's external records.
    assert [row.id for row in entity_dossier(db, ours.id)["external"]["findings"]] == [finding.id]

    # Changing one's mind: the unsent judgement is superseded and the identity
    # record gets a newer, negative resolution rather than being erased.
    reply = decide_cross_reference(db, proposal, decision="different", note=None)
    assert reply["decision"]["judgement"] == "negative" and reply["identity_finding_id"] == finding.id
    rows = db.scalars(select(CrossReferenceDecision).order_by(CrossReferenceDecision.created_at)).all()
    assert [row.judgement_status for row in rows] == ["superseded", "pending"]
    decisions = db.scalars(select(ResolutionDecision).order_by(ResolutionDecision.created_at)).all()
    assert [row.decision for row in decisions] == ["positive", "negative"]
    assert decisions[1].rationale == "Reporter decision on an OpenAleph cross-reference (Port authority)"
    db.refresh(finding)
    assert finding.review_status == "rejected"

    # "Not sure" with no earlier identity record makes none.
    other = {**theirs_served, "id": "other.sig", "caption": "Meridian Group"}
    import_cross_references(db, harbour.id, [_row(ours_served, other, 0.6)])
    second = db.scalar(select(CrossReferenceProposal).where(CrossReferenceProposal.match_openaleph_id == "other.sig"))
    reply = decide_cross_reference(db, second, decision="unsure", note="Ask the registry")
    assert reply["identity_finding_id"] is None and reply["decision"]["judgement"] == "unsure"


def test_decisions_that_are_not_for_this_review(two):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    proposal = db.scalars(select(CrossReferenceProposal)).one()
    with pytest.raises(ValueError, match="same, different or unsure"):
        decide_cross_reference(db, proposal, decision="maybe", note=None)
    proposal.match_kind = "duplicate"; db.commit()
    with pytest.raises(ValueError, match="possible duplicate"):
        decide_cross_reference(db, proposal, decision="same", note=None)
    proposal.match_kind = "corpus"; db.commit()
    other = _entity(db, harbour, "Company", "Meridian Holdings Ltd.")
    _merge(db, db.get(Entity, ours.id), db.get(Entity, other.id))
    with pytest.raises(ValueError, match="merged"):
        decide_cross_reference(db, proposal, decision="same", note=None)
    assert list_cross_references(db, harbour.id, scope=None) == []  # merged-away records drop out of review
    assert db.scalars(select(CrossReferenceDecision)).all() == []


def test_judgements_reach_openaleph_or_are_marked_failed(two, openaleph):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    gone = {**theirs_served, "id": "gone.sig"}
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served), _row(ours_served, gone, 0.6)])
    first, second = db.scalars(select(CrossReferenceProposal).order_by(CrossReferenceProposal.score.desc())).all()
    decide_cross_reference(db, first, decision="same", note=None)
    decide_cross_reference(db, second, decision="unsure", note=None)

    counts = send_pending_judgements(db, harbour.id, gateway=openaleph.gateway())
    assert counts == {"sent": 2, "failed": 0}
    assert openaleph.pairwise == [
        {"entity_id": ours_served["id"], "match_id": theirs_served["id"], "judgement": "positive"},
        {"entity_id": ours_served["id"], "match_id": "gone.sig", "judgement": "unsure"},
    ]
    sent = db.scalars(select(CrossReferenceDecision).order_by(CrossReferenceDecision.created_at)).all()
    assert [(row.judgement_status, row.openaleph_profile_id) for row in sent] == [("sent", "profile-1"), ("sent", "profile-2")]
    assert sent[0].judgement_sent_at is not None
    assert send_pending_judgements(db, harbour.id, gateway=openaleph.gateway()) == {"sent": 0, "failed": 0}

    # OpenAleph refuses (400) or no longer has our entity (404): failed and recorded.
    decide_cross_reference(db, first, decision="different", note=None)
    openaleph.fail[("POST", "/api/2/profiles/_pairwise")] = 400
    assert send_pending_judgements(db, harbour.id, gateway=openaleph.gateway()) == {"sent": 0, "failed": 1}
    latest = db.scalars(select(CrossReferenceDecision).order_by(CrossReferenceDecision.created_at.desc())).first()
    assert latest.judgement_status == "failed" and "HTTP 400" in latest.judgement_error
    assert db.scalars(select(OpenAlephOperationFailure)).one().operation == "corpus_judgement"

    decide_cross_reference(db, first, decision="same", note=None)
    openaleph.fail[("POST", "/api/2/profiles/_pairwise")] = 404
    assert send_pending_judgements(db, harbour.id, gateway=openaleph.gateway()) == {"sent": 0, "failed": 1}

    # OpenAleph unreachable (5xx): the judgement stays pending and the push is retried.
    decide_cross_reference(db, first, decision="unsure", note=None)
    openaleph.fail[("POST", "/api/2/profiles/_pairwise")] = 503
    with pytest.raises(httpx.HTTPStatusError):
        send_pending_judgements(db, harbour.id, gateway=openaleph.gateway())
    pending = db.scalars(select(CrossReferenceDecision).where(CrossReferenceDecision.judgement_status == "pending")).all()
    assert len(pending) == 1

    # Our record left OpenAleph meanwhile: nothing to judge from.
    db.delete(db.scalars(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == ours.id)).one())
    db.commit()
    assert send_pending_judgements(db, harbour.id, gateway=openaleph.gateway()) == {"sent": 0, "failed": 1}


def test_the_push_job_sends_judgements_and_counts_them(two, openaleph):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    decide_cross_reference(db, db.scalars(select(CrossReferenceProposal)).one(), decision="same", note=None)
    assert corpus_sync_status(db, harbour.id, background=False)["pending"]["judgements"] == 1
    corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway())
    status = corpus_sync_status(db, harbour.id, background=False)
    assert status["pending"]["judgements"] == 0 and status["push"]["judgements_sent"] == 1
    assert status["push"]["message"] == "Sent 1 match judgement(s)"
    assert len(openaleph.pairwise) == 1

    decide_cross_reference(db, db.scalars(select(CrossReferenceProposal)).one(), decision="different", note=None)
    openaleph.fail[("POST", "/api/2/profiles/_pairwise")] = 400
    corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway())
    status = corpus_sync_status(db, harbour.id, background=False)
    assert status["push"]["judgements_failed"] == 1 and status["push"]["status"] == "succeeded"
    assert status["push"]["message"] == "OpenAleph refused 1 match judgement(s)"
    assert status["failures"][0]["operation"] == "corpus_judgement"

    # Unreachable: the push itself is tried again later.
    decide_cross_reference(db, db.scalars(select(CrossReferenceProposal)).one(), decision="same", note=None)
    openaleph.fail[("POST", "/api/2/profiles/_pairwise")] = 503
    follow_ups = corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway())
    assert [(step.task, step.retry) for step in follow_ups] == [(corpus_jobs.PUSH_TASK, True)]
    assert corpus_sync_status(db, harbour.id, background=False)["pending"]["judgements"] == 1


# --- the cross-referencing job -----------------------------------------------------

def _state(db, inv) -> CorpusSyncState:
    db.expire_all()
    return db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == inv.id))


def _step(inv, phase: str, delay: float | None = None) -> corpus_jobs.FollowUp:
    return corpus_jobs.FollowUp(corpus_jobs.XREF_TASK, settings.openaleph_corpus_poll_seconds if delay is None else delay,
                                {"investigation_id": inv.id, "phase": phase})


def test_a_push_that_changes_the_collection_queues_cross_referencing(two, openaleph):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    _entity(db, harbour, "Person", "Jane Doe")
    follow_ups = corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway())
    assert follow_ups == [_step(harbour, "start", settings.openaleph_corpus_push_delay_seconds)]
    # Nothing changed and the last run has not succeeded: asked again.
    assert corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway()) == follow_ups
    state = _state(db, harbour)
    state.xref_status, state.xref_requested_at = "succeeded", state.changed_at + timedelta(seconds=1)
    db.commit()
    assert corpus_jobs.push_step(SessionLocal, harbour.id, gateway=openaleph.gateway()) == []


def test_the_cross_referencing_job_waits_starts_waits_and_collects(two, openaleph):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    gateway = openaleph.gateway()

    openaleph.index_busy = True  # still indexing: cross-referencing would miss records
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "start", gateway=gateway) == [_step(harbour, "wait")]
    state = _state(db, harbour)
    assert state.xref_status == "waiting" and openaleph.xref_requests == []
    waiting_since = state.xref_requested_at
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "wait", gateway=gateway) == [_step(harbour, "wait")]
    assert _state(db, harbour).xref_requested_at == waiting_since  # the wait is timed from the start

    openaleph.index_busy = False
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "wait", gateway=gateway) == [_step(harbour, "collect")]
    assert openaleph.xref_requests == ["1"] and _state(db, harbour).xref_status == "running"
    assert corpus_sync_status(db, harbour.id, background=False)["cross_reference"]["status"] == "running"

    openaleph.xref_running = True
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "collect", gateway=gateway) == [_step(harbour, "collect")]

    openaleph.xref_running = False
    openaleph.xref_rows["1"] = [_row(ours_served, theirs_served)]
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "collect", gateway=gateway) == []
    state = _state(db, harbour)
    assert state.xref_status == "succeeded" and state.xref_finished_at is not None
    assert state.xref_counts == {"results": 1, "new": 1, "updated": 0, "duplicates": 0, "skipped": 0}
    status = corpus_sync_status(db, harbour.id, background=False)["cross_reference"]
    assert (status["open"], status["results"], status["new"]) == (1, 1, 1)

    # A change pushed while OpenAleph was cross-referencing is not in that run.
    state.changed_at = state.xref_requested_at + timedelta(seconds=1)
    db.commit()
    openaleph.xref_rows["1"] = []
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "collect", gateway=gateway) == [
        _step(harbour, "start", settings.openaleph_corpus_push_delay_seconds)]

    # Cross-referencing never starts a second run beside one OpenAleph is doing.
    openaleph.xref_running = True
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "start", gateway=gateway) == [_step(harbour, "wait")]
    assert openaleph.xref_requests == ["1"]


def test_cross_referencing_gives_up_after_the_timeout_and_records_failures(two, openaleph, monkeypatch):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    gateway = openaleph.gateway()
    openaleph.xref_running = True
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "start", gateway=gateway) == [_step(harbour, "wait")]
    monkeypatch.setattr(settings, "openaleph_xref_timeout_seconds", -1.0)  # long past
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "wait", gateway=gateway) == []
    state = _state(db, harbour)
    assert state.xref_status == "failed" and "still busy with the collection after 1 minute(s)" in state.xref_error
    state.xref_status = "running"; db.commit()
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "collect", gateway=gateway) == []
    assert "had not finished cross-referencing" in _state(db, harbour).xref_error

    # OpenAleph answers 5xx: recorded, and tried again after the usual wait.
    monkeypatch.setattr(settings, "openaleph_xref_timeout_seconds", 1800.0)
    openaleph.xref_running = False
    openaleph.fail[("POST", "/api/2/collections/1/xref")] = 502
    retry = corpus_jobs.xref_step(SessionLocal, harbour.id, "wait", gateway=gateway)
    assert retry == [corpus_jobs.FollowUp(corpus_jobs.XREF_TASK, 30.0 * 2 ** 2, {"investigation_id": harbour.id, "phase": "start"},
                                          retry=True)]
    openaleph.fail = {("GET", "/api/2/collections/1/xref"): 503}
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "collect", gateway=gateway)[0].kwargs["phase"] == "collect"
    operations = [row.operation for row in db.scalars(select(OpenAlephOperationFailure))]
    assert operations.count("corpus_cross_reference") == 4
    assert corpus_jobs.xref_step(SessionLocal, harbour.id, "sideways", gateway=gateway) == []
    assert "Unknown cross-referencing phase" in _state(db, harbour).xref_error
    assert corpus_sync_status(db, harbour.id, background=False)["cross_reference"]["status"] == "failed"


def test_cross_referencing_needs_a_collection_and_the_integration(openaleph, monkeypatch):
    with SessionLocal() as db:
        inv = _investigation(db, "Nothing sent yet")
        assert corpus_jobs.xref_step(SessionLocal, inv.id, "start", gateway=openaleph.gateway()) == []
        demo = Investigation(name="Demo", is_demo=True)
        db.add(demo); db.commit()
        assert corpus_jobs.xref_step(SessionLocal, demo.id, "start", gateway=openaleph.gateway()) == []
        monkeypatch.setattr(settings, "openaleph_enabled", False)
        assert corpus_jobs.xref_step(SessionLocal, inv.id, "start", gateway=openaleph.gateway()) == []
        assert openaleph.calls == []


def test_xref_due():
    now = datetime(2026, 10, 2, 12, 0)
    state = CorpusSyncState(xref_status="never")
    assert not corpus_jobs.xref_due(state, now)              # nothing was ever sent
    state.changed_at = now
    assert corpus_jobs.xref_due(state, now)                  # sent, never cross-referenced
    state.xref_status, state.xref_requested_at = "running", now
    assert not corpus_jobs.xref_due(state, now)              # a run is under way; it re-checks when it ends
    assert corpus_jobs.xref_due(state, now + timedelta(hours=2))  # ...unless it was lost
    state.xref_status, state.xref_requested_at = "succeeded", now + timedelta(minutes=1)
    assert not corpus_jobs.xref_due(state, now)              # the last successful run saw the change
    state.changed_at = now + timedelta(minutes=2)
    assert corpus_jobs.xref_due(state, now)                  # a change after it
    state.xref_status = "failed"
    assert corpus_jobs.xref_due(state, now)


def test_sync_now_runs_push_cross_referencing_and_stores_the_matches(two, openaleph):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    openaleph.auto_index = True
    openaleph.xref_rows["1"] = [_row(ours_served, theirs_served)]
    sleeps: list[float] = []
    _entity(db, harbour, "Person", "Jane Doe")  # a change, so the push queues cross-referencing
    corpus_jobs.sync_now(SessionLocal, harbour.id, gateway=openaleph.gateway(), sleep=sleeps.append, clock=lambda: 0.0)
    assert openaleph.xref_requests == ["1"]
    assert sleeps == [settings.openaleph_corpus_push_delay_seconds, settings.openaleph_corpus_poll_seconds]
    assert [row["match"]["caption"] for row in list_cross_references(db, harbour.id, scope=None)] == ["Meridian Holdings Limited"]


def test_sync_now_carries_on_a_run_an_earlier_one_left_going(two, openaleph):
    """Developer mode has no worker to carry a long run on: the next "Sync now" does."""
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    gateway = openaleph.gateway()
    _entity(db, harbour, "Person", "Jane Doe")
    # The push, the start of cross-referencing (OpenAleph is still indexing),
    # then the request's time is up.
    clock = iter([0.0, 0.0, 0.0, 1000.0])
    corpus_jobs.sync_now(SessionLocal, harbour.id, gateway=gateway, sleep=lambda s: None, clock=lambda: next(clock))
    assert _state(db, harbour).xref_status == "waiting" and openaleph.xref_requests == []

    openaleph.finish_indexing()
    corpus_jobs.sync_now(SessionLocal, harbour.id, gateway=gateway, sleep=lambda s: None, clock=lambda: 0.0)
    assert openaleph.xref_requests == ["1"] and _state(db, harbour).xref_status == "succeeded"

    state = _state(db, harbour)
    state.xref_status = "running"  # asked for, not yet collected
    db.commit()
    openaleph.xref_rows["1"] = [_row(ours_served, theirs_served)]
    corpus_jobs.sync_now(SessionLocal, harbour.id, gateway=gateway, sleep=lambda s: None, clock=lambda: 0.0)
    assert openaleph.xref_requests == ["1"] and _state(db, harbour).xref_status == "succeeded"
    assert len(list_cross_references(db, harbour.id, scope=None)) == 1


def test_registered_cross_referencing_task_runs_its_phase(two, openaleph, monkeypatch):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    registered: dict[str, Any] = {}

    class FakeApp:
        def task(self, *, name: str, queue: str, retry: bool):
            def wrap(func):
                registered[name] = func
                return func
            return wrap

    recording = RecordingQueue()
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), recording)
    corpus_jobs.register_tasks(FakeApp(), SessionLocal, engine, queue_name="workbench")
    registered[corpus_jobs.XREF_TASK](investigation_id=harbour.id, phase="start")
    assert recording.deferred[-1] == (_step(harbour, "collect"), False)
    assert openaleph.xref_requests == ["1"]


# --- the HTTP surface ------------------------------------------------------------------

def test_cross_reference_routes(two, monkeypatch):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), RecordingQueue())
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    proposal_id = db.scalars(select(CrossReferenceProposal.id)).one()

    listed = client.get(f"/api/investigations/{harbour.id}/cross-references")
    assert listed.status_code == 200 and [row["id"] for row in listed.json()] == [proposal_id]
    assert listed.json()[0]["match"]["schema"] == "Company"
    assert client.get(f"/api/investigations/{harbour.id}/cross-references", params={"status": "decided"}).json() == []
    assert client.get(f"/api/investigations/{harbour.id}/cross-references", params={"status": "sideways"}).status_code == 422
    assert client.get("/api/investigations/missing/cross-references").status_code == 404

    decided = client.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "same", "note": "Registry"})
    assert decided.status_code == 200, decided.text
    assert decided.json()["decision"]["decision"] == "same" and decided.json()["identity_finding_id"]
    assert len(client.get(f"/api/investigations/{harbour.id}/cross-references", params={"status": "all"}).json()) == 1
    assert client.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "maybe"}).status_code == 422
    assert client.post("/api/cross-references/missing/decision", json={"decision": "same"}).status_code == 404
    db.execute(CrossReferenceProposal.__table__.update().values(match_kind="duplicate"))
    db.commit()
    reply = client.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "same"})
    assert reply.status_code == 409 and "possible duplicate" in reply.json()["detail"]
    line = client.get(f"/api/investigations/{harbour.id}/corpus/sync").json()
    assert line["pending"]["judgements"] == 1 and line["cross_reference"]["status"] == "never"


def _scoped_client(scope: AuthorizationScope) -> TestClient:
    scoped = FastAPI()

    @scoped.middleware("http")
    async def as_scope(request, call_next):
        request.state.authorization_scope = scope
        return await call_next(request)

    @scoped.exception_handler(InvestigationAuthorizationError)
    async def denied(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    register_domain_routers(scoped)
    return TestClient(scoped)


def test_a_reporter_sees_and_decides_only_what_their_scope_allows(two):
    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    proposal_id = db.scalars(select(CrossReferenceProposal.id)).one()
    # Scoped to Harbour only: the match sits in Port authority's collection.
    harbour_only = _scoped_client(AuthorizationScope("reporter-1", frozenset({harbour.id}), role="reporter"))
    assert harbour_only.get(f"/api/investigations/{harbour.id}/cross-references").json() == []
    assert harbour_only.get(f"/api/investigations/{harbour.id}/corpus/sync").json()["cross_reference"]["open"] == 0
    assert harbour_only.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "same"}).status_code == 404
    # Scoped to Port only: Harbour's cross-reference is not theirs at all.
    port_only = _scoped_client(AuthorizationScope("reporter-2", frozenset({port.id}), role="reporter"))
    assert port_only.get(f"/api/investigations/{harbour.id}/cross-references").status_code == 404
    assert port_only.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "same"}).status_code == 404
    # A viewer of both may read but not decide.
    viewer = _scoped_client(AuthorizationScope("viewer-1", frozenset({harbour.id, port.id}), role="viewer",
                                               investigation_roles=((harbour.id, "viewer"), (port.id, "viewer"))))
    assert len(viewer.get(f"/api/investigations/{harbour.id}/cross-references").json()) == 1
    assert viewer.get(f"/api/investigations/{harbour.id}/corpus/sync").json()["cross_reference"]["open"] == 1
    assert viewer.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "same"}).status_code == 404
    # A reporter of both may.
    both = _scoped_client(AuthorizationScope("reporter-3", frozenset({harbour.id, port.id}), role="reporter"))
    assert both.post(f"/api/cross-references/{proposal_id}/decision", json={"decision": "unsure"}).status_code == 200
    assert [row.decision for row in db.scalars(select(CrossReferenceDecision))] == ["unsure"]


def test_cross_references_travel_with_a_backup(two, tmp_path):
    from app.services.exports import build_investigation_export, inspect_export, restore_investigation_export
    from app.services.lifecycle import delete_investigation

    db, harbour, port, ours, theirs, ours_served, theirs_served = two
    import_cross_references(db, harbour.id, [_row(ours_served, theirs_served)])
    proposal = db.scalars(select(CrossReferenceProposal)).one()
    decide_cross_reference(db, proposal, decision="same", note="Registry")
    harbour_id, ours_id = harbour.id, ours.id
    package, _manifest = build_investigation_export(db, harbour_id, include_documents=False)
    _manifest, records = inspect_export(package)
    assert len(records["cross_reference_proposals"]) == 1 and len(records["cross_reference_decisions"]) == 1
    assert "openaleph_entity_links" not in records  # where this deployment's OpenAleph holds them is not portable
    delete_investigation(db, harbour_id, tmp_path, confirmation=harbour_id)
    assert db.scalars(select(CrossReferenceProposal)).all() == []
    assert db.scalars(select(CrossReferenceDecision)).all() == []
    restore_investigation_export(db, package, tmp_path / "restored")
    db.expire_all()
    restored = db.scalars(select(CrossReferenceDecision)).one()
    assert (restored.decision, restored.note, restored.judgement) == ("same", "Registry", "positive")
    assert db.get(ResolutionDecision, restored.resolution_decision_id).decision == "positive"
    assert db.scalars(select(CrossReferenceProposal)).one().entity_id == ours_id
