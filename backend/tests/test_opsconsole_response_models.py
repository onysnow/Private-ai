"""The operator console's response models must not drop data (Foundation Fixes fix 2).

The same rule as tests/test_response_models.py, for opsconsole (ADR-0003),
whose routes are mounted on the workbench and so are part of its OpenAPI
schema: each route's own function is called, as FastAPI calls it before
filtering the reply through the route's response model, and the model must
let that reply through unchanged. The fixture host of
tests/test_opsconsole_package.py exercises every section it mounts; the
workbench itself covers the sections that host leaves out (backups,
migrations) and the parts the package leaves to its host (the workbench's
tiles, checks, users and settings).
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Iterator

import httpx
import pytest
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from starlette.requests import Request

from opsconsole import schemas
from opsconsole.core.traffic import iter_api_routes
from test_opsconsole_package import make_host

PREFIX = "/api/console"


def _same_through_model(model: Any, raw: Any) -> None:
    unfiltered = jsonable_encoder(raw)
    adapter = TypeAdapter(model)
    filtered = adapter.dump_python(adapter.validate_python(raw), mode="json")
    assert filtered == unfiltered, f"{model} changes the reply"


class Console:
    """Calls a console route's own function with a local request and checks
    the reply against the route's declared response model."""

    def __init__(self, app: FastAPI) -> None:
        self.app = app
        self.routes = {(method, path): route for path, route in iter_api_routes(list(app.routes)) for method in (route.methods or set())}
        self.checked: set[tuple[str, str]] = set()

    def request(self) -> Request:
        return Request({"type": "http", "method": "GET", "path": "/", "raw_path": b"/", "query_string": b"", "scheme": "http",
                        "headers": [(b"host", b"127.0.0.1")], "client": ("127.0.0.1", 50000), "server": ("127.0.0.1", 80), "app": self.app})

    def check(self, method: str, path: str, *args: Any, **params: Any) -> Any:
        route = self.routes[(method, PREFIX + path)]
        raw = route.endpoint(self.request(), *args, **params)
        assert route.response_model is not None, f"{method} {path} declares no response model"
        _same_through_model(route.response_model, raw)
        self.checked.add((method, path))
        return raw


