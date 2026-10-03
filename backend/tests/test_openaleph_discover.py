"""What stands out in an investigation's corpus, from OpenAleph's discovery
(ADR-0006, Wave C; app/services/openaleph_discover.py). The fake reply has
the shape GET /api/2/collections/{id}/discover gave on the live 5.3.1 stack."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation, InvestigationCorpusBinding, Lead
from app.schemas.api import EntityCreate
from app.services import openaleph_http
from app.services.entities import create_entity
from app.services.openaleph_discover import lead_key

client = TestClient(app)


def _term(name: str, count: int) -> dict:
    return {"name": name, "count": count, "label": name.title()}


DISCOVERY = {
    "name": "fid-3",
    "peopleMentioned": [
        {"term": _term("alaric voss", 4), "peopleMentioned": [], "companiesMentioned": [_term("meridian holdings ltd", 3), _term("orrin ltd", 1)],
         "locationMentioned": [_term("limassol", 2)], "namesMentioned": [_term("alaric voss", 4)]},
    ],
    "companiesMentioned": [
        {"term": _term("meridian holdings ltd", 6), "peopleMentioned": [_term("alaric voss", 3)], "companiesMentioned": [],
         "locationMentioned": [], "namesMentioned": []},
    ],
    "locationMentioned": [],
    "namesMentioned": [],
}


@pytest.fixture()
def case(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    asked: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.path)
        return httpx.Response(200, json=DISCOVERY)

    monkeypatch.setattr(openaleph_http, "transport", httpx.MockTransport(handler))
    with SessionLocal() as db:
        inv = Investigation(name="Harbour contracts")
        db.add(inv)
        db.commit()
        db.add(InvestigationCorpusBinding(investigation_id=inv.id, provider="openaleph", collection_id="3", foreign_id="fid-3",
                                          collection_label="Harbour contracts", status="active"))
        db.commit()
        meridian = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Company", caption="Meridian Holdings Ltd", properties={}))
        yield db, inv.id, meridian.id, asked


def test_the_names_that_stand_out_are_marked_when_already_known(case):
    db, inv, meridian, asked = case
    body = client.get(f"/api/investigations/{inv}/corpus/insights").json()
    assert asked == ["/api/2/collections/3/discover"]
    assert body["state"] == "ok" and body["collection_id"] == "3"
    assert [g["label"] for g in body["groups"]] == ["People", "Companies"]   # empty groups are left out
    voss = body["groups"][0]["terms"][0]
    assert (voss["name"], voss["documents"], voss["record_id"], voss["lead_id"]) == ("Alaric Voss", 4, None, None)
    # Alongside: the other names in its documents, most first, never itself.
    assert [(a["kind"], a["name"], a["documents"]) for a in voss["alongside"]] == [
        ("companies", "Meridian Holdings Ltd", 3), ("places", "Limassol", 2), ("companies", "Orrin Ltd", 1)]
    assert body["groups"][1]["terms"][0]["record_id"] == meridian      # already a record here

    # A lead made from a name is recognised the next time.
    made = client.post("/api/leads", json={"investigation_id": inv, "title": "Alaric Voss", "provider": "openaleph",
                                           "provider_record_id": voss["lead_key"]})
    assert made.status_code == 200, made.text
    again = client.get(f"/api/investigations/{inv}/corpus/insights").json()
    assert again["groups"][0]["terms"][0]["lead_id"] == made.json()["id"]
    assert voss["lead_key"] == lead_key("people", "alaric voss") == "discover:people:alaric voss"


def test_no_collection_off_or_down_are_states(case, monkeypatch):
    db, inv, _meridian, _asked = case
    other = Investigation(name="Nothing sent yet")
    db.add(other)
    db.commit()
    assert client.get(f"/api/investigations/{other.id}/corpus/insights").json()["state"] == "no_collection"
    monkeypatch.setattr(openaleph_http, "transport", httpx.MockTransport(lambda request: httpx.Response(502)))
    down = client.get(f"/api/investigations/{inv}/corpus/insights").json()
    assert (down["state"], down["groups"]) == ("unavailable", [])
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert client.get(f"/api/investigations/{inv}/corpus/insights").json()["state"] == "disabled"
    assert client.get("/api/investigations/nope/corpus/insights").status_code == 404
    assert db.query(Lead).count() == 0
