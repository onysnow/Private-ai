"""Diagrams, timelines and lists in OpenAleph (ADR-0006, Wave C;
app/services/openaleph_entitysets.py): made from the records the corpus copy
holds, without writing anything new to the collection, and updated in place
when sent again. OpenAleph is faked at its HTTP surface
(tests/openaleph_corpus_fake.py)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from followthemoney.namespace import Namespace

from app.core.config import settings
from app.db.session import SessionLocal
from app.jobs import corpus as corpus_jobs
from app.main import app
from app.models.domain import Investigation, OpenAlephOperationFailure
from app.schemas.api import EntityCreate
from app.services.corpus_push import push_confirmed_records
from app.services.entities import create_entity
from app.services.openaleph_entitysets import diagram_layout
from app.services.relationships import create_relationship
from tests.openaleph_corpus_fake import BASE_URL, FakeOpenAleph

client = TestClient(app)
NS = Namespace("fake-ns-1")


@pytest.fixture()
def openaleph(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_ui_url", "http://openaleph-ui.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    fake = FakeOpenAleph(auto_index=True)
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    return fake


def _entity(db, inv: Investigation, schema: str, caption: str, **props: list[str]):
    return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=dict(props)))


@pytest.fixture()
def harbour(openaleph):
    """Meridian pays Bellcastle on a date; Jane directs Meridian, undated; all sent to OpenAleph."""
    with SessionLocal() as db:
        inv = Investigation(name="Harbour contracts")
        db.add(inv); db.commit(); db.refresh(inv)
        meridian = _entity(db, inv, "Company", "Meridian Holdings Ltd", incorporationDate=["2011-05-02"])
        bellcastle = _entity(db, inv, "Company", "Bellcastle Trading Group")
        jane = _entity(db, inv, "Person", "Jane Doe")
        paid = create_relationship(db, investigation_id=inv.id, schema="Payment", source_entity_id=meridian.id,
                                   target_entity_id=bellcastle.id, properties={"amount": ["2400000"], "date": ["2024-03-03"]})
        directs = create_relationship(db, investigation_id=inv.id, schema="Directorship", source_entity_id=jane.id, target_entity_id=meridian.id)
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        return {"inv": inv.id, "meridian": meridian.id, "bellcastle": bellcastle.id, "jane": jane.id,
                "paid": paid.relationship_entity_id, "directs": directs.relationship_entity_id}


def _send(inv: str, **body):
    return client.post(f"/api/investigations/{inv}/corpus/entity-sets", json=body)


def test_the_relationship_graph_becomes_a_diagram_in_the_editors_format(openaleph, harbour):
    reply = _send(harbour["inv"], kind="diagram")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert (body["added"], body["removed"], body["waiting_for_sync"]) == (5, 0, 0)
    made = body["entityset"]
    assert made["label"] == "Harbour contracts: relationships" and made["items"] == 5
    assert made["url"] == f"http://openaleph-ui.test/diagrams/{made['openaleph_entityset_id']}"
    stored = openaleph.entitysets[made["openaleph_entityset_id"]]
    assert stored["type"] == "diagram" and stored["collection_id"] == "1"
    assert set(stored["items"]) == {NS.sign(harbour[k]) for k in ("meridian", "bellcastle", "jane", "paid", "directs")}
    assert not openaleph.bulk_batches[1:]          # nothing new written to the collection
    layout = stored["layout"]
    vertices = {v["entityId"]: v for v in layout["vertices"]}
    assert set(vertices) == {NS.sign(harbour[k]) for k in ("meridian", "bellcastle", "jane")}
    meridian = vertices[NS.sign(harbour["meridian"])]
    assert meridian["id"] == f"entity:{NS.sign(harbour['meridian'])}" and meridian["label"] == "Meridian Holdings Ltd"
    assert meridian["type"] == "entity" and meridian["fixed"] is True and isinstance(meridian["position"]["x"], int)
    assert len({(v["position"]["x"], v["position"]["y"]) for v in vertices.values()}) == 3   # not piled on one spot
    paid = next(e for e in layout["edges"] if e["entityId"] == NS.sign(harbour["paid"]))
    src, tgt = f"entity:{NS.sign(harbour['meridian'])}", f"entity:{NS.sign(harbour['bellcastle'])}"
    assert paid == {"id": f"{NS.sign(harbour['paid'])}({src}, {tgt})", "type": "entity", "label": "paid",
                    "sourceId": src, "targetId": tgt, "entityId": NS.sign(harbour["paid"]), "directed": True}

    # A reporter moves Jane in OpenAleph; sending again keeps her place and adds nothing.
    for vertex in stored["layout"]["vertices"]:
        if vertex["entityId"] == NS.sign(harbour["jane"]):
            vertex["position"] = {"x": 40, "y": -12}
    again = _send(harbour["inv"], kind="diagram").json()
    assert again["entityset"]["openaleph_entityset_id"] == made["openaleph_entityset_id"]
    assert (again["added"], again["removed"]) == (0, 0) and len(openaleph.entitysets) == 1
    jane = next(v for v in openaleph.entitysets[made["openaleph_entityset_id"]]["layout"]["vertices"] if v["entityId"] == NS.sign(harbour["jane"]))
    assert jane["position"] == {"x": 40, "y": -12}
    assert [row["kind"] for row in client.get(f"/api/investigations/{harbour['inv']}/corpus/entity-sets").json()] == ["diagram"]


def test_the_dated_records_become_a_timeline(openaleph, harbour):
    body = _send(harbour["inv"], kind="timeline").json()
    stored = openaleph.entitysets[body["entityset"]["openaleph_entityset_id"]]
    assert stored["type"] == "timeline" and stored["layout"] == {"vertices": [], "edges": []}
    # The payment's date and Meridian's incorporation; Jane, Bellcastle and the undated directorship have none.
    assert set(stored["items"]) == {NS.sign(harbour["paid"]), NS.sign(harbour["meridian"])}


def test_a_list_is_the_chosen_entities_and_sending_it_again_takes_out_only_its_own(openaleph, harbour):
    first = _send(harbour["inv"], kind="list", label="People to call", entity_ids=[harbour["jane"], harbour["meridian"]]).json()
    set_id = first["entityset"]["openaleph_entityset_id"]
    assert set(openaleph.entitysets[set_id]["items"]) == {NS.sign(harbour["jane"]), NS.sign(harbour["meridian"])}
    openaleph.entitysets[set_id]["items"]["someone-else.sig"] = "positive"        # added by a reporter in OpenAleph
    openaleph.index["1"]["someone-else.sig"] = {"id": "someone-else.sig", "schema": "Person", "properties": {}}
    second = _send(harbour["inv"], kind="list", label="People  to call", entity_ids=[harbour["jane"], harbour["bellcastle"]]).json()
    assert second["entityset"]["openaleph_entityset_id"] == set_id and (second["added"], second["removed"]) == (1, 1)
    assert set(openaleph.entitysets[set_id]["items"]) == {NS.sign(harbour["jane"]), NS.sign(harbour["bellcastle"]), "someone-else.sig"}
    other = _send(harbour["inv"], kind="list", label="Companies", entity_ids=[harbour["bellcastle"]]).json()
    assert other["entityset"]["openaleph_entityset_id"] != set_id


def test_a_set_removed_in_openaleph_is_made_again(openaleph, harbour):
    first = _send(harbour["inv"], kind="timeline").json()["entityset"]["openaleph_entityset_id"]
    del openaleph.entitysets[first]
    again = _send(harbour["inv"], kind="timeline").json()
    assert again["entityset"]["openaleph_entityset_id"] != first and again["added"] == 2


def test_what_cannot_be_sent_is_refused_in_plain_words(openaleph, harbour):
    with SessionLocal() as db:
        inv = Investigation(name="Not yet sent")
        db.add(inv); db.commit()
        fresh = inv.id
        later = _entity(db, db.get(Investigation, harbour["inv"]), "Person", "Arnold Pike")
    refused = _send(fresh, kind="diagram")
    assert refused.status_code == 409 and refused.json()["detail"] == "Nothing of this investigation is in OpenAleph yet; sync it first"
    not_sent = _send(harbour["inv"], kind="list", entity_ids=[later.id])
    assert not_sent.status_code == 409 and not_sent.json()["detail"] == "Not in OpenAleph yet: Arnold Pike; sync the investigation first"
    assert _send(harbour["inv"], kind="list").json()["detail"] == "Choose the entities for the list"
    assert _send(harbour["inv"], kind="profile").status_code == 422
    # One record waits for the next sync; the diagram says so.
    assert _send(harbour["inv"], kind="diagram").json()["waiting_for_sync"] == 1

    openaleph.fail[("POST", "/api/2/entitysets")] = 500
    failed = _send(harbour["inv"], kind="timeline")
    assert failed.status_code == 502 and failed.json()["detail"] == "OpenAleph could not make the timeline: HTTPStatusError"
    with SessionLocal() as db:
        assert db.query(OpenAlephOperationFailure).filter_by(investigation_id=harbour["inv"], operation="entityset_timeline").count() == 1


def test_a_diagram_with_no_relationships_still_places_every_entity():
    layout = diagram_layout({}, [], {})
    assert layout == {"vertices": [], "edges": [], "groupings": [], "settings": {"pivotTypes": []}}
