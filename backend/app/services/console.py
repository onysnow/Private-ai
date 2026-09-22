"""Operator console: the tools behind /api/console/* and the frontend /console page.

Everything here is loopback-only by the route guard. The point is confidence:
see what is in every table (any dialect, including the SQLite file the Windows
launcher uses, which Adminer cannot open), ask read-only questions in SQL, see
which endpoints exist and whether they answer, run the real test suite against
an isolated database, and read the structured application log -- without
leaving the app. Direct edits stay in Adminer on purpose: this surface never
writes to the workbench database.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings, settings as default_settings
from app.db.session import Base
from app.services.security import redact_database_url

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MAX_ROWS = 500


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (dict, list, str, int, float, bool)) or value is None:
        return value
    return str(value)


# --- tables ---------------------------------------------------------------------------

def list_tables(db: Session) -> list[dict[str, Any]]:
    out = []
    for table in Base.metadata.sorted_tables:
        count = db.execute(select(func.count()).select_from(table)).scalar_one()
        out.append({
            "name": table.name,
            "rows": int(count),
            "columns": [{"name": c.name, "type": str(c.type), "primary_key": bool(c.primary_key), "nullable": bool(c.nullable)} for c in table.columns],
            "foreign_keys": sorted({fk.column.table.name for fk in table.foreign_keys}),
        })
    return out


def read_table(db: Session, name: str, *, limit: int = 50, offset: int = 0, order: str = "desc") -> dict[str, Any]:
    table = Base.metadata.tables.get(name)
    if table is None:
        raise LookupError(f"unknown table {name!r}")
    limit = max(1, min(limit, MAX_ROWS))
    order_cols = [c for c in table.columns if c.name == "created_at"] or list(table.primary_key.columns)
    stmt = select(table)
    for col in order_cols:
        stmt = stmt.order_by(col.desc() if order == "desc" else col.asc())
    stmt = stmt.offset(max(0, offset)).limit(limit)
    rows = [{k: _json_safe(v) for k, v in row._mapping.items()} for row in db.execute(stmt).all()]
    total = int(db.execute(select(func.count()).select_from(table)).scalar_one())
    return {"table": name, "columns": [c.name for c in table.columns], "rows": rows, "returned": len(rows), "total": total, "offset": offset, "limit": limit}


# --- read-only SQL --------------------------------------------------------------------

_SQL_COMMENT = re.compile(r"--[^\n]*|/\*.*?\*/", re.S)


def run_readonly_sql(db: Session, sql: str, *, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """One SELECT/WITH statement, executed inside a transaction that is always
    rolled back, capped at `max_rows`. Anything else is refused before it
    reaches the database; on PostgreSQL the transaction is also marked READ
    ONLY so even a disguised write fails server-side."""
    cleaned = _SQL_COMMENT.sub(" ", sql or "").strip().rstrip(";").strip()
    if not cleaned:
        raise ValueError("empty statement")
    if ";" in cleaned:
        raise ValueError("one statement at a time")
    head = cleaned.split(None, 1)[0].upper()
    if head not in {"SELECT", "WITH", "EXPLAIN"}:
        raise ValueError("only SELECT / WITH / EXPLAIN statements are allowed here; use Adminer for changes")
    if re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|ATTACH|PRAGMA|COPY|VACUUM|REINDEX)\b", cleaned, re.I):
        raise ValueError("statement contains a write/DDL keyword; use Adminer for changes")
    started = datetime.now(timezone.utc)
    connection = db.connection()
    if connection.dialect.name == "postgresql":
        connection.execute(text("SET TRANSACTION READ ONLY"))
    try:
        result = connection.execute(text(cleaned))
        columns = list(result.keys())
        fetched = result.fetchmany(max_rows + 1)
    finally:
        db.rollback()
    truncated = len(fetched) > max_rows
    rows = [[_json_safe(v) for v in row] for row in fetched[:max_rows]]
    return {
        "columns": columns, "rows": rows, "returned": len(rows), "truncated": truncated,
        "duration_ms": round((datetime.now(timezone.utc) - started).total_seconds() * 1000, 1),
    }


# --- endpoints ------------------------------------------------------------------------

def _iter_api_routes(routes: list[Any], prefix: str = "") -> list[tuple[str, APIRoute]]:
    """Walk app.routes including FastAPI >= 0.141's lazily included routers
    (`_IncludedRouter` wraps the original APIRouter instead of copying its
    routes onto the app), so the listing is the real, complete route table."""
    found: list[tuple[str, APIRoute]] = []
    for route in routes:
        if isinstance(route, APIRoute):
            found.append((prefix + route.path, route))
            continue
        original = getattr(route, "original_router", None)
        if original is not None:
            context = getattr(route, "include_context", None)
            inner_prefix = prefix + (getattr(context, "prefix", "") or "")
            found.extend(_iter_api_routes(list(original.routes), inner_prefix))
    return found


def list_routes(app: FastAPI) -> list[dict[str, Any]]:
    out = []
    for full_path, route in _iter_api_routes(list(app.routes)):
        doc = (route.endpoint.__doc__ or "").strip().split("\n", 1)[0]
        out.append({
            "path": full_path,
            "methods": sorted(m for m in (route.methods or set()) if m not in {"HEAD", "OPTIONS"}),
            "name": route.name,
            "summary": route.summary or doc,
            "path_params": [p.name for p in route.dependant.path_params],
            "query_params": [p.name for p in route.dependant.query_params],
        })
    return sorted(out, key=lambda r: (r["path"], r["methods"]))


# Endpoints that answer without a body or a path id: the ones a smoke check can call
# blind. Everything else is reachable through Swagger (/docs) with a real id.
SMOKE_ENDPOINTS: tuple[tuple[str, str], ...] = (
    ("GET", "/api/health"),
    ("GET", "/api/capabilities"),
    ("GET", "/api/settings/status"),
    ("GET", "/api/settings/security/audit/summary"),
    ("GET", "/api/settings/security/alerts"),
    ("GET", "/api/investigations"),
    ("GET", "/api/connectors"),
    ("GET", "/api/relationship-schemas"),
    ("GET", "/api/integrations/openaleph/status"),
    ("GET", "/api/search?q=smoke"),
    ("GET", "/openapi.json"),
)


def probe_endpoints(base_url: str, *, timeout_seconds: float = 5.0, endpoints: tuple[tuple[str, str], ...] = SMOKE_ENDPOINTS) -> dict[str, Any]:
    """Call each smoke endpoint over real HTTP against this server (loopback)
    and report status + latency. A non-2xx is a finding, not an exception."""
    results = []
    ok = 0
    with httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout_seconds, follow_redirects=False) as client:
        for method, path in endpoints:
            started = datetime.now(timezone.utc)
            entry: dict[str, Any]
            try:
                response = client.request(method, path)
                entry = {"method": method, "path": path, "status_code": response.status_code, "ok": 200 <= response.status_code < 300, "error": None}
            except httpx.HTTPError as exc:
                entry = {"method": method, "path": path, "status_code": None, "ok": False, "error": f"{exc.__class__.__name__}: {exc}"}
            entry["duration_ms"] = round((datetime.now(timezone.utc) - started).total_seconds() * 1000, 1)
            ok += 1 if entry["ok"] else 0
            results.append(entry)
    return {"base_url": base_url, "checked": len(results), "ok": ok, "failed": len(results) - ok, "results": results, "at": datetime.now(timezone.utc).isoformat()}


# --- tests ----------------------------------------------------------------------------

_SAFE_SELECTION = re.compile(r"^[A-Za-z0-9_./:\[\]\- ]{0,200}$")


class TestRunner:
    """Runs the backend's own pytest suite in a subprocess, one run at a time,
    against an ISOLATED database and storage directory so the suite's per-test
    table wipes can never touch the workbench data. Output goes to a log file
    under settings.console_dir; status is readable while it runs."""

    def __init__(self) -> None:
        self._lock = threading.RLock()  # start() reports via status() while still holding it
        self._process: subprocess.Popen[bytes] | None = None
        self._state: dict[str, Any] = {"status": "idle"}

    def start(self, *, selection: str | None = None, settings: Settings = default_settings) -> dict[str, Any]:
        selection = (selection or "").strip()
        if selection and not _SAFE_SELECTION.match(selection):
            raise ValueError("selection may only contain test paths / -k expressions (letters, digits, _ . / : [ ] - space)")
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                raise RuntimeError("a test run is already in progress")
            console_dir = Path(settings.console_dir).resolve()
            console_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            log_path = console_dir / f"tests-{stamp}.log"
            test_db = console_dir / "console-tests.db"
            env = dict(os.environ)
            env.update({
                "DATABASE_URL": f"sqlite:///{test_db.as_posix()}",
                "DOCUMENT_STORAGE_DIR": str(console_dir / "test-documents"),
                "AUDIT_LOG_FILE": str(console_dir / "test-audit.jsonl"),
                "API_AUTH_FAILURE_STATE_FILE": "",
                "APP_LOG_FILE": str(console_dir / "test-app.jsonl"),
                "CONNECTOR_CREDENTIALS_FILE": str(console_dir / "test-connectors.json"),
                "ENABLE_AI_FEATURES": "false",
                "AI_PROVIDER": "",
                "OPENALEPH_ENABLED": "false",
                "PYTHONUNBUFFERED": "1",
            })
            cmd = [sys.executable, "-m", "pytest", "-q", "-o", "addopts=", "-p", "no:cacheprovider", "-W", "ignore::UserWarning"]
            if selection:
                cmd += (["-k", selection] if not selection.startswith("tests") else [selection])
            else:
                cmd.append("tests")
            handle = log_path.open("wb")
            try:
                self._process = subprocess.Popen(cmd, cwd=BACKEND_ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT)
            finally:
                handle.close()
            self._state = {
                "status": "running", "pid": self._process.pid, "command": cmd, "selection": selection or None,
                "started_at": datetime.now(timezone.utc).isoformat(), "finished_at": None, "returncode": None,
                "log_file": str(log_path), "database_url": f"sqlite:///{test_db.as_posix()}",
            }
            return self.status()

    def status(self, *, tail_lines: int = 40) -> dict[str, Any]:
        with self._lock:
            state = dict(self._state)
            proc = self._process
            if proc is not None and state.get("status") == "running" and proc.poll() is not None:
                state["status"] = "passed" if proc.returncode == 0 else "failed"
                state["returncode"] = proc.returncode
                state["finished_at"] = datetime.now(timezone.utc).isoformat()
                self._state = state
        log_file = state.get("log_file")
        if log_file and Path(log_file).exists():
            text_out = Path(log_file).read_text(encoding="utf-8", errors="replace")
            lines = text_out.splitlines()
            state["tail"] = lines[-tail_lines:]
            state["failed_tests"] = [ln for ln in lines if ln.startswith("FAILED ") or ln.startswith("ERROR ")][:100]
            summary = next((ln for ln in reversed(lines) if re.search(r"\d+ (passed|failed|error)", ln)), None)
            state["summary"] = summary.strip("= ") if summary else None
        return state

    def cancel(self) -> dict[str, Any]:
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                self._process.terminate()
                self._state["status"] = "cancelled"
                self._state["finished_at"] = datetime.now(timezone.utc).isoformat()
        return self.status()


test_runner = TestRunner()


def pytest_available() -> bool:
    try:
        import pytest  # noqa: F401
    except ImportError:
        return False
    return True


# --- overview -------------------------------------------------------------------------

def console_overview(db: Session, settings: Settings = default_settings) -> dict[str, Any]:
    bind = db.get_bind()
    dialect = bind.dialect.name
    inspector = inspect(bind)
    live_tables = set(inspector.get_table_names())
    modeled = set(Base.metadata.tables)
    return {
        "database": {
            "url": redact_database_url(settings.database_url),
            "dialect": dialect,
            "modeled_tables": len(modeled),
            "live_tables": len(live_tables),
            "missing_tables": sorted(modeled - live_tables),
            "extra_tables": sorted(live_tables - modeled - {"alembic_version"}),
            "adminer_can_open": dialect == "postgresql",
        },
        "app_log_file": settings.app_log_file,
        "console_dir": settings.console_dir,
        "pytest_available": pytest_available(),
        "python": sys.version.split()[0],
        "links": {
            "swagger": "/docs", "redoc": "/redoc", "openapi": "/openapi.json",
            "adminer": "http://127.0.0.1:8081/?pgsql=workbench-db&username=journalism&db=journalism",
            "openaleph_ui": settings.openaleph_ui_url if settings.openaleph_enabled else None,
        },
        "test_run": test_runner.status(tail_lines=5),
    }
