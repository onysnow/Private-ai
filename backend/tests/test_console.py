"""Operator console (/api/console/*): loopback-only tools that give the owner a
view of the whole backend -- tables on any dialect, read-only SQL, the route
table, live endpoint probes, the test runner against an isolated database, and
the structured application log.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.app_log import read_app_log
from app.core.config import settings
from app.main import app
from app.services import console as console_module
from app.services.console import run_readonly_sql

client = TestClient(app)
remote = TestClient(app, base_url="https://newsroom.example.test")


def test_console_is_loopback_only_and_can_be_disabled(monkeypatch):
    assert remote.get("/api/console/overview").status_code in {401, 403}
    monkeypatch.setattr(settings, "console_enabled", False)
    assert client.get("/api/console/overview").status_code == 404


def test_overview_tables_and_rows_reflect_the_live_database():
    inv = client.post("/api/investigations", json={"name": "Console case"}).json()
    overview = client.get("/api/console/overview").json()
    assert overview["database"]["dialect"] in {"sqlite", "postgresql"}
    assert overview["database"]["missing_tables"] == [] and overview["database"]["modeled_tables"] == 42
    assert overview["links"]["swagger"] == "/docs" and "adminer" in overview["links"]

    tables = {t["name"]: t for t in client.get("/api/console/tables").json()["tables"]}
    assert tables["investigations"]["rows"] >= 1
    assert any(c["name"] == "id" and c["primary_key"] for c in tables["investigations"]["columns"])
    assert "investigations" in tables["entities"]["foreign_keys"]

    rows = client.get("/api/console/tables/investigations", params={"limit": 5}).json()
    assert rows["total"] >= 1 and rows["rows"][0]["id"] == inv["id"], "newest first"
    assert client.get("/api/console/tables/not_a_table").status_code == 404


def test_readonly_sql_allows_selects_and_refuses_everything_else():
    client.post("/api/investigations", json={"name": "SQL case"})
    ok = client.post("/api/console/sql", json={"sql": "SELECT name FROM investigations ORDER BY created_at DESC -- newest\n;"}).json()
    assert ok["columns"] == ["name"] and ok["rows"][0] == ["SQL case"] and ok["truncated"] is False
    for bad in ("DELETE FROM investigations", "SELECT 1; DROP TABLE investigations", "UPDATE investigations SET name='x'",
                "WITH x AS (DELETE FROM investigations RETURNING id) SELECT * FROM x", "PRAGMA table_info(investigations)", ""):
        r = client.post("/api/console/sql", json={"sql": bad or " "})
        assert r.status_code in {400, 422}, (bad, r.text)
    assert client.post("/api/console/sql", json={"sql": "SELECT * FROM no_such_table"}).status_code == 400
    assert client.get("/api/console/tables/investigations").json()["total"] >= 1, "nothing was deleted"


def test_readonly_sql_caps_rows_and_rolls_back():
    from app.db.session import SessionLocal
    with SessionLocal() as db:
        for i in range(3):
            client.post("/api/investigations", json={"name": f"cap {i}"})
        out = run_readonly_sql(db, "SELECT id FROM investigations", max_rows=2)
        assert out["returned"] == 2 and out["truncated"] is True


def test_routes_listing_covers_the_api_surface():
    routes = client.get("/api/console/routes").json()["routes"]
    paths = {(r["path"], m) for r in routes for m in r["methods"]}
    assert ("/api/investigations", "GET") in paths and ("/api/console/sql", "POST") in paths
    entry = next(r for r in routes if r["path"] == "/api/investigations/{investigation_id}/ai-analysis-candidates")
    assert entry["path_params"] == ["investigation_id"] and "review_status" in entry["query_params"]


def test_endpoint_probe_reports_status_and_latency(monkeypatch):
    """Probe through a fake HTTP client so the test needs no live server; the
    real route passes request.base_url, which for TestClient is http://testserver."""
    calls = []

    class _Resp:
        def __init__(self, code): self.status_code = code

    class _Client:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def request(self, method, path):
            calls.append((method, path))
            return _Resp(500 if path.endswith("/openapi.json") else 200)

    monkeypatch.setattr(console_module.httpx, "Client", _Client)
    report = client.post("/api/console/checks/endpoints").json()
    assert report["checked"] == len(console_module.SMOKE_ENDPOINTS) and report["failed"] == 1
    assert all("duration_ms" in r for r in report["results"])
    assert ("GET", "/api/health") in calls


