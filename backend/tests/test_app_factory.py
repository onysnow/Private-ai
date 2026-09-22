"""STRUCT-0010: app/main.py is a side-effect-free module with an injectable factory.

- importing app.main must not touch the database (schema bootstrap runs in the
  app lifespan, i.e. at server start or inside `with TestClient(app):`);
- create_app() takes its own Settings plus the access-guard collaborators
  (audit logger, request limits, auth-failure limiter) so a test can hand in
  doubles instead of monkeypatching module attributes or writing the real
  audit file.
"""

import importlib
import sys

from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import Settings
from app.core.rate_limiter import FixedWindowRateLimiter
from app.core.request_limits import RequestLimitPolicy


class _MemoryAudit:
    def __init__(self):
        self.records: list[dict] = []

    def write(self, **record):
        self.records.append(record)


def test_import_has_no_schema_side_effect_and_lifespan_runs_it(monkeypatch):
    calls = {"n": 0}
    monkeypatch.setattr("app.db.migrations.ensure_database_schema", lambda engine: calls.__setitem__("n", calls["n"] + 1))
    sys.modules.pop("app.main", None)
    reloaded = importlib.import_module("app.main")
    assert calls["n"] == 0, "importing app.main must not run the schema check"

    fresh = reloaded.create_app(Settings())
    assert calls["n"] == 0, "constructing the app must not run it either"
    with TestClient(fresh) as client:
        assert calls["n"] == 1, "the lifespan runs it once at startup"
        assert client.get("/api/health").json() == {"status": "ok"}
    assert calls["n"] == 1

    with TestClient(reloaded.create_app(Settings(), bootstrap_schema=False)):
        assert calls["n"] == 1, "bootstrap_schema=False skips it"
    # Put the canonical module object back for the rest of the suite.
    sys.modules["app.main"] = main_module


def test_injected_audit_logger_and_limits_are_used_instead_of_settings_built_ones(tmp_path):
    audit = _MemoryAudit()
    settings = Settings(audit_log_file=str(tmp_path / "never-written.jsonl"), api_auth_token="secret-token")
    app = main_module.create_app(
        settings,
        bootstrap_schema=False,
        audit=audit,  # type: ignore[arg-type]  # duck-typed double: only .write() is used
        request_limits=RequestLimitPolicy(default_bytes=64, document_bytes=64, backup_bytes=64),
        auth_failures=FixedWindowRateLimiter(1, 60),
    )
    client = TestClient(app, base_url="https://newsroom.example.test")

    # Remote POSTs (always audited) with the wrong token: denied, audited to the double, then rate limited.
    first = client.post("/api/investigations", json={"name": "x"}, headers={"authorization": "Bearer wrong"})
    assert first.status_code == 401
    second = client.post("/api/investigations", json={"name": "x"}, headers={"authorization": "Bearer wrong"})
    assert second.status_code == 429 and second.headers.get("retry-after")
    assert [r["event"] for r in audit.records] == ["access_denied", "auth_rate_limited"]
    assert not (tmp_path / "never-written.jsonl").exists(), "the settings-built file logger was never constructed"

    # The injected 64-byte envelope limit applies to POSTs.
    too_big = client.post("/api/investigations", headers={"authorization": "Bearer secret-token", "content-length": "1000", "content-type": "application/json"}, content=b"{}")
    assert too_big.status_code == 413
    assert audit.records[-1]["event"] == "request_rejected"


def test_two_app_instances_do_not_share_settings():
    open_app = main_module.create_app(Settings(api_auth_token=""), bootstrap_schema=False, audit=_MemoryAudit())  # type: ignore[arg-type]
    locked_app = main_module.create_app(Settings(api_auth_token="t0k3n"), bootstrap_schema=False, audit=_MemoryAudit())  # type: ignore[arg-type]
    remote = {"base_url": "https://newsroom.example.test"}
    assert TestClient(open_app).get("/api/investigations").status_code == 200, "loopback: open with no token configured"
    assert TestClient(open_app, **remote).get("/api/investigations", headers={"authorization": "Bearer t0k3n"}).status_code == 403, "no token configured means no remote access on this instance, whatever token is sent"
    assert TestClient(locked_app, **remote).get("/api/investigations").status_code == 401
    assert TestClient(locked_app, **remote).get("/api/investigations", headers={"authorization": "Bearer t0k3n"}).status_code == 200
