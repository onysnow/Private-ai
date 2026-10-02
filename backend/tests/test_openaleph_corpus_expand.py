""""Expand in the corpus" (ADR-0006, Wave B, item 3): what OpenAleph holds
around a confirmed entity becomes OpenAleph connector findings, and its
relationships go through the existing external-relationship review.

OpenAleph is faked at its HTTP surface (tests/openaleph_corpus_fake.py); the
expand rows have the shape GET /api/2/entities/{id}/expand answers.
"""

from __future__ import annotations

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
from app.db.session import SessionLocal
from app.jobs import corpus as corpus_jobs
from app.main import app, register_domain_routers
from app.models.domain import (
    ConnectorFinding, ConnectorRun, Entity, Investigation, Lead, OpenAlephOperationFailure, RelationshipEdge, ResolutionDecision,
)
from app.schemas import responses as r
from app.schemas.api import EntityCreate
from app.services.corpus_expand import NotInCorpus, expand_in_corpus, openaleph_identities
from app.services.corpus_push import push_confirmed_records
from app.services.external_relationships import create_review, promote_review, relationship_endpoint_candidates
from app.services.entities import create_entity
from tests.openaleph_corpus_fake import BASE_URL, FakeOpenAleph
from tests.test_openaleph_corpus_push import _merge
from tests.test_response_models import _same_through_model

client = TestClient(app)


@pytest.fixture()
def openaleph(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_ui_url", "http://openaleph-ui.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    fake = FakeOpenAleph(auto_index=True)
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    return fake


def _entity(db, inv: Investigation, schema: str, caption: str, **props: list[str]) -> Entity:
    return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=dict(props)))


def _served(entity_id: str, schema: str, label: str = "Port authority", **props: Any) -> dict[str, Any]:
    """An entity as OpenAleph serializes it in an expand reply."""
    name = (props.get("name") or [None])[0]
    return {"id": entity_id, "schema": schema, "caption": name or schema, "properties": props,
            "collection": {"id": "2", "collection_id": "2", "label": label}}


@pytest.fixture()
def harbour(openaleph):
    """Meridian and Jane, sent to OpenAleph; OpenAleph holds, in another
    collection, a director of Meridian, and an owner of the copy of Meridian
    a reporter decided is the same company."""
    with SessionLocal() as db:
        inv = Investigation(name="Harbour contracts")
        db.add(inv); db.commit(); db.refresh(inv)
        meridian = _entity(db, inv, "Company", "Meridian Holdings Ltd", jurisdiction=["gb"])
        jane = _entity(db, inv, "Person", "Jane Doe")
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        ns = Namespace("fake-ns-1")
        ours, jane_id = ns.sign(meridian.id), ns.sign(jane.id)
        openaleph.add_collection("2", "fake-ns-2", "Port authority")
        theirs = _served("theirs.sig", "Company", name=["Meridian Holdings Limited"])
        openaleph.index["2"]["theirs.sig"] = theirs
        identity = ConnectorFinding(investigation_id=inv.id, provider="openaleph", provider_record_id="theirs.sig",
                                    caption="Meridian Holdings Limited", schema="Company", properties={}, review_status="accepted")
        db.add(identity); db.flush()
        db.add(ResolutionDecision(investigation_id=inv.id, finding_id=identity.id, entity_id=meridian.id, decision="positive", confidence=0.97))
        db.commit()
        bob = _served("bob.sig", "Person", name=["Bob Smith"], nationality=["gb"])
        holdco = _served("holdco.sig", "Company", name=["Holdco Ltd"])
        directorship = _served("dir.sig", "Directorship", director=[bob], organization=[{"id": ours, "schema": "Company"}],
                               role=["director"])
        ownership = _served("own.sig", "Ownership", owner=["holdco.sig"], asset=["theirs.sig"], percentage=["60"])
        openaleph.expand_rows[ours] = [
            {"property": "directorshipOrganization", "count": 2, "entities": [directorship, bob]},
            {"property": "unknownLinkSubject", "count": 1, "entities": [_served(jane_id, "Person", name=["Jane Doe"]), "junk"]},
        ]
        openaleph.expand_rows["theirs.sig"] = [{"property": "ownershipAsset", "count": 2, "entities": [ownership, holdco, {"no": "id"}]}]
        yield db, inv, meridian, jane, ours, identity