def test_test_runner_uses_an_isolated_database_and_reports_status(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "console_dir", str(tmp_path / "console"))
    captured = {}

    class _Proc:
        pid = 4242
        returncode = None
        polls = 0
        def __init__(self, cmd, cwd, env, stdout, stderr):
            captured.update(cmd=cmd, cwd=cwd, env=env)
            stdout.write(b"...F\nFAILED tests/test_x.py::test_y - boom\n1 failed, 3 passed in 1.0s\n")
        def poll(self):  # still running when start() reports, finished on the next status() call
            self.polls += 1
            if self.polls == 1:
                return None
            self.returncode = 1
            return 1
        def terminate(self): pass

    monkeypatch.setattr(console_module.subprocess, "Popen", _Proc)
    console_module.test_runner._process = None
    started = client.post("/api/console/tests/run", json={"selection": "tests/test_health_endpoint.py"}).json()
    assert started["status"] == "running" and started["selection"] == "tests/test_health_endpoint.py"
    assert captured["env"]["DATABASE_URL"].startswith("sqlite:///") and "console-tests.db" in captured["env"]["DATABASE_URL"]
    assert captured["env"]["DATABASE_URL"] != settings.database_url, "the suite must never run against the workbench database"
    assert captured["env"]["ENABLE_AI_FEATURES"] == "false" and str(captured["cwd"]).endswith("backend")
    assert "tests/test_health_endpoint.py" in captured["cmd"]

    status = client.get("/api/console/tests/status").json()
    assert status["status"] == "failed" and status["returncode"] == 1
    assert status["summary"] == "1 failed, 3 passed in 1.0s" and status["failed_tests"] == ["FAILED tests/test_x.py::test_y - boom"]

    assert client.post("/api/console/tests/run", json={"selection": "$(rm -rf /)"}).status_code == 400
    console_module.test_runner._process = None


def test_app_log_records_requests_and_unhandled_errors_and_is_readable(tmp_path: Path, monkeypatch):
    log = tmp_path / "app.jsonl"
    from app.core.app_log import configure_app_logging
    configure_app_logging(log)
    # A schema bootstrap (alembic's fileConfig) must not have switched the app logger off:
    # that is exactly what happens in production at startup, and it was caught here.
    import logging
    assert logging.getLogger("journalism.request").disabled is False
    r = client.get("/api/health")
    rid = r.headers["x-request-id"]
    view = read_app_log(log, request_id=rid)
    assert view["returned"] == 1 and view["records"][0]["status_code"] == 200 and view["records"][0]["path"] == "/api/health"
    assert view["records"][0]["duration_ms"] >= 0

    # An unhandled exception is logged with its traceback and surfaced as a 500 carrying the request id.
    @app.get("/api/__console_test_boom", include_in_schema=False)
    def boom():  # type: ignore[no-untyped-def]
        raise RuntimeError("kaboom")
    try:
        r = TestClient(app, raise_server_exceptions=False).get("/api/__console_test_boom")
        assert r.status_code == 500 and r.headers["x-request-id"] in r.json()["detail"]
        errors = read_app_log(log, level="ERROR", contains="kaboom")
        assert errors["returned"] >= 1 and "RuntimeError: kaboom" in errors["records"][0]["exception"]
    finally:
        app.router.routes[:] = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/api/__console_test_boom"]

    monkeypatch.setattr(settings, "app_log_file", str(log))
    via_api = client.get("/api/console/logs", params={"level": "ERROR", "limit": 5}).json()
    assert via_api["returned"] >= 1 and via_api["records"][0]["level"] == "ERROR"
    assert read_app_log(tmp_path / "missing.jsonl")["returned"] == 0
    # Never contains a bearer token even when one was sent.
    client.get("/api/health", headers={"authorization": "Bearer super-secret"})
    assert "super-secret" not in log.read_text()


def test_backend_serves_the_static_console_page():
    r = client.get("/console")
    assert r.status_code == 200 and "BACKEND CONSOLE" in r.text and "/api/console" in r.text
