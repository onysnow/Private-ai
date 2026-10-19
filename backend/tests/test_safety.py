"""Keep › Safety & data: the outbound log written where calls leave, per-service modes enforced there, the summary
with its period, the private answers and the backup record (app/services/outbound.py, app/services/safety.py)."""

import csv
import io
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry
from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import BackupEvent, OutboundRequest, SafetyAnswer, ServiceMode
from app.services import outbound
from app.services.exports import build_investigation_export, inspect_export
from app.services.lifecycle import delete_investigation

client = TestClient(app)


class _Searcher(Connector):
    """Searches by text; its enrich() is the base class's (a search built from the entity)."""
    configured = True

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def search(self, query: str) -> list[ExternalFinding]:
        self.sent.append(query)
        return [ExternalFinding(provider="safety-fake", record_id=f"r-{len(self.sent)}", caption=f"Result for {query}")]


class _Matcher(_Searcher):
    """Matches by example, as OpenSanctions does: its enrich() sends the entity itself."""
    async def enrich(self, entity: dict) -> list[ExternalFinding]:
        self.sent.append(json.dumps(entity.get("properties")))
        return []


@pytest.fixture()
def fakes():
    searcher, matcher = _Searcher(), _Matcher()
    registry.register("safety-fake", searcher)
    registry.register("safety-match", matcher)
    yield searcher, matcher
    registry._connectors.pop("safety-fake", None)
    registry._connectors.pop("safety-match", None)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _case(name: str = "Harbour land") -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def _set_mode(inv: str, service: str, mode: str) -> None:
    with SessionLocal() as db:
        db.add(ServiceMode(investigation_id=inv, service=service, mode=mode))
        db.commit()


def test_a_search_is_logged_word_for_word_before_it_leaves(fakes):
    searcher, _ = fakes
    inv = _case()
    ok(client.post("/api/connectors/safety-fake/search", json={"investigation_id": inv, "query": "14 Quay Street, Douglas"}))
    assert searcher.sent == ["14 Quay Street, Douglas"]
    log = ok(client.get(f"/api/investigations/{inv}/outbound-log"))
    assert log["total"] == 1
    row = log["items"][0]
    assert row["value_sent"] == "14 Quay Street, Douglas" and row["service"] == "safety-fake"
    assert row["value_kind"] == "search text" and row["reason"] == "lookup" and row["started_by"] == "person" and row["kind"] == "lookup"


def test_off_refuses_before_anything_is_sent_and_nothing_is_logged(fakes):
    searcher, _ = fakes
    inv = _case()
    _set_mode(inv, "safety-fake", "OFF")
    reply = client.post("/api/connectors/safety-fake/search", json={"investigation_id": inv, "query": "Kestrel SA"})
    assert reply.status_code == 409 and "Off for this case" in reply.json()["detail"]
    assert searcher.sent == []
    assert ok(client.get(f"/api/investigations/{inv}/outbound-log"))["total"] == 0


def test_enrichment_logs_what_each_connector_really_sends_and_respects_off(fakes):
    searcher, matcher = fakes
    inv = _case()
    entity = ok(client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Harbour Nominees Ltd",
                                                   "properties": {"name": ["Harbour Nominees Ltd"], "jurisdiction": ["im"]}}))
    ok(client.post(f"/api/entities/{entity['id']}/enrich/safety-fake"))
    ok(client.post(f"/api/entities/{entity['id']}/enrich/safety-match"))
    items = {i["service"]: i for i in ok(client.get(f"/api/investigations/{inv}/outbound-log"))["items"]}
    assert items["safety-fake"]["value_sent"] == searcher.sent[0]
    assert "Harbour Nominees Ltd" in items["safety-fake"]["value_sent"]
    assert json.loads(items["safety-match"]["value_sent"]) == {"schema": "Company", "properties": {"name": ["Harbour Nominees Ltd"], "jurisdiction": ["im"]}}
    assert items["safety-match"]["reason"] == "enrich Harbour Nominees Ltd"
    assert items["safety-match"]["value_kind"] == "company details" and items["safety-fake"]["value_kind"] == "company search"

    _set_mode(inv, "safety-match", "OFF")
    session = ok(client.post(f"/api/entities/{entity['id']}/enrich", json={"providers": ["safety-fake", "safety-match"]}))
    runs = {r["provider"]: r for r in session["runs"]}
    assert runs["safety-match"]["status"] == "failed" and "Off for this case" in runs["safety-match"]["error"]
    assert runs["safety-fake"]["status"] == "completed"
    assert len(matcher.sent) == 1, "the Off service was not called"
    assert client.post(f"/api/entities/{entity['id']}/enrich/safety-match").status_code == 409


