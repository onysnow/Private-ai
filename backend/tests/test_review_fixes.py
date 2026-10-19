"""Regression tests for defects found in the architecture review of PR #58."""
import pytest
from fastapi.testclient import TestClient

from app.ai.llm_client import is_local_endpoint
from app.core.access import decide_api_access
from app.db.session import Base, SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.services.exports import RESTORE_ORDER, collect_investigation_records


@pytest.mark.parametrize("url", [
    "http://127.0.0.1.evil.com:11434",
    "http://127.evil.example",
    "http://localhost.evil.example",
    "http://0x7f.0.0.1.attacker.test",
])
def test_lookalike_hosts_are_not_local(url):
    assert not is_local_endpoint(url)


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:11434", "http://127.1.2.3:11434", "http://localhost:11434",
    "http://[::1]:11434", "http://host.docker.internal:11434",
])
def test_real_loopback_hosts_are_local(url):
    assert is_local_endpoint(url)


def test_address_only_check_still_trusts_loopback_by_default():
    decision = decide_api_access(client_host="127.0.0.1", target_host="127.0.0.1", authorization=None, configured_token="")
    assert decision.allowed


def test_a_request_already_found_remote_is_not_made_local_again():
    # enforce_api_access has already refused local trust (a proxy header named a
    # remote hop); the address-only check must not hand it back.
    decision = decide_api_access(
        client_host="127.0.0.1", target_host="127.0.0.1", authorization=None,
        configured_token="s3cret", assume_remote=True,
    )
    assert not decision.allowed and decision.status_code == 401


def test_proxy_header_naming_a_remote_hop_requires_the_token(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "api_auth_token", "s3cret", raising=False)
    c = TestClient(app)
    r = c.get("/api/investigations", headers={"X-Forwarded-For": "203.0.113.9"})
    assert r.status_code in (401, 403)
    ok = c.get("/api/investigations", headers={"X-Forwarded-For": "203.0.113.9", "Authorization": "Bearer s3cret"})
    assert ok.status_code == 200


def test_restore_order_inserts_every_parent_before_its_child():
    position = {name: i for i, name in enumerate(RESTORE_ORDER)}
    problems = []
    for name in RESTORE_ORDER:
        table = Base.metadata.tables[name]
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if parent in position and parent != name and position[parent] > position[name]:
                problems.append(f"{name} -> {parent}")
    assert not problems, problems


def test_every_restorable_table_is_exported():
    db = SessionLocal()
    try:
        inv = Investigation(name="Export coverage")
        db.add(inv)
        db.commit()
        exported = set(collect_investigation_records(db, inv.id))
    finally:
        db.close()
    missing = [t for t in RESTORE_ORDER if t not in exported]
    assert not missing, missing


# --- promotion, Aleph and connector-run failures -------------------------------------

def _case_with_assessment(db, *, entity_in_other_case=False, decisions=("positive",)):
    from datetime import timedelta
    from uuid import uuid4
    from app.core.time import utcnow_naive
    from app.models.domain import ConnectorFinding, Entity, ResolutionDecision, StatementAssessment

    a = Investigation(name="Case A")
    b = Investigation(name="Case B")
    db.add_all([a, b]); db.flush()
    entity = Entity(
        investigation_id=(b if entity_in_other_case else a).id, ftm_id=uuid4().hex,
        schema="Company", caption="Acme", properties={},
    )
    db.add(entity); db.flush()
    finding = ConnectorFinding(
        investigation_id=a.id, provider="opensanctions", provider_record_id=uuid4().hex,
        caption="Acme", properties={"country": ["gb"]}, source_url="https://example.test/r1", raw={},
    )
    db.add(finding); db.flush()
    base = utcnow_naive()
    for n, kind in enumerate(decisions):
        db.add(ResolutionDecision(
            investigation_id=a.id, finding_id=finding.id, entity_id=entity.id,
            decision=kind, created_at=base + timedelta(seconds=n),
        ))
    assessment = StatementAssessment(
        investigation_id=a.id, finding_id=finding.id, entity_id=entity.id,
        prop="country", value="gb", status="accepted",
    )
    db.add(assessment); db.commit()
    return assessment