def test_expanding_proposes_relationships_and_neighbours_for_review(harbour, openaleph):
    db, inv, meridian, jane, ours, identity = harbour
    assert openaleph_identities(db, meridian) == [ours, "theirs.sig"]
    result = expand_in_corpus(db, meridian, gateway=openaleph.gateway())
    assert (result["identities"], result["relationships"], result["neighbours"], result["skipped_own"]) == (
        [ours, "theirs.sig"], 2, 2, 1)
    by_record = {row["provider_record_id"]: row for row in result["findings"]}
    assert {key: row["kind"] for key, row in by_record.items()} == {
        "bob.sig": "entity", "holdco.sig": "entity", "dir.sig": "relationship", "own.sig": "relationship"}
    assert by_record["bob.sig"]["caption"] == "Bob Smith" and by_record["bob.sig"]["collection_label"] == "Port authority"
    assert by_record["dir.sig"]["source_url"] == "http://openaleph-ui.test/entities/dir.sig"
    run = db.get(ConnectorRun, result["run_id"])
    assert (run.provider, run.status, run.result_count, run.query) == ("openaleph", "completed", 4, "expand: Meridian Holdings Ltd")
    directorship = db.get(ConnectorFinding, by_record["dir.sig"]["id"])
    # Nested references are kept as the ids they stand for.
    assert directorship.properties == {"director": ["bob.sig"], "organization": [ours], "role": ["director"]}
    assert directorship.raw["expanded_from"] == ours and directorship.raw["property"] == "directorshipOrganization"
    # Each new finding is a lead, as for any connector (connectors.persist_connector_findings).
    assert {lead.provider_record_id for lead in db.scalars(select(Lead).where(Lead.provider == "openaleph"))} == set(by_record)
    _same_through_model(r.CorpusExpandOut, result)  # the reply loses nothing through its model

    # Asked again, the same findings come back; nothing is proposed twice.
    again = expand_in_corpus(db, meridian, gateway=openaleph.gateway())
    assert sorted(row["id"] for row in again["findings"]) == sorted(row["id"] for row in result["findings"])


def test_the_relationship_review_knows_the_end_that_is_ours(harbour, openaleph):
    db, inv, meridian, jane, ours, identity = harbour
    result = expand_in_corpus(db, meridian, gateway=openaleph.gateway())
    by_record = {row["provider_record_id"]: row["id"] for row in result["findings"]}
    # The directorship points at our own record as sent to OpenAleph.
    directorship = db.get(ConnectorFinding, by_record["dir.sig"])
    candidates = relationship_endpoint_candidates(db, directorship)
    assert candidates["target_candidates"][0] == {"entity_id": meridian.id, "caption": "Meridian Holdings Ltd", "schema": "Company", "score": 1.0}
    assert candidates["source_external_finding"]["provider_record_id"] == "bob.sig"
    # The ownership points at the OpenAleph entity a reporter decided is Meridian.
    ownership = db.get(ConnectorFinding, by_record["own.sig"])
    candidates = relationship_endpoint_candidates(db, ownership)
    assert candidates["target_candidates"][0]["entity_id"] == meridian.id and candidates["target_candidates"][0]["score"] == 1.0
    assert candidates["target_external_finding"]["id"] == identity.id
    assert [row["entity_id"] for row in candidates["target_candidates"]].count(meridian.id) == 1

    # A reporter confirms the director, supports the relationship, and it becomes one.
    bob = _entity(db, inv, "Person", "Bob Smith")
    review = create_review(db, directorship, bob.id, meridian.id, "supported", "Registry filing")
    promote_review(db, review)
    edge = db.scalars(select(RelationshipEdge).where(RelationshipEdge.investigation_id == inv.id)).one()
    assert (edge.schema, edge.source_entity_id, edge.target_entity_id) == ("Directorship", bob.id, meridian.id)

    # Once the decision on the identity turns negative, it no longer stands for Meridian.
    db.add(ResolutionDecision(investigation_id=inv.id, finding_id=identity.id, entity_id=meridian.id, decision="negative", confidence=1.0))
    db.commit()
    assert all(row["score"] < 1.0 or row["entity_id"] != meridian.id
               for row in relationship_endpoint_candidates(db, ownership)["target_candidates"])
    assert openaleph_identities(db, meridian) == [ours]