def test_ask_first_lets_a_person_through_and_stops_an_automatic_check():
    with SessionLocal() as db:
        inv = _case()
        outbound.require_allowed(db, inv, "opensanctions", settings, started_by="person")
        with pytest.raises(outbound.ServiceRefused, match="Ask first"):
            outbound.require_allowed(db, inv, "opensanctions", settings, started_by="automatic")
        outbound.set_mode(db, inv, "opensanctions", "AUTOMATIC", settings)
        outbound.require_allowed(db, inv, "opensanctions", settings, started_by="automatic")


def test_modes_are_set_per_case_and_outside_ai_stays_off_when_the_server_forbids_it(monkeypatch):
    inv = _case()
    summary = ok(client.put(f"/api/investigations/{inv}/service-modes", json={"service": "opensanctions", "mode": "AUTOMATIC"}))
    modes = {s["service"]: s for s in summary["services"]}
    assert modes["opensanctions"]["mode"] == "AUTOMATIC" and modes["aleph"]["mode"] == outbound.DEFAULT_MODE
    assert ok(client.get(f"/api/investigations/{_case('Other')}/safety"))["services"][0]["mode"] == outbound.DEFAULT_MODE
    assert client.put(f"/api/investigations/{inv}/service-modes", json={"service": "nowhere", "mode": "OFF"}).status_code == 404
    monkeypatch.setattr(settings, "ai_allow_remote_endpoint", False)
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    assert modes["outside_ai"]["locked_reason"] == "Not allowed on this server" and modes["outside_ai"]["mode"] == "OFF"
    assert client.put(f"/api/investigations/{inv}/service-modes", json={"service": "outside_ai", "mode": "ASK"}).status_code == 409


def test_totals_state_zeroes_and_follow_the_period(fakes):
    inv = _case()
    empty = ok(client.get(f"/api/investigations/{inv}/safety"))
    assert empty["totals"] == {"requests": 0, "services_reached": 0, "documents_sent": 0, "ai_calls_outside": 0}
    assert all(not s["ever_used"] and s["sent_count"] == 0 for s in empty["services"])
    with SessionLocal() as db:
        old = utcnow_naive() - timedelta(days=10)
        db.add(OutboundRequest(investigation_id=inv, service="opensanctions", kind="lookup", value_sent="M. Ross", value_kind="person name",
                               reason="lookup", started_by="automatic", created_at=old))
        db.add(OutboundRequest(investigation_id=inv, service="outside_ai", kind="ai", value_sent="QUESTION", value_kind="question and case passages",
                               reason="AI run", started_by="person", documents_sent=3))
        db.add(OutboundRequest(investigation_id=inv, service="opensanctions", kind="lookup", value_sent="Kestrel SA", value_kind="company name",
                               reason="lookup", started_by="person"))
        db.commit()
    week = (utcnow_naive() - timedelta(days=7)).isoformat() + "Z"
    recent = ok(client.get(f"/api/investigations/{inv}/safety", params={"since": week}))
    assert recent["totals"] == {"requests": 2, "services_reached": 2, "documents_sent": 3, "ai_calls_outside": 1}
    everything = ok(client.get(f"/api/investigations/{inv}/safety"))
    assert everything["totals"]["requests"] == 3
    sanctions = next(s for s in everything["services"] if s["service"] == "opensanctions")
    assert sanctions["sent_count"] == 2 and sanctions["ever_used"]
    assert [k["value_kind"] for k in sanctions["sent_kinds"]] == ["company name", "person name"]
    assert sanctions["last"][0]["value_sent"] == "Kestrel SA"
    page = ok(client.get(f"/api/investigations/{inv}/outbound-log", params={"since": week, "service": "opensanctions"}))
    assert [i["value_sent"] for i in page["items"]] == ["Kestrel SA"]
    assert client.get(f"/api/investigations/{inv}/outbound-log", params={"service": "nowhere"}).status_code == 404
    exported = client.get(f"/api/investigations/{inv}/outbound-log/export")
    assert exported.status_code == 200 and exported.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(exported.text)))
    assert rows[0][0] == "time_utc" and [r[2] for r in rows[1:]] == ["M. Ross", "QUESTION", "Kestrel SA"]
    assert rows[1][5] == "automatic check"


def test_answers_are_kept_private_and_never_in_a_backup_while_the_log_is():
    inv = _case()
    summary = ok(client.put(f"/api/investigations/{inv}/safety/answers", json={"question": "threats", "answer": "NOT_SURE"}))
    threats = next(q for q in summary["questions"] if q["id"] == "threats")
    assert threats["answer"] == "NOT_SURE" and threats["answered_at"] and "SA-014" in threats["indicators"]
    with SessionLocal() as db:
        db.add(OutboundRequest(investigation_id=inv, service="aleph", kind="lookup", value_sent="Fernhill Ltd", value_kind="search text",
                               reason="lookup", started_by="person"))
        db.commit()
        _, records = inspect_export(build_investigation_export(db, inv, include_documents=False)[0])
    assert "safety_answers" not in records
    assert [r["value_sent"] for r in records["outbound_log"]] == ["Fernhill Ltd"]
    cleared = ok(client.put(f"/api/investigations/{inv}/safety/answers", json={"question": "threats", "answer": None}))
    assert next(q for q in cleared["questions"] if q["id"] == "threats")["answer"] is None
    assert client.put(f"/api/investigations/{inv}/safety/answers", json={"question": "other", "answer": "YES"}).status_code == 422


