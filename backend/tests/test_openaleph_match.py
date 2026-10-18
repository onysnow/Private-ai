"""OpenAleph's /match beside a name awaiting review (ADR-0006;
app/services/openaleph_match.py). OpenAleph is faked at its HTTP surface;
the reply has the shape POST /api/2/match gave on the live 5.3.1 stack:
entities with a nested collection and an Elasticsearch relevance score."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.authorization import AuthorizationScope
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import (
    ExtractionCandidate, Investigation, InvestigationCorpusBinding, OpenAlephEntityLink,
)
from app.schemas.api import EntityCreate
from app.services import openaleph_http
from app.services.entities import create_entity
from app.services.openaleph_match import openaleph_matches
from tests.document_helpers import ingest_document

client = TestClient(app)


def _hit(entity_id: str, caption: str, collection_id: str, label: str, score: float, schema: str = "Company") -> dict[str, Any]:
    return {"id": entity_id, "schema": schema, "caption": caption, "score": score, "properties": {"name": [caption]},
            "collection": {"id": collection_id, "collection_id": collection_id, "label": label}}


@pytest.fixture()
def case(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    asked: list[dict[str, Any]] = []
    hits: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST" and request.url.path == "/api/2/match"
        asked.append({"body": json.loads(request.content), "limit": request.url.params.get("limit")})
        return httpx.Response(200, json={"status": "ok", "total": len(hits), "results": hits})

    monkeypatch.setattr(openaleph_http, "transport", httpx.MockTransport(handler))
    with SessionLocal() as db:
        harbour = Investigation(name="Harbour contracts")
        port = Investigation(name="Port authority")
        db.add_all([harbour, port])
        db.commit()
        db.add_all([
            InvestigationCorpusBinding(investigation_id=harbour.id, provider="openaleph", collection_id="3", foreign_id="f3",
                                       collection_label="Harbour contracts", status="active"),
            InvestigationCorpusBinding(investigation_id=port.id, provider="openaleph", collection_id="7", foreign_id="f7",
                                       collection_label="Port authority", status="active"),
        ])
        meridian = create_entity(db, EntityCreate(investigation_id=harbour.id, schema="Company", caption="Meridian Holdings Ltd", properties={}))
        db.add(OpenAlephEntityLink(investigation_id=harbour.id, record_type="entity", record_id=meridian.id, collection_id="3",
                                   openaleph_entity_id="ours.sig", content_hash="x"))
        db.commit()
        doc = ingest_document(db, investigation_id=harbour.id, title="Filing", filename="filing.txt", mime_type="text/plain",
                              data=b"Meridian Holdings Ltd paid the consultant.", storage_dir=tmp_path)
        candidate = db.query(ExtractionCandidate).filter_by(document_id=doc.id, candidate_type="entity").first()
        assert candidate is not None
        hits.extend([
            _hit("ours.sig", "Meridian Holdings Ltd", "3", "Harbour contracts", 14.2),
            _hit("theirs.sig", "Meridian Holdings Limited", "7", "Port authority", 11.0),
            _hit("public.sig", "MERIDIAN HOLDINGS LTD", "50", "UK companies register", 9.5),
        ])
        yield db, harbour, port, meridian, candidate, asked, hits


def test_matches_name_the_workbench_record_they_came_from(case):
    db, harbour, _port, meridian, candidate, asked, _hits = case
    found = openaleph_matches(db, candidate, scope=None)
    assert found["state"] == "ok" and found["hidden"] == 0
    assert asked[0]["body"]["properties"]["name"] == [candidate.payload["caption"]]
    assert asked[0]["limit"] == "10"
    ours, theirs, public = found["results"]
    assert (ours["in_this_investigation"], ours["workbench_entity_id"]) == (True, meridian.id)
    assert (theirs["investigation_id"], theirs["in_this_investigation"], theirs["workbench_entity_id"]) == (
        _port.id, False, None)
    assert (public["collection_label"], public["investigation_id"]) == ("UK companies register", None)
    assert [row["score"] for row in found["results"]] == [14.2, 11.0, 9.5]   # OpenAleph's order, its own scores


def test_a_match_in_an_investigation_the_reader_may_not_see_is_hidden(case):
    db, harbour, _port, _meridian, candidate, _asked, _hits = case
    found = openaleph_matches(db, candidate, scope=AuthorizationScope("reporter-1", frozenset({harbour.id}), role="reporter"))
    assert [row["openaleph_id"] for row in found["results"]] == ["ours.sig", "public.sig"]
    assert found["hidden"] == 1


def test_a_name_with_no_type_is_matched_as_a_legal_entity(case):
    db, _harbour, _port, _meridian, candidate, asked, _hits = case
    candidate.payload = {**candidate.payload, "suggested_schema": "Thing"}
    db.commit()
    assert openaleph_matches(db, candidate, scope=None)["schema"] == "LegalEntity"
    assert asked[-1]["body"]["schema"] == "LegalEntity"   # Thing is not matchable in FollowTheMoney


def test_openaleph_off_or_down_is_a_state_not_an_error(case, monkeypatch):
    db, _harbour, _port, _meridian, candidate, _asked, _hits = case
    monkeypatch.setattr(openaleph_http, "transport", httpx.MockTransport(lambda request: httpx.Response(503)))
    down = openaleph_matches(db, candidate, scope=None)
    assert (down["state"], down["results"]) == ("unavailable", [])
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert openaleph_matches(db, candidate, scope=None)["state"] == "disabled"


def test_the_route_answers_with_the_matches(case):
    _db, _harbour, _port, meridian, candidate, _asked, _hits = case
    reply = client.get(f"/api/extraction-candidates/{candidate.id}/openaleph-matches")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["schema"] and body["results"][0]["schema"] == "Company"
    assert body["results"][0]["workbench_entity_id"] == meridian.id
    assert client.get("/api/extraction-candidates/nope/openaleph-matches").status_code == 404