def test_promotion_uses_the_latest_identity_decision():
    from app.services.promotion import promote_assessment
    db = SessionLocal()
    try:
        assessment = _case_with_assessment(db, decisions=("positive", "negative"))
        with pytest.raises(ValueError, match="positive identity"):
            promote_assessment(db, assessment)
        ok = _case_with_assessment(db, decisions=("negative", "positive"))
        assert promote_assessment(db, ok) is not None
    finally:
        db.close()


def test_promotion_refuses_an_entity_from_another_investigation():
    from app.services.promotion import promote_assessment
    db = SessionLocal()
    try:
        assessment = _case_with_assessment(db, entity_in_other_case=True)
        with pytest.raises(ValueError, match="same investigation"):
            promote_assessment(db, assessment)
    finally:
        db.close()


def test_aleph_never_invents_a_finding_when_the_api_fails():
    import asyncio
    import httpx
    from app.connectors.aleph import AlephConnector

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/2/search":
            return httpx.Response(429, json={"message": "rate limited"})
        return httpx.Response(200, text="<html>search page</html>", headers={"content-type": "text/html"})

    real = httpx.AsyncClient

    class Patched(real):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **kw)

    import app.connectors.aleph as module
    module.httpx.AsyncClient = Patched
    try:
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(AlephConnector().search("anyone"))
    finally:
        module.httpx.AsyncClient = real