def test_back_up_now_keeps_a_record_and_deleting_the_case_removes_everything(tmp_path):
    inv = _case()
    assert ok(client.get(f"/api/investigations/{inv}/safety"))["stores"]["backups"] == {
        "count": 0, "last_at": None, "last_size_bytes": None, "last_sha256": None, "encrypted": False}
    reply = client.post(f"/api/investigations/{inv}/safety/backup")
    assert reply.status_code == 200 and reply.headers["content-type"] == "application/zip"
    backups = ok(client.get(f"/api/investigations/{inv}/safety"))["stores"]["backups"]
    assert backups["count"] == 1 and backups["last_size_bytes"] == len(reply.content) and backups["last_sha256"] == reply.headers["x-jw-backup-sha256"]
    ok(client.put(f"/api/investigations/{inv}/safety/answers", json={"question": "doxxing", "answer": "NO"}))
    with SessionLocal() as db:
        db.add(OutboundRequest(investigation_id=inv, service="aleph", kind="lookup", value_sent="x", value_kind="search text", reason="lookup", started_by="person"))
        db.add(ServiceMode(investigation_id=inv, service="aleph", mode="OFF"))
        db.commit()
        delete_investigation(db, inv, tmp_path, confirmation=inv)
        for model in (OutboundRequest, ServiceMode, SafetyAnswer, BackupEvent):
            assert db.query(model).filter_by(investigation_id=inv).count() == 0


def test_summary_counts_the_stores():
    inv = _case()
    body = ok(client.get(f"/api/investigations/{inv}/safety"))
    assert body["investigation_name"] == "Harbour land" and body["since"] is None
    assert body["stores"]["records"]["total"] >= 1 and body["stores"]["records"]["claims"] == 0
    assert body["stores"]["documents"] == {"files": 0, "size_bytes": 0, "missing": 0}
    assert body["stores"]["service_keys"]["total"] == 3
    assert body["stores"]["security_log"]["keep_days"] == 90
    assert body["delete"]["record_total"] == body["stores"]["records"]["total"]
    assert [s["service"] for s in body["services"]][-1] == "outside_ai"
    assert client.get("/api/investigations/missing/safety").status_code == 404


_SUITE_PRESENT = (reasoning_module.TAS_ROOT / "PROMPT_MODULES").exists()


class _FakeLLMClient:
    def __init__(self, text: str) -> None:
        self.text, self.calls = text, 0

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.calls += 1
        return self.text


@pytest.fixture()
def ai_on():
    original = (settings.enable_ai_features, settings.ai_provider)
    governor.reset()
    settings.enable_ai_features, settings.ai_provider = True, "anthropic"
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


@pytest.mark.skipif(not _SUITE_PRESENT, reason="vendored Authority System Suite missing")
def test_an_ai_call_to_a_model_elsewhere_is_logged_and_off_stops_it(monkeypatch, ai_on):
    inv = _case()
    source = ok(client.post("/api/sources", json={"investigation_id": inv, "title": "Filing", "source_type": "filing", "url": "https://example.test/f"}))
    ok(client.post("/api/evidence", json={"source_id": source["id"], "quote": "Ada North signed the agreement.", "locator": "page 3"}))
    fake = _FakeLLMClient("{}")
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)
    client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "Who signed?"})
    assert fake.calls >= 1
    items = ok(client.get(f"/api/investigations/{inv}/outbound-log", params={"service": "outside_ai"}))["items"]
    assert len(items) == fake.calls and items[0]["kind"] == "ai" and "Who signed?" in items[0]["value_sent"]
    assert ok(client.get(f"/api/investigations/{inv}/safety"))["totals"]["ai_calls_outside"] == fake.calls

    ok(client.put(f"/api/investigations/{inv}/service-modes", json={"service": "outside_ai", "mode": "OFF"}))
    before = fake.calls
    refused = client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "Who signed?"})
    assert refused.status_code >= 400 and "Off for this case" in refused.text
    assert fake.calls == before


def test_a_model_on_this_computer_sends_nothing_out(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:11434")
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")
    assert not outbound.ai_is_outside(settings)
    monkeypatch.setattr(settings, "ollama_model", "gpt-oss:120b-cloud")
    assert outbound.ai_is_outside(settings)
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    assert outbound.ai_is_outside(settings)