def test_other_providers_keep_the_name_comparison(harbour):
    db, inv, meridian, jane, ours, identity = harbour
    finding = ConnectorFinding(investigation_id=inv.id, provider="opensanctions", provider_record_id="os-own", caption="Ownership",
                               schema="Ownership", properties={"owner": ["os-holdco"], "asset": [ours]})
    db.add(finding); db.commit()
    assert relationship_endpoint_candidates(db, finding)["target_candidates"] == []


def test_what_cannot_be_expanded(harbour, openaleph):
    db, inv, meridian, jane, ours, identity = harbour
    stray = _entity(db, inv, "Person", "Not sent yet")
    with pytest.raises(NotInCorpus):
        expand_in_corpus(db, stray, gateway=openaleph.gateway())
    _merge(db, db.get(Entity, stray.id), db.get(Entity, jane.id))
    with pytest.raises(ValueError, match="merged"):
        expand_in_corpus(db, db.get(Entity, stray.id), gateway=openaleph.gateway())

    openaleph.fail[("GET", f"/api/2/entities/{ours}/expand")] = 503
    with pytest.raises(httpx.HTTPStatusError):
        expand_in_corpus(db, meridian, gateway=openaleph.gateway())
    run = db.scalars(select(ConnectorRun).where(ConnectorRun.provider == "openaleph")).one()
    assert run.status == "failed" and "503" in run.error and run.finished_at is not None
    assert db.scalars(select(OpenAlephOperationFailure)).one().operation == "corpus_expand"
    assert db.scalars(select(ConnectorFinding).where(ConnectorFinding.provider_record_id == "bob.sig")).all() == []


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


def test_the_expand_route(harbour, openaleph, monkeypatch):
    db, inv, meridian, jane, ours, identity = harbour
    reply = client.post(f"/api/entities/{meridian.id}/corpus/expand")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["relationships"] == 2 and {row["schema"] for row in body["findings"]} == {"Person", "Company", "Directorship", "Ownership"}
    assert client.post("/api/entities/missing/corpus/expand").status_code == 404
    stray = _entity(db, inv, "Person", "Not sent yet")
    reply = client.post(f"/api/entities/{stray.id}/corpus/expand")
    assert reply.status_code == 409 and "not in OpenAleph yet" in reply.json()["detail"]
    openaleph.fail[("GET", f"/api/2/entities/{ours}/expand")] = 404
    assert "does not hold this entity yet" in client.post(f"/api/entities/{meridian.id}/corpus/expand").json()["detail"]
    openaleph.fail[("GET", f"/api/2/entities/{ours}/expand")] = 502
    assert client.post(f"/api/entities/{meridian.id}/corpus/expand").status_code == 502

    viewer = _scoped_client(AuthorizationScope("viewer-1", frozenset({inv.id}), role="viewer", investigation_roles=((inv.id, "viewer"),)))
    assert viewer.post(f"/api/entities/{meridian.id}/corpus/expand").status_code == 404

    demo = Investigation(name="Demo", is_demo=True)
    db.add(demo); db.commit()
    sample = _entity(db, demo, "Person", "Sample Person")
    assert client.post(f"/api/entities/{sample.id}/corpus/expand").status_code == 409
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    reply = client.post(f"/api/entities/{meridian.id}/corpus/expand")
    assert reply.status_code == 409 and "disabled" in reply.json()["detail"]


def test_how_expanded_entities_are_read():
    from app.services.corpus_expand import _caption, _properties

    entity = {"id": "x", "schema": "Payment", "properties": {"payer": [{"id": "p.sig"}, {"no": "id"}, None, 12], "summary": "Wire",
                                                            "notes": []}}
    properties = _properties(entity)
    assert properties == {"payer": ["p.sig", "12"], "summary": ["Wire"]}
    assert _caption(entity, properties) == "Wire"
    assert _caption({"id": "y", "schema": "Payment"}, {}) == "Payment" and _caption({"id": "z"}, {}) == "z"
    assert _properties({"id": "w", "properties": "garbled"}) == {}
