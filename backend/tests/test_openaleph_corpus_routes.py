"""The corpus copy's HTTP surface (ADR-0006, Wave B): the "Corpus sync" line
and "Sync now", in developer mode (no worker: it runs in the request) and with
a worker (queued), plus who may ask for it."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.core.authorization import AuthorizationScope, InvestigationAuthorizationError
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs import corpus as corpus_jobs
from app.main import app, register_domain_routers
from app.models.domain import Investigation
from app.schemas.api import EntityCreate
from app.services.entities import create_entity
from tests.openaleph_fake import BASE_URL, FakeOpenAleph
from tests.test_openaleph_corpus_push import RecordingQueue

client = TestClient(app)


@pytest.fixture()
def openaleph(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    fake = FakeOpenAleph()
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    return fake


def _investigation(**extra) -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Harbour contracts", **extra)
        db.add(inv); db.commit()
        create_entity(db, EntityCreate(investigation_id=inv.id, schema="Person", caption="Jane Doe"))
        return inv.id


def test_the_sync_line_before_and_after_sync_now_in_developer_mode(openaleph):
    inv = _investigation()
    line = client.get(f"/api/investigations/{inv}/corpus/sync").json()
    assert line == {
        "investigation_id": inv, "enabled": True, "background": False, "collection_id": None, "collection_label": None,
        "pushed_records": 0, "pending": {"to_send": 1, "to_remove": 0, "cannot_send": []},
        "push": {"status": "never", "started_at": None, "finished_at": None, "message": None, "error": None,
                 "sent": 0, "removed": 0, "unchanged": 0, "removals_waiting": 0},
        "consecutive_failures": 0, "failures": [],
    }
    reply = client.post(f"/api/investigations/{inv}/corpus/sync")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert (body["queued"], body["ran"]) == (False, True)
    assert body["sync"]["pushed_records"] == 1 and body["sync"]["pending"]["to_send"] == 0
    assert body["sync"]["push"]["status"] == "succeeded" and body["sync"]["push"]["message"] == "Sent 1 record(s)"
    assert body["sync"]["collection_id"] == "1" and body["sync"]["collection_label"] == "Harbour contracts"


def test_a_failed_sync_now_is_shown_on_the_line(openaleph):
    inv = _investigation()
    openaleph.fail[("POST", "/api/2/collections")] = 503
    body = client.post(f"/api/investigations/{inv}/corpus/sync").json()
    assert body["sync"]["push"]["status"] == "failed" and "503" in body["sync"]["push"]["error"]
    assert body["sync"]["consecutive_failures"] == 1
    assert body["sync"]["failures"][0]["operation"] == "corpus_push"


def test_sync_now_with_a_worker_is_queued(openaleph, monkeypatch):
    recording = RecordingQueue()
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), recording)
    inv = _investigation()
    recording.deferred.clear()
    body = client.post(f"/api/investigations/{inv}/corpus/sync").json()
    assert (body["queued"], body["ran"], body["sync"]["background"]) == (True, False, True)
    assert recording.deferred == [(corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 0, {"investigation_id": inv}), True)]
    assert openaleph.calls == []


def test_sync_now_refusals(openaleph, monkeypatch):
    assert client.get("/api/investigations/missing/corpus/sync").status_code == 404
    assert client.post("/api/investigations/missing/corpus/sync").status_code == 404
    demo = _investigation(is_demo=True)
    assert client.post(f"/api/investigations/{demo}/corpus/sync").status_code == 409
    assert client.get(f"/api/investigations/{demo}/corpus/sync").json()["enabled"] is False
    inv = _investigation()
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    reply = client.post(f"/api/investigations/{inv}/corpus/sync")
    assert reply.status_code == 409 and "disabled" in reply.json()["detail"]


def test_a_viewer_cannot_ask_for_a_push(openaleph):
    inv = _investigation()
    viewer_app = FastAPI()

    @viewer_app.middleware("http")
    async def as_viewer(request, call_next):
        request.state.authorization_scope = AuthorizationScope(
            "viewer-1", frozenset({inv}), role="viewer", investigation_roles=((inv, "viewer"),))
        return await call_next(request)

    @viewer_app.exception_handler(InvestigationAuthorizationError)
    async def denied(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    register_domain_routers(viewer_app)
    viewer = TestClient(viewer_app)
    assert viewer.get(f"/api/investigations/{inv}/corpus/sync").status_code == 200
    assert viewer.post(f"/api/investigations/{inv}/corpus/sync").status_code == 404
    assert openaleph.calls == []
