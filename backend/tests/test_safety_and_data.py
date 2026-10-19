"""Keep › Safety & data (ADR-0015, mockup KEEP-safety-and-data): the outbound log written at each outside lookup and
AI call, the backup record made at each export, and the one reply that assembles them."""

import csv
import hashlib
import io
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.connectors.base import Connector, ExternalFinding
from app.connectors.opensanctions import OpenSanctionsConnector
from app.connectors.registry import registry
from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.models.safety import BackupEvent, OutboundRequest
from app.services.outbound_log import (
    list_outbound,
    outbound_csv,
    outbound_totals,
    record_outbound,
)
from tests.test_reasoning_endpoints import (
    _FakeLLMClient,
    _seeded_investigation,
    _valid_case_synthesis,
    requires_suite,
)

client = TestClient(app)


class EchoConnector(Connector):
    base_url = "https://registry.example.org"

    async def search(self, query: str):
        return [ExternalFinding(provider="echo", record_id=f"echo-{query}", caption=query)]


class BrokenConnector(Connector):
    base_url = "https://broken.example.org"

    async def search(self, query: str):
        raise RuntimeError("service unavailable")


@pytest.fixture(autouse=True)
def _connectors_and_ai_settings():
    registry.register("echo", EchoConnector())
    registry.register("broken", BrokenConnector())
    original = (settings.enable_ai_features, settings.ai_provider)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


def _case(name="Harbour land"):
    reply = client.post("/api/investigations", json={"name": name})
    assert reply.status_code == 200, reply.text
    return reply.json()["id"]


def _entries(inv, **params):
    reply = client.get(f"/api/investigations/{inv}/outbound-log", params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_a_lookup_is_logged_with_the_exact_words_that_were_sent():
    inv = _case()
    assert client.post("/api/connectors/echo/search", json={"investigation_id": inv, "query": "14 Quay Street, Douglas"}).status_code == 200
    log = _entries(inv)
    assert log["total"] == 1
    row = log["entries"][0]
    assert (row["service"], row["value_sent"], row["value_kind"], row["reason"], row["actor"], row["status"], row["local"]) == (
        "echo", "14 Quay Street, Douglas", "search words", "lookup", "you clicked", "sent", False)
    assert row["destination"] == "https://registry.example.org"
    assert row["run_id"]


def test_a_failed_lookup_is_logged_as_failed_with_the_reason():
    inv = _case()
    assert client.post("/api/connectors/broken/search", json={"investigation_id": inv, "query": "Fernhill Ltd"}).status_code == 502
    row = _entries(inv)["entries"][0]
    assert (row["status"], row["value_sent"]) == ("failed", "Fernhill Ltd")
    assert "service unavailable" in row["error"]


def test_a_keyed_service_with_no_key_sends_nothing_and_says_so(monkeypatch):
    inv = _case()
    registry.register("opensanctions", OpenSanctionsConnector(api_key=""))
    assert client.post("/api/connectors/opensanctions/search", json={"investigation_id": inv, "query": "M. Ross"}).status_code == 502
    row = _entries(inv)["entries"][0]
    assert row["status"] == "not_sent" and "No key" in row["error"]
    # Not sent means not counted as leaving.
    assert outbound_totals_for(inv)["requests_left"] == 0


def outbound_totals_for(inv, period="7d"):
    with SessionLocal() as db:
        return outbound_totals(db, inv, period=period)


def test_entity_enrichment_logs_what_the_connector_sends_for_the_entity():
    inv = _case()
    entity = client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Fernhill Ltd",
                                                  "properties": {"name": ["Fernhill Ltd"], "country": ["gb"]}}).json()
    assert client.post(f"/api/entities/{entity['id']}/enrich/echo").status_code == 200
    row = _entries(inv)["entries"][0]
    assert (row["reason"], row["value_kind"]) == ("enrich", "name and details")
    assert row["value_sent"] == "Fernhill Ltd gb"
    # The run's own record only says "entity:<id>"; the log keeps the words.
    assert client.post(f"/api/entities/{entity['id']}/enrich", json={"providers": ["echo"]}).status_code == 200
    reasons = {e["reason"] for e in _entries(inv)["entries"]}
    assert reasons == {"enrich", "matched all services"}


def test_opensanctions_logs_the_schema_and_every_property_it_sends():
    connector = OpenSanctionsConnector(api_key="k")
    value, kind = connector.request_preview(entity={"schema": "Company", "properties": {"name": ["Kestrel SA"], "country": ["ch"]}})
    assert json.loads(value) == {"properties": {"country": ["ch"], "name": ["Kestrel SA"]}, "schema": "Company"}
    assert "every property" in kind
    assert OpenSanctionsConnector(api_key="").will_send() is False and connector.will_send() is True


