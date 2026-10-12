"""The run record (ADR-0012, mockup AI_1): every step of an AI run appended as it happens, readable by poll or
stream, with the model's claims marked self-reported until the app's check confirms them."""

import json

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.core.config import settings
from app.main import app
from tests.test_reasoning_endpoints import (
    _FakeLLMClient,
    _seeded_investigation,
    _valid_case_synthesis,
    requires_suite,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    original = (settings.enable_ai_features, settings.ai_provider)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


@requires_suite
def test_a_run_records_each_step_in_order_and_the_review_is_appended(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation(client)
    inv = seeded["investigation"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis(seeded["evidence"]["id"])))
    reply = ok(client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={
        "question": "What did Ada North sign?", "options": {"devils_advocate": "ON"}}))
    run_id = reply["job"]["id"]

    body = ok(client.get(f"/api/investigations/{inv}/ai-runs/{run_id}/events"))
    events = body["events"]
    assert [e["n"] for e in events] == list(range(1, len(events) + 1))
    kinds = [(e["kind"], e["node"]) for e in events]
    assert kinds[0] == ("TURN", "run") and kinds[-1] == ("TURN", "run")
    order = [k for k in kinds if k[0] in ("ROUTE", "LOAD") or k[1] in ("retrieval", "model", "gate:schema", "candidate")]
    assert order[:6] == [("ROUTE", "router"), ("LOAD", "tas/08"), ("CHECK", "retrieval"), ("CHECK", "model"), ("CHECK", "model"), ("CHECK", "gate:schema")]
    settings_events = [e for e in events if e["kind"] == "SETTING"]
    assert any(e["text"] == "devils_advocate = on (default off)" for e in settings_events)
    said = [e for e in events if e["node"] == "tas/class"]
    assert said and all(e["self_reported"] for e in said), "what the model says is self-reported"
    confirmed = [e for e in events if e["node"] == "gate:citation" and e["parent"] == said[0]["n"]]
    assert confirmed and confirmed[0]["status"] == "good" and confirmed[0]["self_reported"] is False
    write = next(e for e in events if e["kind"] == "WRITE")
    assert write["refs"][0]["record_id"] == reply["candidate_id"] and write["status"] == "good"
    assert body["run"]["candidate_id"] == reply["candidate_id"] and body["run"]["finished"] is True

    later = ok(client.get(f"/api/investigations/{inv}/ai-runs/{run_id}/events", params={"after": events[-1]["n"]}))["events"]
    assert later == []
    ok(client.post(f"/api/ai-analysis-candidates/{reply['candidate_id']}/review", json={"decision": "accept", "note": "Checked"}))
    review = ok(client.get(f"/api/investigations/{inv}/ai-runs/{run_id}/events", params={"after": events[-1]["n"]}))["events"]
    assert [(e["node"], e["verdict"], e["text"]) for e in review] == [("review", "ACCEPTED", "You accepted the answer: Checked")]

    runs = ok(client.get(f"/api/investigations/{inv}/ai-runs"))["runs"]
    assert runs[0]["run_id"] == run_id and runs[0]["events"] == len(events) + 1 and runs[0]["question"] == "What did Ada North sign?"

    with client.stream("GET", f"/api/investigations/{inv}/ai-runs/{run_id}/events/stream", headers={"Last-Event-ID": str(len(events))}) as stream:
        text = "".join(stream.iter_text())
    assert text.count("event: step") == 1 and f"id: {len(events) + 1}" in text and text.rstrip().endswith("data: {}")
    data = json.loads(text.split("data: ", 1)[1].split("\n", 1)[0])
    assert data["node"] == "review"

    other = ok(client.post("/api/investigations", json={"name": "Other"}))["id"]
    assert client.get(f"/api/investigations/{other}/ai-runs/{run_id}/events").status_code == 404


@requires_suite
def test_a_run_stopped_by_the_citation_check_ends_with_a_stopped_turn(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation(client)
    inv = seeded["investigation"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis("NOT-A-REAL-ID")))
    assert client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "What did Ada North sign?"}).status_code == 422
    run = ok(client.get(f"/api/investigations/{inv}/ai-runs"))["runs"][0]
    events = ok(client.get(f"/api/investigations/{inv}/ai-runs/{run['run_id']}/events"))["events"]
    gate = next(e for e in events if e["node"] == "gate:citation" and e["kind"] == "CHECK" and e["parent"] and e["verdict"] == "FAIL")
    assert gate["status"] == "bad"
    assert any(e["kind"] == "BLOCK" for e in events)
    assert events[-1]["kind"] == "TURN" and events[-1]["status"] == "bad" and events[-1]["verdict"] == "STOPPED"
    assert run["problems"] >= 2