def test_a_failed_save_marks_the_connector_run_failed(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from app.connectors.base import ExternalFinding
    from app.connectors.registry import registry
    from app.models.domain import ConnectorRun
    from app.schemas.api import ConnectorSearchRequest
    from app.services.connectors import run_connector
    import app.services.connectors as service

    class Boom:
        async def search(self, query):
            return [ExternalFinding(provider="boom", record_id="x", caption="x", schema=None, url="https://example.test", properties={}, raw={})]

    monkeypatch.setitem(registry._connectors if hasattr(registry, "_connectors") else registry.__dict__, "boom", Boom())
    monkeypatch.setattr(registry, "get", lambda name: Boom() if name == "boom" else None)

    def explode(*a, **k):
        db = a[0]
        db.add(__import__("app.models.domain", fromlist=["Lead"]).Lead(investigation_id=a[2], title="t" * 5000, provider="boom", provider_record_id="x"))
        db.flush()
        raise RuntimeError("save failed")

    monkeypatch.setattr(service, "persist_connector_findings", explode)
    db = SessionLocal()
    try:
        inv = Investigation(name="Run failure"); db.add(inv); db.commit()
        with pytest.raises(HTTPException) as caught:
            asyncio.run(run_connector("boom", ConnectorSearchRequest(investigation_id=inv.id, query="q"), db))
        assert caught.value.status_code == 502
        runs = db.query(ConnectorRun).filter(ConnectorRun.investigation_id == inv.id).all()
        assert [r.status for r in runs] == ["failed"]
    finally:
        db.close()


# --- trusted proxy, failed-login limiter, secret redaction -----------------------------

def test_a_configured_proxy_peer_is_never_local(monkeypatch):
    from starlette.requests import Request
    from app.core.access import request_is_local_request
    from app.core.config import settings

    scope = {"type": "http", "method": "GET", "path": "/api/investigations", "query_string": b"",
             "headers": [(b"host", b"127.0.0.1:8000")], "client": ("127.0.0.1", 5555), "server": ("127.0.0.1", 8000), "scheme": "http"}
    assert request_is_local_request(Request(scope))  # default: loopback is local
    monkeypatch.setattr(settings, "trusted_proxy_ips", "127.0.0.1", raising=False)
    assert not request_is_local_request(Request(scope))
    monkeypatch.setattr(settings, "trusted_proxy_ips", "10.0.0.0/8, ::1", raising=False)
    assert request_is_local_request(Request(scope))  # another proxy, not this peer


def test_rotating_the_host_header_does_not_reset_the_failed_login_count(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "api_auth_token", "s3cret", raising=False)
    monkeypatch.setattr(settings, "trusted_proxy_ips", "testclient", raising=False)
    c = TestClient(app)
    codes = []
    for n in range(40):
        r = c.get("/api/investigations", headers={"Host": f"h{n}.example", "Authorization": "Bearer wrong"})
        codes.append(r.status_code)
    assert 429 in codes, set(codes)


def test_config_view_hides_the_database_password():
    from opsconsole.core.configview import _redact_urls
    assert _redact_urls("postgresql+psycopg://journalism:hunter2pw@db/jw") == "postgresql+psycopg://journalism:••••••@db/jw"
    assert _redact_urls("sqlite:///./data/app.db") == "sqlite:///./data/app.db"


# --- body ids and form ids must stay inside one investigation ---------------------------

def _two_cases_with_a_finding():
    from uuid import uuid4
    from app.models.domain import ConnectorFinding, Entity
    db = SessionLocal()
    try:
        a = Investigation(name="Case A"); b = Investigation(name="Case B")
        db.add_all([a, b]); db.flush()
        foreign = Entity(investigation_id=b.id, ftm_id=uuid4().hex, schema="Company", caption="B only", properties={})
        own = Entity(investigation_id=a.id, ftm_id=uuid4().hex, schema="Company", caption="A own", properties={})
        finding = ConnectorFinding(investigation_id=a.id, provider="x", provider_record_id=uuid4().hex, caption="f", properties={}, source_url="https://e.test", raw={})
        db.add_all([foreign, own, finding]); db.commit()
        return a.id, b.id, finding.id, own.id, foreign.id
    finally:
        db.close()


def test_resolution_and_assessment_refuse_an_entity_from_another_case():
    _a, _b, finding_id, own_id, foreign_id = _two_cases_with_a_finding()
    c = TestClient(app)
    for path, body in (
        (f"/api/connector-findings/{finding_id}/resolution", {"decision": "positive"}),
        (f"/api/connector-findings/{finding_id}/assessments", {"prop": "country", "value": "gb", "status": "accepted"}),
    ):
        assert c.post(path, json={**body, "entity_id": foreign_id}).status_code == 404
        assert c.post(path, json={**body, "entity_id": "no-such-entity"}).status_code == 404
        assert c.post(path, json={**body, "entity_id": own_id}).status_code == 200


def test_upload_to_a_case_the_token_cannot_see_is_refused(monkeypatch):
    from app.core.config import settings
    a_id, b_id, *_ = _two_cases_with_a_finding()
    monkeypatch.setattr(settings, "api_auth_token", "s3cret", raising=False)
    monkeypatch.setattr(settings, "api_auth_investigation_ids", a_id, raising=False)
    monkeypatch.setattr(settings, "trusted_proxy_ips", "testclient", raising=False)
    c = TestClient(app)
    headers = {"Authorization": "Bearer s3cret"}
    files = {"file": ("note.txt", b"same bytes", "text/plain")}
    r = c.post("/api/documents/upload", data={"investigation_id": b_id}, files=files, headers=headers)
    assert r.status_code == 404


# --- one bad amount, one broken rule, an unbounded limiter -------------------------------

@pytest.mark.parametrize("bad", ["nan", "inf", "-inf", "1e999", "-5"])
def test_payment_amounts_the_detectors_cannot_read_are_refused(bad):
    from app.services.relationships import validate_payment_properties
    with pytest.raises(ValueError, match="amount"):
        validate_payment_properties({"amount": [bad]})
    props = {"amount": ["1,250.50"], "currency": ["usd"]}
    validate_payment_properties(props)
    assert props == {"amount": ["1250.50"], "currency": ["USD"]}


def test_one_rule_that_raises_does_not_take_the_other_flags_with_it(monkeypatch):
    from app.patterns import engine, specs as detection
    db = SessionLocal()
    try:
        inv = Investigation(name="Rule isolation"); db.add(inv); db.commit()
        specs = detection.load()
        assert len(specs) > 1
        broken = specs[0].indicator
        real = detection.run

        def run(spec, graph):
            if spec.indicator == broken:
                raise ZeroDivisionError("boom")
            return real(spec, graph)

        monkeypatch.setattr(detection, "run", run)
        cannot = engine.recompute(db, inv.id)
        reasons = {c["indicator_id"]: c["reason"] for c in cannot}
        assert "ZeroDivisionError" in reasons[broken]
        assert engine.flags(db, inv.id, refresh=True)["investigation_id"] == inv.id
    finally:
        db.close()


def test_a_rule_that_raises_keeps_its_earlier_flags(monkeypatch):
    from app.patterns import engine, specs as detection
    from app.models.domain import PatternFlag
    db = SessionLocal()
    try:
        inv = Investigation(name="Keep flags"); db.add(inv); db.flush()
        spec = detection.load()[0]
        db.add(PatternFlag(investigation_id=inv.id, indicator_id=spec.indicator, fingerprint="f" * 32, status="open",
                           level="faint", parties=[], links=[], facts={}))
        db.commit()
        monkeypatch.setattr(detection, "run", lambda s, g: (_ for _ in ()).throw(RuntimeError("x")) if s.indicator == spec.indicator else [])
        engine.recompute(db, inv.id)
        row = db.query(PatternFlag).filter_by(investigation_id=inv.id, fingerprint="f" * 32).one()
        assert row.gone_at is None
    finally:
        db.close()


def test_the_failure_limiter_forgets_old_keys():
    from app.core.rate_limiter import FixedWindowRateLimiter
    limiter = FixedWindowRateLimiter(limit=5, window_seconds=60)
    limiter.MAX_KEYS = 100
    for n in range(500):
        limiter.hit(f"k{n}", now=1000.0)
    assert len(limiter._windows) <= 100
    for n in range(300):
        limiter.hit(f"late{n}", now=5000.0)  # every earlier window has expired
    assert len(limiter._windows) <= 100


# --- A-02: figures typed into a request do not survive a save ---------------

def _forged_chart_visual():
    from tests.test_saved_charts import ORDER
    return {
        "type": "chart", "spec": ORDER,
        "data": {"rows": [{"label": "Shell Co Ltd", "value": 9999999999.0,
                           "record_refs": [{"record_type": "payment", "record_id": "not-a-real-payment"}]}]},
        "option": {"series": [{"data": [9999999999.0]}]},
    }


def test_a_forged_chart_in_a_deck_is_cooked_again_from_the_records():
    from tests.test_saved_charts import _deck_and_writeup
    from fastapi.testclient import TestClient as _TC
    c = _TC(app)
    _inv, deck_id, _w = _deck_and_writeup()
    saved = c.patch(f"/api/decks/{deck_id}", json={"slides_json": [
        {"kind": "content", "heading": "Money", "bullets": [], "evidence": [], "visual": _forged_chart_visual()}]})
    assert saved.status_code == 200, saved.text
    visual = saved.json()["slides"][0]["visual"]
    labels = [r["label"] for r in visual["data"]["rows"]]
    assert "Shell Co Ltd" not in labels and "Meridian Holdings Ltd" in labels
    assert "not-a-real-payment" not in str(visual)


def test_a_forged_chart_in_a_writeup_is_cooked_again_from_the_records():
    from tests.test_saved_charts import _deck_and_writeup
    from fastapi.testclient import TestClient as _TC
    c = _TC(app)
    _inv, _d, writeup_id = _deck_and_writeup()
    doc = {"type": "doc", "content": [{"type": "evidenceVisual", "attrs": {"visual": _forged_chart_visual()}}]}
    saved = c.patch(f"/api/writeups/{writeup_id}", json={"content_json": doc})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert "Shell Co Ltd" not in str(body["content_json"]) and "not-a-real-payment" not in str(body)
    assert "Meridian Holdings Ltd" in str(body["content_json"])


def test_a_chart_whose_query_cannot_run_is_dropped_not_kept():
    from tests.test_saved_charts import _deck_and_writeup
    from fastapi.testclient import TestClient as _TC
    c = _TC(app)
    _inv, deck_id, _w = _deck_and_writeup()
    visual = _forged_chart_visual()
    visual["spec"] = {"kind": "bar", "title": "x", "query": {"name": "no_such_query"}}
    saved = c.patch(f"/api/decks/{deck_id}", json={"slides_json": [
        {"kind": "content", "heading": "Money", "bullets": [], "evidence": [], "visual": visual}]})
    assert saved.status_code == 200
    assert saved.json()["slides"][0]["visual"] is None


def test_forged_items_on_a_chart_block_reach_neither_the_text_nor_the_citations():
    from tests.test_saved_charts import _deck_and_writeup
    from fastapi.testclient import TestClient as _TC
    c = _TC(app)
    _inv, _d, writeup_id = _deck_and_writeup()
    visual = _forged_chart_visual()
    visual["data"] = {"rows": []}
    visual["items"] = [{"label": "Phantom Corp", "value": 777, "evidence": [{"record_type": "payment", "record_id": "fake-id"}]}]
    doc = {"type": "doc", "content": [{"type": "evidenceVisual", "attrs": {"visual": visual}}]}
    saved = c.patch(f"/api/writeups/{writeup_id}", json={"content_json": doc})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert "Phantom Corp" not in str(body) and "fake-id" not in str(body)
    assert body["cited_record_refs"]


def test_a_chart_in_a_writeup_keeps_its_drawing_text_and_real_report_through_a_save():
    from tests.test_saved_charts import ORDER, _deck_and_writeup
    from fastapi.testclient import TestClient as _TC
    c = _TC(app)
    _inv, _d, writeup_id = _deck_and_writeup()
    added = c.post(f"/api/writeups/{writeup_id}/charts", json={"spec": ORDER})
    assert added.status_code == 200, added.text
    doc = added.json()["content_json"]
    saved = c.patch(f"/api/writeups/{writeup_id}", json={"content_json": doc})
    visual = saved.json()["content_json"]["content"][-1]["attrs"]["visual"]
    assert visual["option"] and visual["text"].get("description")
    assert visual["report"]["ok"] is True and visual["report"].get("checked_rules")


# --- CodeQL findings on the combined branch ---------------------------------

def test_the_query_workbench_strips_comments_in_one_pass():
    import time as _t

    import pytest as _p

    from opsconsole.core.sqlscreen import screen_read
    assert screen_read("select 1 -- trailing\n") == "select 1"
    assert screen_read("select /* c */ 2") == "select   2"
    with _p.raises(ValueError):
        screen_read("/* hidden */ DROP TABLE x")
    with _p.raises(ValueError):
        screen_read("select 1 /* a */ ; delete from t")
    started = _t.perf_counter()
    with _p.raises(ValueError):          # nothing but unclosed '/*': used to take quadratic time
        screen_read("/*a" * 200_000)
    assert _t.perf_counter() - started < 2


def test_the_api_replay_goes_to_the_address_the_server_listens_on_not_the_host_header():
    from starlette.requests import Request

    from opsconsole.api.apiplay import _own_base
    scope = {"type": "http", "scheme": "http", "server": ("0.0.0.0", 8000), "path": "/", "query_string": b"",
             "headers": [(b"host", b"attacker.example")]}
    assert _own_base(Request(scope)) == "http://127.0.0.1:8000"
    scope["server"] = ("::1", 9000)
    assert _own_base(Request(scope)) == "http://[::1]:9000"


def test_base_map_files_are_read_only_from_inside_their_folder(tmp_path):
    from app.services.basemap import _read_inside
    (tmp_path / "fonts").mkdir()
    (tmp_path / "fonts" / "a.pbf").write_bytes(b"ok")
    (tmp_path / "secret.txt").write_bytes(b"no")
    root = tmp_path / "fonts"
    from pathlib import Path
    assert _read_inside(root, Path("a.pbf")) == b"ok"
    assert _read_inside(root, Path("../secret.txt")) is None
    assert _read_inside(root, Path("missing.pbf")) is None


def test_a_connector_credential_failure_does_not_answer_with_the_internal_reason(monkeypatch):
    import app.api.routes_settings as settings_routes

    def broken(provider, credential):
        raise RuntimeError("keyring backend at /home/ops/.local/share failed")

    monkeypatch.setattr(settings_routes, "_save_connector_credential", broken)
    r = TestClient(app).put("/api/settings/connectors/aleph/credential", json={"credential": "x"})
    assert r.status_code == 500 and "/home/ops" not in r.text