def test_the_log_counts_only_what_left_and_keeps_local_requests_apart():
    inv = _case()
    with SessionLocal() as db:
        record_outbound(db, investigation_id=inv, service="opensanctions", destination="https://api.opensanctions.org", local=False,
                        value_sent="Kestrel SA", value_kind="search words", reason="lookup")
        record_outbound(db, investigation_id=inv, service="ai", destination="anthropic claude", local=False,
                        value_sent="What did Ada sign?", value_kind="question and case records", reason="AI run")
        record_outbound(db, investigation_id=inv, service="ai", destination="ollama qwen", local=True,
                        value_sent="Local question", value_kind="question and case records", reason="AI run")
        old = record_outbound(db, investigation_id=inv, service="aleph", destination="https://aleph.example", local=False,
                              value_sent="Old", value_kind="search words", reason="lookup")
        old.at = utcnow_naive() - timedelta(days=40)
        db.commit()
    assert outbound_totals_for(inv, "7d") == {"requests_left": 2, "services_reached": 2, "ai_calls_outside": 1}
    assert outbound_totals_for(inv, "all")["requests_left"] == 3
    assert outbound_totals_for(inv, "30d")["requests_left"] == 2
    assert outbound_totals_for(inv, "today")["requests_left"] == 2
    shown = _entries(inv)
    assert shown["total"] == 2 and {e["service"] for e in shown["entries"]} == {"opensanctions", "ai"}
    assert all(not e["local"] for e in shown["entries"])
    assert _entries(inv, include_local="true")["total"] == 3
    assert {e["service"] for e in _entries(inv, service="ai")["entries"]} == {"ai"}


def test_the_log_belongs_to_its_case():
    mine, other = _case("Mine"), _case("Other")
    with SessionLocal() as db:
        record_outbound(db, investigation_id=other, service="aleph", destination="https://aleph.example", local=False,
                        value_sent="Somebody else's search", value_kind="search words", reason="lookup")
    assert _entries(mine)["total"] == 0
    assert client.get("/api/investigations/nope/outbound-log").status_code == 404


def test_the_csv_has_every_row_and_defuses_values_that_would_run_as_formulas():
    inv = _case("Harbour / land")
    with SessionLocal() as db:
        record_outbound(db, investigation_id=inv, service="firecrawl", destination="https://api.firecrawl.dev", local=False,
                        value_sent='=HYPERLINK("http://evil.example","x")', value_kind="search words", reason="lookup")
        record_outbound(db, investigation_id=inv, service="ai", destination="ollama qwen", local=True,
                        value_sent="Local", value_kind="question and case records", reason="AI run")
    reply = client.get(f"/api/investigations/{inv}/outbound-log.csv")
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("text/csv")
    assert 'filename="Harbour___land-outbound-log.csv"' in reply.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(reply.text)))
    assert rows[0][:5] == ["time_utc", "service", "destination", "left_this_computer", "value_sent"]
    assert len(rows) == 3, "every row, local ones marked, goes in the file"
    by_service = {r[1]: r for r in rows[1:]}
    assert by_service["firecrawl"][3] == "yes" and by_service["ai"][3] == "no"
    assert by_service["firecrawl"][4].startswith("'=HYPERLINK")


def test_logging_never_breaks_the_lookup_it_describes(monkeypatch):
    inv = _case()
    with SessionLocal() as db:
        monkeypatch.setattr(OutboundRequest, "__init__", lambda self, **kw: (_ for _ in ()).throw(RuntimeError("disk full")))
        assert record_outbound(db, investigation_id=inv, service="echo", destination="x", local=False,
                               value_sent="v", value_kind="k", reason="r") is None


@requires_suite
def test_an_outside_ai_call_is_logged_with_the_question_and_what_went_with_it(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation(client)
    inv = seeded["investigation"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis(seeded["evidence"]["id"])))
    reply = client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "What did Ada North sign?"})
    assert reply.status_code == 200, reply.text
    run_id = reply.json()["job"]["id"]
    rows = _entries(inv)["entries"]
    assert len(rows) == 1
    row = rows[0]
    assert (row["service"], row["local"], row["status"], row["reason"], row["run_id"]) == ("ai", False, "sent", "AI run", run_id)
    assert row["value_sent"].startswith("What did Ada North sign?")
    assert row["value_kind"] == "question and case records"
    assert row["detail"]["records"] >= 1 and row["detail"]["characters_sent"] > 0
    assert row["detail"]["exact_text"] == "kept with this run (trace.user_prompt)"
    assert outbound_totals_for(inv)["ai_calls_outside"] == 1


@requires_suite
def test_a_local_model_is_logged_but_not_counted_as_leaving(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "ollama"
    monkeypatch.setattr(settings, "ollama_model", "qwen2.5:32b-instruct")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:11434")
    seeded = _seeded_investigation(client)
    inv = seeded["investigation"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis(seeded["evidence"]["id"])))
    assert client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "What did Ada North sign?"}).status_code == 200
    assert _entries(inv)["total"] == 0, "the log is what left: a model on this computer is not in it"
    assert _entries(inv, include_local="true")["total"] == 1
    assert outbound_totals_for(inv)["ai_calls_outside"] == 0


