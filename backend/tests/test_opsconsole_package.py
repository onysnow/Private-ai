"""opsconsole, exercised against a fixture host that is not the workbench:
four tables (two FKs, a composite key, a JSON column), a fake test runner, a
JSONL log, static users, one host check and one host tile. Proves the package
holds on its own (ADR-0003) and that every section behaves per
docs/opsconsole/DESIGN.md.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Sequence

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from opsconsole import Check, CheckResult, ConsoleConfig, Probe, TablePolicy, TestNode, TestSummary, Tile, TileProvider, WritePolicy, mount
from opsconsole.adapters.auth_policies import LoopbackOnly
from opsconsole.adapters.jsonl_log import JsonlLogSource
from opsconsole.adapters.static_users import StaticUsers
from opsconsole.protocols import LogFilter, RoleRecord, RunHandle, UserRecord


# --- fixture host ------------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class Author(Base):
    """People who write books."""

    __tablename__ = "authors"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime(2026, 1, 1))
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    api_key: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Book(Base):
    __tablename__ = "books"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("authors.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    price: Mapped[float] = mapped_column(Float, default=0.0)


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(50), unique=True)


class BookTag(Base):
    __tablename__ = "book_tags"
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)   # deliberately unindexed FK


class DemoSettings(BaseSettings):
    debug: bool = False
    page_size: int = 25
    api_secret: str = "hunter2-secret"
    label: str = "demo"


class FakeRunner:
    def __init__(self) -> None:
        self.calls: list[str | None] = []
        self.block = threading.Event()
        self.blocking = False

    def collect(self) -> list[TestNode]:
        return [TestNode("tests/test_a.py", "file"), TestNode("tests/test_a.py::test_one", "test", "tests/test_a.py", "test_one"), TestNode("tests/test_a.py::test_two", "test", "tests/test_a.py", "test_two")]

    def run(self, selection: str | None, handle: RunHandle) -> int:
        self.calls.append(selection)
        handle.log("collecting ...")
        if self.blocking:
            while not handle.cancelled and not self.block.wait(0.05):
                pass
            handle.log("stopped")
            return 130
        if selection and "test_two" in selection:
            for line in (".", "1 passed in 0.1s"):
                handle.log(line)
            return 0
        # Logged one physical line per handle.log() call, like a real streamed subprocess --
        # parse_summary() (and the real PytestRunner adapter) match against individual lines
        # (e.g. line.startswith("FAILED ")), which a single multi-line blob would never satisfy.
        for line in ("F.", "FAILED tests/test_a.py::test_two - boom", "1 failed, 1 passed in 0.2s"):
            handle.log(line)
        return 1

    def parse_summary(self, lines: Sequence[str]) -> TestSummary:
        s = TestSummary()
        for line in lines:
            if "passed" in line and "in " in line:
                s.line = line
                if "failed" in line:
                    s.failed = int(line.split(" failed")[0].split()[-1])
                s.passed = int(line.split(" passed")[0].split()[-1])
            if line.startswith("FAILED "):
                s.failed_ids.append(line.split()[1])
        return s


def _is_local(request: Request) -> bool:
    return request.headers.get("x-remote") != "1"


def make_host(tmp_path: Path, *, writes: WritePolicy = WritePolicy.CHANGESETS_AND_SQL, **overrides: Any) -> tuple[FastAPI, Any, Any]:
    tmp_path.mkdir(parents=True, exist_ok=True)  # callers may pass a not-yet-created subdir (e.g. tmp_path / "bare")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([Author(id="a1", name="Ann", meta={"k": 1}, api_key="sk-live-abcd"), Author(id="a2", name="Bob", active=False)])
        db.add_all([Book(id=1, author_id="a1", title="First", price=9.5), Book(id=2, author_id="a1", title="Second", price=12.0), Book(id=3, author_id="a2", title="Third")])
        db.add_all([Tag(id=1, label="fiction"), Tag(id=2, label="history"), BookTag(book_id=1, tag_id=1), BookTag(book_id=2, tag_id=1)])
        db.commit()
    log_file = tmp_path / "app.jsonl"
    log_file.write_text("\n".join(json.dumps(x) for x in [
        {"ts": "2026-09-22T10:00:00+00:00", "level": "INFO", "logger": "demo", "message": "started", "request_id": None},
        {"ts": "2026-09-22T10:00:01+00:00", "level": "ERROR", "logger": "demo.web", "message": "kaboom", "request_id": "req-1"},
        {"ts": "2026-09-22T10:00:02+00:00", "level": "INFO", "logger": "demo.web", "message": "GET /x", "request_id": "req-2"},
    ]) + "\n")

    def orphan_free_books(db: Session) -> CheckResult:
        rows = db.execute(select(Book.id).where(~Book.author_id.in_(select(Author.id)))).scalars().all()
        return CheckResult(count=len(rows), samples=list(rows), table="books", hint="books without an author")

    def bad_tile(db: Session) -> Tile:
        raise RuntimeError("tile exploded")

    def good_tile(db: Session) -> Tile:
        return Tile(state="ok", headline="fine", details={"n": 1})

    runner = FakeRunner()
    users = StaticUsers([UserRecord(id="u1", label="Ann", roles=["admin"]), UserRecord(id="u2", label="Bob", roles=["viewer"])], [RoleRecord("admin"), RoleRecord("viewer")])
    settings = DemoSettings()
    kwargs: dict[str, Any] = dict(
        metadata=Base.metadata, engine=engine, session_factory=factory, auth=LoopbackOnly(_is_local), console_dir=tmp_path / "console",
        settings=settings, env_file=tmp_path / ".env", tests=runner, log_sources=[JsonlLogSource(log_file, id="app")], users=users,
        checks=[Check(id="books_have_author", title="Books have an author", run=orphan_free_books)],
        tiles=[TileProvider(id="host_ok", title="Host", run=good_tile), TileProvider(id="host_bad", title="Broken", run=bad_tile)],
        mutable_flags=("debug", "page_size"), writes=writes,
        table_policy=TablePolicy(readonly=frozenset({"tags"}), masked_columns=frozenset({"authors.api_key"})),
        app_name="Demo", domain_of_table=lambda n: "library" if n in ("authors", "books") else "taxonomy", table_docs=lambda n: {"authors": Author.__doc__}.get(n),
        api_probe_suite=(Probe("GET", "/ping", (200,), "ping"),),
    )
    kwargs.update(overrides)
    config = ConsoleConfig(**kwargs)
    app = FastAPI()

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"ok": "yes"}

    handle = mount(app, config)
    return app, handle, {"engine": engine, "factory": factory, "runner": runner, "users": users, "settings": settings, "log_file": log_file}


@pytest.fixture
def host(tmp_path: Path) -> Iterator[tuple[TestClient, Any, dict[str, Any]]]:
    app, handle, parts = make_host(tmp_path)
    with TestClient(app) as client:
        yield client, handle, parts
    handle.shutdown()


def _wait_run(client: TestClient, path: str, rid: str, timeout: float = 5.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = client.get(f"{path}/{rid}").json()
        if status["status"] != "running":
            return status
        time.sleep(0.05)
    raise AssertionError("run did not finish")


# --- manifest, auth, envelope ------------------------------------------------------------------

def test_manifest_lists_only_wired_sections_and_remote_callers_are_refused(host: Any, tmp_path: Path) -> None:
    client, handle, _ = host
    m = client.get("/api/console/manifest").json()
    ids = [s["id"] for s in m["sections"]]
    assert ids == ["overview", "data", "schema", "query", "api", "users", "tests", "logs", "checks", "config", "activity"]
    assert m["app_name"] == "Demo" and m["writes"] == "changesets_and_sql" and m["principal"]["can_write"] is True
    assert "issue_token" in next(s for s in m["sections"] if s["id"] == "users")["capabilities"]
    denied = client.get("/api/console/manifest", headers={"x-remote": "1"})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"

    bare_app, bare, _ = make_host(tmp_path / "bare", tests=None, users=None, log_sources=(), settings=None, writes=WritePolicy.DISABLED, ui_path=None)
    with TestClient(bare_app) as c2:
        m2 = c2.get("/api/console/manifest").json()
        assert [s["id"] for s in m2["sections"]] == ["overview", "data", "schema", "query", "api", "checks", "activity"]
        assert m2["principal"]["can_write"] is False
        assert c2.get("/api/console/tests/tree").status_code == 404 and c2.get("/console").status_code == 404
        assert c2.post("/api/console/data/changesets", json={"table": "books", "ops": [{"op": "delete", "pk": {"id": 1}}]}).json()["error"]["code"] == "writes_disabled"
    bare.shutdown()


def test_ui_is_served_with_prefix_and_frame_policy(host: Any) -> None:
    client, _, _ = host
    page = client.get("/console")
    assert page.status_code == 200 and "/api/console" in page.text and "Demo" in page.text
    assert page.headers["content-security-policy"].startswith("frame-ancestors")
    assert client.get("/console/console.js").status_code == 200 and client.get("/console/console.css").status_code == 200
    assert client.get("/console/evil.js").status_code == 404


# --- overview ---------------------------------------------------------------------------------

def test_health_board_merges_builtin_and_host_tiles_and_isolates_failures(host: Any) -> None:
    client, _, _ = host
    board = client.get("/api/console/health").json()
    tiles = {t["id"]: t for t in board["tiles"]}
    assert {"database", "server", "console", "tests", "checks", "host_ok", "host_bad"} <= set(tiles)
    assert tiles["database"]["state"] == "ok" and "sqlite" in tiles["database"]["headline"]
    assert tiles["host_bad"]["state"] == "error" and "tile exploded" in tiles["host_bad"]["headline"]
    assert tiles["host_ok"]["state"] == "ok" and board["overall"] == "error"
    assert client.get("/api/console/health", params={"tiles": "server"}).json()["tiles"][0]["id"] == "server"
    srv = client.get("/api/console/health/server").json()
    assert srv["pid"] > 0 and srv["uptime_seconds"] >= 0 and "console_dir" in srv["disks"]


def test_event_bus_streams_and_reports_gaps(host: Any) -> None:
    _, handle, _ = host
    bus = handle.bus
    stop = threading.Event()
    stream = bus.stream(frozenset({"activity"}), keepalive_seconds=0.2, stop=stop)
    hello = next(stream)
    assert hello.startswith("event: hello")
    bus.publish("activity", {"n": 1})
    bus.publish("logs:app", {"ignored": True})
    got = next(stream)
    assert got.startswith("event: activity") and '"n": 1' in got
    assert next(stream).startswith(": keepalive")
    stop.set()
    stream.close()
    assert bus.subscribers == 0


# --- data -------------------------------------------------------------------------------------

def test_browse_filters_sorts_pages_and_masks(host: Any) -> None:
    client, _, _ = host
    tables = {t["name"]: t for t in client.get("/api/console/data/tables").json()["items"]}
    assert tables["books"]["rows"] == 3 and tables["books"]["references"] == ["authors"] and "book_tags" in tables["books"]["referenced_by"]
    assert tables["tags"]["readonly"] is True and tables["authors"]["domain"] == "library"
    detail = client.get("/api/console/data/tables/authors").json()
    assert detail["doc"] == "People who write books." and next(c for c in detail["columns"] if c["name"] == "api_key")["masked"] is True
    assert next(c for c in detail["columns"] if c["name"] == "meta")["kind"] == "json"

    rows = client.get("/api/console/data/tables/books/rows", params={"sort": "id", "order": "asc", "limit": 2}).json()
    assert [r["id"] for r in rows["items"]] == [1, 2] and rows["next"] and rows["keyset"] is True and rows["total"] == 3
    page2 = client.get("/api/console/data/tables/books/rows", params={"sort": "id", "order": "asc", "limit": 2, "cursor": rows["next"]}).json()
    assert [r["id"] for r in page2["items"]] == [3] and page2["next"] is None

    filtered = client.get("/api/console/data/tables/books/rows", params={"filter[author_id]": "eq:a1", "filter[price]": "gte:10"}).json()
    assert [r["title"] for r in filtered["items"]] == ["Second"] and filtered["total"] == 1
    assert [r["title"] for r in client.get("/api/console/data/tables/books/rows", params={"q": "ird"}).json()["items"]] == ["Third"]
    assert client.get("/api/console/data/tables/books/rows", params={"filter[nope]": "eq:1"}).json()["error"]["code"] == "bad_request"

    masked = client.get("/api/console/data/tables/authors/rows").json()["items"]
    assert all(r["api_key"] in ("••••", None) for r in masked) and "sk-live" not in json.dumps(masked)
    assert client.get("/api/console/data/tables/authors/rows", params={"filter[api_key]": "like:sk"}).status_code == 400

    one = client.get("/api/console/data/tables/authors/rows/a1").json()
    assert one["row"]["name"] == "Ann" and {r["table"]: r["count"] for r in one["related"]}["books"] == 2
    assert client.get("/api/console/data/tables/authors/rows/zz").status_code == 404
    composite = client.get("/api/console/data/tables/book_tags/rows/" + json.dumps({"book_id": 1, "tag_id": 1})).json()
    assert composite["row"] == {"book_id": 1, "tag_id": 1}

    csv_text = client.get("/api/console/data/tables/books/export", params={"fmt": "csv", "filter[author_id]": "eq:a2"}).text
    assert csv_text.splitlines()[0] == "id,author_id,title,price" and "Third" in csv_text and "First" not in csv_text
    exported = client.get("/api/console/data/tables/authors/export", params={"fmt": "json"}).json()
    assert len(exported) == 2 and "sk-live" not in json.dumps(exported)
    activity = client.get("/api/console/activity", params={"section": "data"}).json()["items"]
    assert any(a["action"] == "export" for a in activity)


def test_changesets_preview_apply_guard_undo_and_bulk(host: Any) -> None:
    client, handle, parts = host
    # preview: type coercion, FK warning, missing required column
    cs = client.post("/api/console/data/changesets", json={"table": "books", "ops": [
        {"op": "update", "pk": {"id": 1}, "set": {"price": "11.25", "title": "First, revised"}},
        {"op": "insert", "set": {"id": 9, "author_id": "nobody", "title": "Orphan"}},
        {"op": "delete", "pk": {"id": 3}},
    ]}).json()
    assert cs["status"] == "pending" and cs["errors"] == 0
    upd, ins, dele = cs["ops"]
    assert upd["before"]["price"] == 9.5 and upd["after"]["price"] == 11.25 and upd["changed"] == ["price", "title"]
    assert ins["warnings"] and "authors.id" in ins["warnings"][0]
    assert dele["before"]["title"] == "Third"
    assert client.post(f"/api/console/data/changesets/{cs['id']}/apply", json={"confirm": "wrong"}).json()["error"]["code"] == "confirm_mismatch"
    applied = client.post(f"/api/console/data/changesets/{cs['id']}/apply", json={"confirm": cs["id"]}).json()
    assert applied["status"] == "applied" and applied["applied"] == 3
    with parts["factory"]() as db:
        assert db.get(Book, 1).price == 11.25 and db.get(Book, 3) is None and db.get(Book, 9).title == "Orphan"
    assert client.post(f"/api/console/data/changesets/{cs['id']}/apply", json={"confirm": cs["id"]}).json()["error"]["code"] == "already_applied"
    acts = client.get("/api/console/activity", params={"changeset_id": cs["id"]}).json()["items"]
    assert sorted(a["action"] for a in acts) == ["row.delete", "row.insert", "row.update"] and all(a["state"] == "committed" for a in acts)

    # optimistic guard: the row changed underneath
    stale = client.post("/api/console/data/changesets", json={"table": "books", "ops": [{"op": "update", "pk": {"id": 2}, "set": {"title": "Second!"}}]}).json()
    with parts["factory"]() as db:
        db.get(Book, 2).price = 99.0
        db.commit()
    r = client.post(f"/api/console/data/changesets/{stale['id']}/apply", json={"confirm": stale["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "changed_underneath" and "price" in r.json()["error"]["message"]
    assert client.get(f"/api/console/data/changesets/{stale['id']}").json()["status"] == "rejected"
    assert client.get("/api/console/activity", params={"changeset_id": stale["id"]}).json()["items"][0]["state"] == "failed"

    # errors block apply; discard works; readonly and masked refused; bad values named
    bad = client.post("/api/console/data/changesets", json={"table": "books", "ops": [{"op": "delete", "pk": {"id": 12345}}]}).json()
    assert bad["errors"] == 1 and client.post(f"/api/console/data/changesets/{bad['id']}/apply", json={"confirm": bad["id"]}).json()["error"]["code"] == "has_errors"
    assert client.post(f"/api/console/data/changesets/{bad['id']}/discard").json()["status"] == "discarded"
    assert client.post("/api/console/data/changesets", json={"table": "tags", "ops": [{"op": "delete", "pk": {"id": 1}}]}).json()["error"]["code"] == "readonly_table"
    assert client.post("/api/console/data/changesets", json={"table": "authors", "ops": [{"op": "update", "pk": {"id": "a1"}, "set": {"api_key": "x"}}]}).json()["error"]["code"] == "masked_column"
    assert "price" in client.post("/api/console/data/changesets", json={"table": "books", "ops": [{"op": "update", "pk": {"id": 1}, "set": {"price": "lots"}}]}).json()["error"]["message"]

    # undo the delete of book 3 (an insert of its before-image)
    deleted = next(a for a in acts if a["action"] == "row.delete")
    undo = client.post(f"/api/console/activity/{deleted['id']}/undo").json()
    assert undo["origin"] == "undo" and undo["ops"][0]["op"] == "insert" and undo["ops"][0]["set"]["title"] == "Third"
    client.post(f"/api/console/data/changesets/{undo['id']}/apply", json={"confirm": undo["id"]})
    with parts["factory"]() as db:
        assert db.get(Book, 3).title == "Third"

    # bulk by filter -> preview capped and applied in one go
    bulk = client.post("/api/console/data/tables/books/bulk", json={"op": "update", "set": {"price": 1.0}, "filters": {"author_id": "eq:a1"}}).json()
    assert bulk["origin"] == "bulk" and len(bulk["ops"]) == 2
    client.post(f"/api/console/data/changesets/{bulk['id']}/apply", json={"confirm": bulk["id"]})
    with parts["factory"]() as db:
        assert {b.price for b in db.scalars(select(Book).where(Book.author_id == "a1"))} == {1.0}
    assert client.post("/api/console/data/tables/books/bulk", json={"op": "delete"}).json()["error"]["code"] == "unbounded"
    by_pk = client.post("/api/console/data/tables/books/bulk", json={"op": "delete", "pks": [{"id": 9}]}).json()
    assert by_pk["ops"][0]["before"]["title"] == "Orphan"
    # remote callers cannot write even with a valid change-set id
    assert client.post(f"/api/console/data/changesets/{by_pk['id']}/apply", json={"confirm": by_pk["id"]}, headers={"x-remote": "1"}).status_code == 403


# --- query ------------------------------------------------------------------------------------

def test_query_workbench_read_write_explain_saved_history(host: Any) -> None:
    client, _, parts = host
    ok = client.post("/api/console/query/run", json={"sql": "SELECT title FROM books ORDER BY id -- newest\n;", "max_rows": 2}).json()
    assert ok["columns"] == ["title"] and ok["returned"] == 2 and ok["truncated"] is True
    for bad in ("DELETE FROM books", "SELECT 1; DROP TABLE books", "PRAGMA table_info(books)", "WITH x AS (DELETE FROM books RETURNING id) SELECT * FROM x"):
        assert client.post("/api/console/query/run", json={"sql": bad}).json()["error"]["code"] == "bad_statement", bad
    assert client.post("/api/console/query/run", json={"sql": "SELECT * FROM nope"}).json()["error"]["code"] == "query_error"
    plan = client.post("/api/console/query/explain", json={"sql": "SELECT * FROM books WHERE author_id = 'a1'"}).json()
    assert plan["dialect"] == "sqlite" and "books" in plan["text"]

    assert client.post("/api/console/query/run", json={"sql": "UPDATE books SET price = 5 WHERE id = 1", "mode": "write"}).json()["error"]["code"] == "confirm_mismatch"
    w = client.post("/api/console/query/run", json={"sql": "UPDATE books SET price = 5 WHERE id = 1", "mode": "write", "confirm": "write"}).json()
    assert w["mode"] == "write" and w["rowcount"] == 1
    with parts["factory"]() as db:
        assert db.get(Book, 1).price == 5
    assert client.post("/api/console/query/run", json={"sql": "UPDATE books SET price = 5", "mode": "write", "confirm": "write"}, headers={"x-remote": "1"}).status_code == 403
    audit = client.get("/api/console/activity", params={"section": "query"}).json()["items"]
    assert audit[0]["action"] == "sql.write" and audit[0]["state"] == "committed" and "UPDATE books" in audit[0]["note"]

    saved = client.post("/api/console/query/saved", json={"name": "cheap", "sql": "SELECT * FROM books WHERE price < 10", "pinned": True}).json()
    assert client.get("/api/console/query/saved").json()["items"][0]["name"] == "cheap"
    client.put(f"/api/console/query/saved/{saved['id']}", json={"name": "cheap books", "sql": saved["sql"], "pinned": False})
    assert client.get("/api/console/query/saved").json()["items"][0]["name"] == "cheap books"
    assert client.delete(f"/api/console/query/saved/{saved['id']}").json()["deleted"] == saved["id"]
    history = client.get("/api/console/query/history").json()["items"]
    assert history[0]["mode"] == "write" and any(h["error"] for h in history)


# --- schema -----------------------------------------------------------------------------------

def test_schema_map_dictionary_and_no_alembic(host: Any) -> None:
    client, _, _ = host
    m = client.get("/api/console/schema/map").json()
    assert {(e["from_table"], e["to_table"]) for e in m["edges"]} == {("books", "authors"), ("book_tags", "books"), ("book_tags", "tags")}
    assert m["domains"] == ["library", "taxonomy"] and m["drift"]["missing_tables"] == []
    d = client.get("/api/console/schema/dictionary").json()
    assert d["unindexed_foreign_keys"] == ["book_tags.tag_id"]
    books = next(t for t in d["tables"] if t["name"] == "books")
    assert next(c for c in books["columns"] if c["name"] == "author_id")["references"] == [{"table": "authors", "column": "id"}]
    assert books["drift"] == {"missing_in_db": [], "extra_in_db": []}
    assert client.get("/api/console/schema/migrations").status_code == 404


# --- api --------------------------------------------------------------------------------------

def test_api_routes_traffic_send_probes_collections(host: Any) -> None:
    client, handle, _ = host
    for _ in range(3):
        client.get("/ping")
    client.get("/does-not-exist")
    routes = client.get("/api/console/api/routes").json()["items"]
    ping = next(r for r in routes if r["path"] == "/ping")
    assert ping["method"] == "GET" and ping["traffic"]["count"] >= 3 and ping["console"] is False
    assert any(r["path"] == "/api/console/manifest" and r["console"] for r in routes)
    traffic = client.get("/api/console/api/traffic").json()
    assert any(t["route"] == "/ping" and t["count"] >= 3 for t in traffic["items"]) and traffic["buffer"]["total"] >= 4
    recent = client.get("/api/console/api/traffic/recent", params={"route": "/ping"}).json()["items"]
    assert recent and all(r["route"] == "/ping" for r in recent)

    assert client.post("/api/console/api/send", json={"method": "GET", "path": "ping"}).json()["error"]["code"] == "bad_path"
    sent = client.post("/api/console/api/send", json={"method": "GET", "path": "/ping"})
    assert sent.status_code == 502 and sent.json()["error"]["code"] == "self_unreachable", "TestClient has no live socket; the real server answers itself"
    assert client.post("/api/console/api/send", json={"method": "GET", "path": "/ping", "act_as": "u1"}).json()["error"]["code"] == "act_as_unsupported"

    run = client.post("/api/console/api/probes/run").json()
    # Each probe makes a real HTTP round-trip to request.base_url ("http://testserver" under
    # TestClient, which has no live socket), so every one of the 3 probes here pays a real
    # DNS-resolution failure before the run reports "failed" -- that can take a couple of
    # seconds per probe depending on the host's resolver, so this budget is generous on purpose.
    deadline = time.time() + 30
    while time.time() < deadline and handle.store.run_get(run["id"])["status"] == "running":
        time.sleep(0.05)
    finished = handle.store.run_get(run["id"])
    assert finished["kind"] == "probes" and finished["status"] == "failed" and finished["summary"]["checked"] == 3

    col = client.post("/api/console/api/collections", json={"name": "smoke", "requests": [{"method": "GET", "path": "/ping"}]}).json()
    assert client.get("/api/console/api/collections").json()["items"][0]["requests"][0]["path"] == "/ping"
    assert client.delete(f"/api/console/api/collections/{col['id']}").json()["deleted"] == col["id"]


# --- tests ------------------------------------------------------------------------------------

def test_test_runner_streams_records_history_and_reruns_failed(host: Any) -> None:
    client, handle, parts = host
    tree = client.get("/api/console/tests/tree").json()
    assert tree["count"] == 2 and tree["items"][0]["kind"] == "file"
    assert client.post("/api/console/tests/run", json={"selection": "$(rm -rf /)"}).json()["error"]["code"] == "bad_selection"
    started = client.post("/api/console/tests/run", json={"selection": None}).json()
    assert started["status"] == "running" and started["kind"] == "tests"
    done = _wait_run(client, "/api/console/tests/runs", started["id"])
    assert done["status"] == "failed" and done["summary"]["failed"] == 1 and done["summary"]["failed_ids"] == ["tests/test_a.py::test_two"]
    assert "FAILED tests/test_a.py::test_two - boom" in done["tail"] and done["live"] is False
    assert client.get(f"/api/console/tests/runs/{started['id']}/log").json()["count"] >= 2
    rerun = client.post("/api/console/tests/rerun-failed").json()
    assert parts["runner"].calls[-1] == "tests/test_a.py::test_two"
    assert _wait_run(client, "/api/console/tests/runs", rerun["id"])["status"] == "passed"
    assert [r["status"] for r in client.get("/api/console/tests/runs").json()["items"]] == ["passed", "failed"]
    tile = next(t for t in client.get("/api/console/health", params={"tiles": "tests"}).json()["tiles"])
    assert tile["state"] == "ok" and "passed" in tile["headline"]

    parts["runner"].blocking = True
    blocked = client.post("/api/console/tests/run").json()
    assert client.post("/api/console/tests/run").json()["error"]["code"] == "already_running"
    cancelled = client.post(f"/api/console/tests/runs/{blocked['id']}/cancel").json()
    assert cancelled["live"] is True
    assert _wait_run(client, "/api/console/tests/runs", blocked["id"])["status"] == "cancelled"
    parts["runner"].blocking = False


def test_interrupted_runs_and_changesets_are_reconciled_at_next_open(tmp_path: Path) -> None:
    app, handle, parts = make_host(tmp_path)
    with TestClient(app) as client:
        client.get("/api/console/manifest")
        store = handle.store
        store.run_create(kind="tests", selection=None, principal_id="x", log_path=str(tmp_path / "gone.log"))
        store.changeset_create(principal_id="x", table="books", ops=[], origin="inline", ttl_seconds=1)
        store.changeset_update(store.changesets_list(limit=1)[0]["id"], status="applying", created_at="2000-01-01T00:00:00+00:00")
    handle.shutdown()
    app2, handle2, _ = make_host(tmp_path)
    with TestClient(app2) as client:
        client.get("/api/console/manifest")
        assert handle2.ctx.interrupted_runs == 1 and handle2.ctx.interrupted_changesets == 1
        assert handle2.store.runs_list(kind="tests", limit=1)[0]["status"] == "error"
        registry = client.get("/api/console/checks").json()["items"]
        assert any(c["id"] == "console_runs_interrupted" for c in registry)
    handle2.shutdown()


# --- logs -------------------------------------------------------------------------------------

def test_logs_sources_tail_filters_and_activity_source(host: Any, tmp_path: Path) -> None:
    client, _, parts = host
    sources = client.get("/api/console/logs/sources").json()["items"]
    assert [s["id"] for s in sources] == ["app", "activity"] and sources[0]["available"] is True
    tail = client.get("/api/console/logs/app").json()
    assert [x["message"] for x in tail["items"]] == ["GET /x", "kaboom", "started"], "newest first"
    assert [x["message"] for x in client.get("/api/console/logs/app", params={"level": "error"}).json()["items"]] == ["kaboom"]
    assert client.get("/api/console/logs/app", params={"request_id": "req-2"}).json()["returned"] == 1
    assert client.get("/api/console/logs/app", params={"logger": "demo.web", "contains": "kab"}).json()["returned"] == 1
    assert client.get("/api/console/logs/nope").status_code == 404
    client.post("/api/console/query/saved", json={"name": "n", "sql": "SELECT 1"})
    client.get("/api/console/data/tables/books/export")
    acts = client.get("/api/console/logs/activity").json()["items"]
    assert acts and acts[0]["logger"] == "data" and "export" in acts[0]["message"]
    missing = JsonlLogSource(tmp_path / "missing.jsonl", id="m")
    assert missing.available()[0] is False and missing.tail(limit=5, filters=LogFilter()) == []


def test_jsonl_follow_picks_up_appended_lines(tmp_path: Path) -> None:
    path = tmp_path / "f.jsonl"
    path.write_text('{"ts":"1","level":"INFO","message":"old"}\n')
    src = JsonlLogSource(path, id="f")
    gen = src.follow(from_end=True)
    assert next(gen) is None
    with path.open("a") as fh:
        fh.write('{"ts":"2","level":"WARNING","message":"new"}\nnot json\n')
    got = [x for x in (next(gen), next(gen)) if x is not None]
    assert got[0].message == "new" and got[0].level == "WARNING" and got[1].level == "RAW"
    gen.close()


# --- checks -----------------------------------------------------------------------------------

def test_checks_registry_run_and_history(host: Any) -> None:
    client, handle, parts = host
    registry = client.get("/api/console/checks").json()["items"]
    ids = {c["id"] for c in registry}
    assert {"tables_present", "schema_drift", "foreign_keys_indexed", "orphaned_rows", "console_store_writable", "disk_free", "books_have_author"} <= ids
    assert next(c for c in registry if c["id"] == "books_have_author")["builtin"] is False
    with parts["engine"].begin() as conn:
        conn.exec_driver_sql("INSERT INTO books (id, author_id, title, price) VALUES (77, 'ghost', 'Orphan', 0)")
    run = client.post("/api/console/checks/run").json()
    deadline = time.time() + 5
    while time.time() < deadline and client.get(f"/api/console/checks/runs/{run['id']}").json()["status"] == "running":
        time.sleep(0.05)
    detail = client.get(f"/api/console/checks/runs/{run['id']}").json()
    results = {r["check_id"]: r for r in detail["results"]}
    assert results["books_have_author"]["status"] == "fail" and results["books_have_author"]["samples"] == ["77"]
    assert results["orphaned_rows"]["status"] == "fail" and "books.author_id -> authors: 1" in results["orphaned_rows"]["samples"]
    assert results["foreign_keys_indexed"]["status"] == "info" and results["tables_present"]["status"] == "pass"
    assert detail["status"] == "failed" and detail["summary"]["summary"]["fail"] >= 2
    only = client.post("/api/console/checks/run", json={"only": ["tables_present"]}).json()
    while client.get(f"/api/console/checks/runs/{only['id']}").json()["status"] == "running":
        time.sleep(0.05)
    assert [r["check_id"] for r in client.get(f"/api/console/checks/runs/{only['id']}").json()["results"]] == ["tables_present"]
    assert client.get("/api/console/checks").json()["items"][0]["last"] is not None
    tile = client.get("/api/console/health", params={"tiles": "checks"}).json()["tiles"][0]
    assert tile["state"] in ("ok", "fail")


# --- config -----------------------------------------------------------------------------------

def test_config_masks_secrets_shows_provenance_and_sets_flags(host: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client, _, parts = host
    (tmp_path / ".env").write_text("LABEL=from-file\nSTRAY=1\n")
    monkeypatch.setenv("PAGE_SIZE", "25")
    cfg = client.get("/api/console/config").json()
    rows = {r["name"]: r for r in cfg["rows"]}
    assert rows["API_SECRET"]["secret"] is True and rows["API_SECRET"]["value"].startswith("••••") and "hunter2" not in json.dumps(cfg)
    assert rows["PAGE_SIZE"]["source"] == "environment" and rows["LABEL"]["source"] == "env_file" and rows["DEBUG"]["source"] == "default"
    assert rows["DEBUG"]["mutable"] is True and rows["LABEL"]["mutable"] is False and cfg["unknown_in_env_file"] == ["STRAY"]
    assert client.post("/api/console/config/flags/debug", json={"value": True, "confirm": "nope"}).json()["error"]["code"] == "confirm_mismatch"
    assert client.post("/api/console/config/flags/label", json={"value": "x", "confirm": "label"}).json()["error"]["code"] == "not_mutable"
    r = client.post("/api/console/config/flags/debug", json={"value": "true", "confirm": "debug"}).json()
    assert r == {"name": "debug", "before": False, "after": True} and parts["settings"].debug is True
    assert client.post("/api/console/config/flags/page_size", json={"value": "abc", "confirm": "page_size"}).json()["error"]["code"] == "bad_value"
    assert client.get("/api/console/activity", params={"section": "config"}).json()["items"][0]["action"] == "flag.set"


# --- users ------------------------------------------------------------------------------------

def test_users_and_roles_section(host: Any) -> None:
    client, _, parts = host
    users = client.get("/api/console/users").json()["items"]
    assert [u["id"] for u in users] == ["u1", "u2"] and [r["name"] for r in client.get("/api/console/users/roles").json()["items"]] == ["admin", "viewer"]
    assert client.post("/api/console/users/u2/roles", json={"roles": ["admin"], "confirm": "u1"}).json()["error"]["code"] == "confirm_mismatch"
    assert client.post("/api/console/users/u2/roles", json={"roles": ["admin"], "confirm": "u2"}).json()["roles"] == ["admin"]
    assert client.post("/api/console/users/u2/roles", json={"roles": ["god"], "confirm": "u2"}).json()["error"]["code"] == "refused"
    assert client.post("/api/console/users/zz/disabled", json={"disabled": True, "confirm": "zz"}).status_code == 404
    assert client.post("/api/console/users/u2/disabled", json={"disabled": True, "confirm": "u2"}).json()["disabled"] is True
    issued = client.post("/api/console/users/u1/tokens", json={"confirm": "u1", "ttl_seconds": 3600}).json()
    assert issued["plaintext"] and issued["token_id"].startswith("tok-")
    assert client.post(f"/api/console/users/tokens/{issued['token_id']}/revoke", json={"confirm": issued["token_id"]}).json()["revoked"] is True
    assert parts["users"].list()[0].tokens[0].revoked_at is not None
    actions = [a["action"] for a in client.get("/api/console/activity", params={"section": "users"}).json()["items"]]
    assert actions == ["token.revoke", "token.issue", "user.disable", "roles.set"]
    assert client.post("/api/console/users/u1/disabled", json={"disabled": True, "confirm": "u1"}, headers={"x-remote": "1"}).status_code == 403


# --- package boundary --------------------------------------------------------------------------

def test_package_never_imports_the_host() -> None:
    root = Path(__file__).resolve().parents[1] / "opsconsole"
    offenders = []
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "from app." in text or "import app." in text or "import app\n" in text:
            offenders.append(str(path.relative_to(root)))
    assert offenders == []