def _wait(console_handle: Any, run_id: str, timeout: float = 30.0) -> dict[str, Any]:
    """Until the run is finished in the store and the supervisor has let go of
    its kind: the supervisor records the finish first (TaskSupervisor._execute),
    so a run of the same kind started in between is refused as already running."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        row = console_handle.store.run_get(run_id)
        if row and row["status"] != "running" and not console_handle.supervisor.is_running(row["kind"]):
            return row
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} did not finish")


@pytest.fixture
def fixture_host(tmp_path: Path) -> Iterator[tuple[TestClient, Any, dict[str, Any], Console]]:
    app, handle, parts = make_host(tmp_path)
    with TestClient(app) as client:
        yield client, handle, parts, Console(app)
    handle.shutdown()


def test_fixture_host_replies(fixture_host: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from opsconsole.api import apiplay
    from opsconsole.api.checks import RunIn as ChecksRunIn
    from opsconsole.api.data import ApplyIn, BulkIn, ChangeSetIn
    from opsconsole.api.query import ExplainIn, RunIn as QueryRunIn, SavedIn
    from opsconsole.api.tests import RunIn as TestsRunIn
    from opsconsole.api.apiplay import CollectionIn, SendIn
    from opsconsole.api.config_section import FlagIn
    from opsconsole.api.users import ConfirmIn, DisabledIn, IssueIn, RolesIn

    client, handle, parts, console = fixture_host
    for _ in range(3):
        client.get("/ping")   # traffic for the API section

    # Overview.
    manifest = console.check("GET", "/manifest")
    assert {s["id"] for s in manifest["sections"]} >= {"logs", "tests", "users"} and any("sources" in s for s in manifest["sections"])
    board = console.check("GET", "/health", tiles=None)
    assert {t["state"] for t in board["tiles"]} >= {"ok", "error"}
    console.check("GET", "/health/server")

    # Data: tables, one table, a page of rows (with and without filters), one row.
    console.check("GET", "/data/tables")
    console.check("GET", "/data/tables/{name}", "authors")
    console.check("GET", "/data/tables/{name}", "book_tags")
    rows = console.check("GET", "/data/tables/{name}/rows", "books", limit=2, cursor=None, offset=0, sort="id", order="asc", q=None, with_count=True)
    assert rows["next"]
    console.check("GET", "/data/tables/{name}/rows", "authors", limit=None, cursor=None, offset=0, sort=None, order="desc", q="Ann", with_count=True)
    console.check("GET", "/data/tables/{name}/rows/{pk}", "authors", "a1")
    console.check("GET", "/data/tables/{name}/rows/{pk}", "book_tags", json.dumps({"book_id": 1, "tag_id": 1}))

    # Change-sets: a preview with an update, an insert with a warning and a
    # delete; applied; one with an error, discarded; a bulk; an undo.
    preview = console.check("POST", "/data/changesets", ChangeSetIn(table="books", ops=[
        {"op": "update", "pk": {"id": 1}, "set": {"price": "11.25"}},
        {"op": "insert", "set": {"id": 9, "author_id": "nobody", "title": "Orphan"}},
        {"op": "delete", "pk": {"id": 3}},
    ]))
    assert preview["ops"][0]["changed"] == ["price"] and preview["ops"][1]["warnings"]
    console.check("GET", "/data/changesets/{cid}", preview["id"])
    applied = console.check("POST", "/data/changesets/{cid}/apply", preview["id"], ApplyIn(confirm=preview["id"]))
    assert applied["applied"] == 3
    broken = console.check("POST", "/data/changesets", ChangeSetIn(table="books", ops=[{"op": "delete", "pk": {"id": 12345}}]))
    assert broken["errors"] == 1
    console.check("POST", "/data/changesets/{cid}/discard", broken["id"])
    console.check("POST", "/data/tables/{name}/bulk", "books", BulkIn(op="update", set={"price": 1.0}, filters={"author_id": "eq:a1"}))
    console.check("GET", "/data/changesets", status=None, limit=50)

    # Activity: the list, one entry, and an undo (a change-set that reverses it).
    activity = console.check("GET", "/activity", limit=100, principal=None, section=None, table=None, since=None, changeset_id=preview["id"])
    deleted = next(a for a in activity["items"] if a["action"] == "row.delete")
    console.check("GET", "/activity/{aid}", deleted["id"])
    undo = console.check("POST", "/activity/{aid}/undo", deleted["id"])
    assert undo["undoes"] == deleted["id"]

    # Schema.
    console.check("GET", "/schema/map")
    console.check("GET", "/schema/dictionary")

    # Query workbench: a capped read, a write, a plan, saved queries, history.
    read = console.check("POST", "/query/run", QueryRunIn(sql="SELECT id, title, price FROM books ORDER BY id", max_rows=2))
    assert read["truncated"]
    console.check("POST", "/query/run", QueryRunIn(sql="UPDATE books SET price = 5 WHERE id = 1", mode="write", confirm="write"))
    console.check("POST", "/query/explain", ExplainIn(sql="SELECT * FROM books WHERE author_id = 'a1'"))
    saved = console.check("POST", "/query/saved", SavedIn(name="cheap", sql="SELECT * FROM books WHERE price < :p", params=[{"name": "p", "value": 10}], pinned=True))
    console.check("PUT", "/query/saved/{qid}", saved["id"], SavedIn(name="cheap books", sql=saved["sql"]))
    console.check("GET", "/query/saved")
    console.check("DELETE", "/query/saved/{qid}", saved["id"])
    console.check("GET", "/query/history", limit=50)

    # API playground. The replay is answered by a stand-in for this server
    # (the test client has no socket to send it to).
    def answered(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": "yes"}, headers={"x-request-id": "req-9"})

    real_client = httpx.Client
    monkeypatch.setattr(apiplay.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(answered), **kw))
    sent = console.check("POST", "/api/send", SendIn(method="GET", path="/ping"))
    assert sent["body"] == {"ok": "yes"} and sent["request_id"] == "req-9"
    routes = console.check("GET", "/api/routes")
    assert any(r["traffic"] for r in routes["items"]) and any(r["params"] for r in routes["items"])
    console.check("GET", "/api/traffic", since_seconds=None)
    console.check("GET", "/api/traffic/recent", limit=100, route=None)
    probes = console.check("POST", "/api/probes/run")
    _wait(handle, probes["id"])
    collection = console.check("POST", "/api/collections", CollectionIn(name="smoke", requests=[{"method": "GET", "path": "/ping"}]))
    console.check("GET", "/api/collections")
    console.check("DELETE", "/api/collections/{cid}", collection["id"])

    # Users and roles.
    console.check("GET", "/users")
    console.check("GET", "/users/roles")
    console.check("POST", "/users/{uid}/roles", "u2", RolesIn(roles=["admin"], confirm="u2"))
    console.check("POST", "/users/{uid}/disabled", "u2", DisabledIn(disabled=True, confirm="u2"))
    issued = console.check("POST", "/users/{uid}/tokens", "u1", IssueIn(confirm="u1", ttl_seconds=3600))
    console.check("POST", "/users/tokens/{tid}/revoke", issued["token_id"], ConfirmIn(confirm=issued["token_id"]))
    users = console.check("GET", "/users")
    assert any(u["tokens"] for u in users["items"])

    # Tests: the tree, a run that fails, a re-run of the failure, the history, a log, a cancel.
    console.check("GET", "/tests/tree", refresh=False)
    started = console.check("POST", "/tests/run", TestsRunIn(selection=None))
    _wait(handle, started["id"])
    console.check("GET", "/tests/runs/{rid}", started["id"], tail=60)
    console.check("GET", "/tests/runs/{rid}/log", started["id"])
    rerun = console.check("POST", "/tests/rerun-failed")
    _wait(handle, rerun["id"])
    parts["runner"].blocking = True
    blocked = console.check("POST", "/tests/run", None)
    console.check("GET", "/tests/runs", limit=20)
    cancelled = console.check("POST", "/tests/runs/{rid}/cancel", blocked["id"])
    assert cancelled["live"] is True
    _wait(handle, blocked["id"])
    parts["runner"].blocking = False

    # Logs: the sources, a JSONL source with its own keys, the console's activity, a missing file.
    console.check("GET", "/logs/sources")
    app_log = console.check("GET", "/logs/{source}", "app", limit=200, level=None, request_id=None, logger=None, contains=None, since=None, follow=False)
    assert app_log["available"] is True
    console.check("GET", "/logs/{source}", "activity", limit=200, level=None, request_id=None, logger=None, contains=None, since=None, follow=False)
    parts["log_file"].rename(tmp_path / "moved.jsonl")
    missing = console.check("GET", "/logs/{source}", "app", limit=200, level=None, request_id=None, logger=None, contains=None, since=None, follow=False)
    assert missing["available"] is False and missing["reason"]

    # Checks: the registry, a full run (one host check fails), its detail, the history.
    with parts["engine"].begin() as conn:
        conn.exec_driver_sql("INSERT INTO books (id, author_id, title, price) VALUES (77, 'ghost', 'Orphan', 0)")
    checks_run = console.check("POST", "/checks/run", ChecksRunIn(only=None))
    _wait(handle, checks_run["id"])
    detail = console.check("GET", "/checks/runs/{rid}", checks_run["id"])
    assert any(r["samples"] for r in detail["results"])
    console.check("GET", "/checks")
    console.check("GET", "/checks/runs", limit=20)

    # Config: the effective settings and a runtime flag.
    console.check("GET", "/config")
    console.check("POST", "/config/flags/{name}", "debug", FlagIn(value="true", confirm="debug"))

    # The board again, now that tests and checks have run.
    console.check("GET", "/health", tiles=None)
    console.check("GET", "/manifest")

    # Every route this host mounts is proven here, except the two that stream
    # (their entries say so, see test_every_console_route_declares_its_reply).
    mounted = {(method, path[len(PREFIX):]) for method, path in console.routes if path.startswith(PREFIX)}
    assert mounted - console.checked == {("GET", "/events"), ("GET", "/data/tables/{name}/export")}


@pytest.fixture
def workbench(tmp_path: Path) -> Iterator[tuple[TestClient, Any, Console]]:
    from app.core.config import Settings
    from app.db.session import Base, engine
    from app.main import create_app

    # create_app(bootstrap_schema=False) leaves the tables to the caller; without
    # this the test passed only when an earlier test in the run had made them.
    Base.metadata.create_all(engine)
    settings = Settings(console_dir=str(tmp_path / "console"), console_writes="changesets_and_sql",
                        app_log_file=str(tmp_path / "app.jsonl"), audit_log_file=str(tmp_path / "audit.jsonl"))
    app = create_app(settings, bootstrap_schema=False)
    with TestClient(app) as client:
        yield client, app.state.opsconsole, Console(app)
    app.state.opsconsole.shutdown()


def test_workbench_host_replies(workbench: Any) -> None:
    """The sections the fixture host leaves out (backups, migrations) and
    the workbench's own tiles, checks, users and settings."""
    from opsconsole.api.backups import CreateIn
    from opsconsole.api.checks import RunIn as ChecksRunIn
    from opsconsole.api.query import ExplainIn
    from opsconsole.api.schema import PlanIn

    client, handle, console = workbench
    inv = client.post("/api/investigations", json={"name": "Console backup"}).json()
    client.get("/api/health")

    console.check("GET", "/manifest")
    console.check("GET", "/health", tiles=None)
    console.check("GET", "/users")
    console.check("GET", "/users/roles")
    console.check("GET", "/config")
    console.check("GET", "/logs/sources")
    console.check("GET", "/logs/{source}", "security", limit=200, level=None, request_id=None, logger=None, contains=None, since=None, follow=False)
    console.check("POST", "/query/explain", ExplainIn(sql="SELECT id FROM investigations"))

    # Migrations: where the database stands and the SQL an upgrade would run.
    state = console.check("GET", "/schema/migrations")
    assert state["history"] and state["heads"]
    console.check("POST", "/schema/migrations/plan", PlanIn(target="head"))

    # Backups: one investigation exported, listed, planned, and the run history.
    created = console.check("POST", "/backups", CreateIn(kind="investigation_export", selection=inv["id"]))
    _wait(handle, created["id"])
    backups = console.check("GET", "/backups")
    backup = backups["providers"][0]["items"][0]
    assert backup["verified"] is True
    plan = console.check("POST", "/backups/{bid}/restore/plan", backup["id"], kind="investigation_export")
    assert plan["warnings"], "the investigation still exists, so the plan says the restore is blocked"
    console.check("GET", "/backups/runs", limit=20)

    # The workbench's own checks.
    run = console.check("POST", "/checks/run", ChecksRunIn(only=["evidence_has_source", "orphaned_rows", "tables_present"]))
    _wait(handle, run["id"])
    console.check("GET", "/checks/runs/{rid}", run["id"])
    console.check("GET", "/checks")

    # Of the routes the fixture host does not mount, only the ones that
    # change the database or start a restore are left: their replies are the
    # run status every other run start above already proves.
    fixture_only = {("GET", "/events"), ("GET", "/data/tables/{name}/export")}
    leftover = {(m, p[len(PREFIX):]) for m, p in console.routes if p.startswith(PREFIX) and (p.startswith(PREFIX + "/backups") or "/migrations" in p)} - console.checked
    assert leftover - fixture_only == {("POST", "/schema/migrations/upgrade"), ("POST", "/backups/{bid}/restore"), ("GET", "/backups/{kind}/{bid}/download")}


def test_every_console_route_declares_its_reply() -> None:
    """Every console route has a response model, or says it sends a file or a stream."""
    from app.main import create_app

    schema = create_app(bootstrap_schema=False).openapi()
    for path, operations in schema["paths"].items():
        if not path.startswith(PREFIX):
            continue
        for method, operation in operations.items():
            content = operation["responses"]["200"].get("content", {})
            assert content and all(entry.get("schema") for entry in content.values()), f"{method.upper()} {path}"


def test_console_error_model_matches_a_refusal(fixture_host: Any) -> None:
    client, _, _, _ = fixture_host
    refused = client.get(f"{PREFIX}/data/tables/nope")
    assert refused.status_code == 404
    _same_through_model(schemas.ConsoleErrorOut, refused.json())