def test_an_export_leaves_a_record_of_the_backup_and_the_log_travels_with_the_case():
    inv = _case()
    client.post("/api/connectors/echo/search", json={"investigation_id": inv, "query": "Harbour Nominees Ltd"})
    reply = client.get(f"/api/investigations/{inv}/export", params={"include_documents": "false"})
    assert reply.status_code == 200
    with SessionLocal() as db:
        events = db.query(BackupEvent).filter(BackupEvent.investigation_id == inv).all()
        assert len(events) == 1
        event = events[0]
        assert event.size_bytes == len(reply.content) and event.sha256 == hashlib.sha256(reply.content).hexdigest()
        assert event.with_documents is False and event.encrypted is False and event.record_total >= 1
    import zipfile
    with zipfile.ZipFile(io.BytesIO(reply.content)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    assert manifest["record_counts"]["outbound_requests"] == 1


def test_a_restored_case_keeps_its_outbound_log_and_the_backup_record_goes_with_the_deleted_case():
    inv = _case("Round trip")
    client.post("/api/connectors/echo/search", json={"investigation_id": inv, "query": "Kestrel SA"})
    package = client.get(f"/api/investigations/{inv}/export", params={"include_documents": "false"}).content
    with SessionLocal() as db:
        assert db.query(BackupEvent).filter(BackupEvent.investigation_id == inv).count() == 1
    assert client.delete(f"/api/investigations/{inv}", params={"confirmation": inv}).status_code == 200
    with SessionLocal() as db:
        assert db.query(OutboundRequest).filter(OutboundRequest.investigation_id == inv).count() == 0, "deleting a case deletes its log"
        assert db.query(BackupEvent).filter(BackupEvent.investigation_id == inv).count() == 0
    settings_before = settings.enable_restore_api
    settings.enable_restore_api = True
    try:
        restored = client.post("/api/backups/restore", files={"file": ("case.jwbackup.zip", package, "application/zip")})
    finally:
        settings.enable_restore_api = settings_before
    assert restored.status_code == 200, restored.text
    new_id = restored.json()["investigation_id"]
    assert [e["value_sent"] for e in _entries(new_id)["entries"]] == ["Kestrel SA"]
    with SessionLocal() as db:
        assert db.query(BackupEvent).filter(BackupEvent.investigation_id == new_id).count() == 0, "a restored case has made no backups"


def test_the_safety_reply_assembles_stores_services_and_cards():
    inv = _case("Harbour land")
    client.post("/api/connectors/echo/search", json={"investigation_id": inv, "query": "14 Quay Street"})
    before = client.get(f"/api/investigations/{inv}/safety-and-data")
    assert before.status_code == 200, before.text
    body = before.json()
    assert body["investigation"] == {"id": inv, "name": "Harbour land"} and body["period"] == "7d"
    assert body["totals"]["requests_left"] == 1 and body["totals"]["documents_sent_out"] == 0
    assert body["stores"]["backups"] == {"count": 0, "last": None, "encrypted": False}
    assert body["cards"]["backup"]["last"] is None
    services = {s["key"]: s for s in body["services"]}
    assert services["echo"]["sent"] == 1 and services["echo"]["sends"] == ["search words"] and services["echo"]["mode"] == "on_click"
    assert services["openaleph"]["mode"] == "off" and services["ai"]["mode"] == "off"
    assert services["openaleph"]["counted"] is True
    assert body["not_counted"], "what is not logged is stated, never shown as a zero"

    client.get(f"/api/investigations/{inv}/export", params={"include_documents": "false"})
    after = client.get(f"/api/investigations/{inv}/safety-and-data", params={"period": "all"}).json()
    assert after["stores"]["backups"]["count"] == 1 and after["stores"]["backups"]["last"]
    assert after["cards"]["backup"]["size_bytes"] > 0 and len(after["cards"]["backup"]["sha256"]) == 64
    assert after["cards"]["delete"]["records"] >= 1
    assert client.get(f"/api/investigations/{inv}/safety-and-data", params={"period": "century"}).status_code == 422
    assert client.get("/api/investigations/nope/safety-and-data").status_code == 404


def test_openaleph_traffic_is_marked_not_counted_when_it_is_on_another_machine(monkeypatch):
    inv = _case()
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", "https://aleph.partner.example")
    services = {s["key"]: s for s in client.get(f"/api/investigations/{inv}/safety-and-data").json()["services"]}
    assert services["openaleph"]["mode"] == "automatic" and services["openaleph"]["counted"] is False
    monkeypatch.setattr(settings, "openaleph_base_url", "http://127.0.0.1:8001")
    services = {s["key"]: s for s in client.get(f"/api/investigations/{inv}/safety-and-data").json()["services"]}
    assert services["openaleph"]["mode"] == "this_computer" and services["openaleph"]["counted"] is True
