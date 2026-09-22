"""The query workbench: read mode (screened, rolled back, READ ONLY on
Postgres, row/byte/time capped), EXPLAIN, and the write mode the host must
opt into."""

from __future__ import annotations

import json
import re
import time
from typing import Any, Mapping

from sqlalchemy import text
from sqlalchemy.engine import Connection

from opsconsole.core.introspect import json_safe

_COMMENT = re.compile(r"--[^\n]*|/\*.*?\*/", re.S)
_WRITE_WORDS = re.compile(r"\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|COPY|VACUUM|REINDEX|REPLACE|CALL|DO|LOCK|SET|RESET|LISTEN|NOTIFY)\b", re.I)
READ_HEADS = {"SELECT", "WITH", "EXPLAIN", "VALUES", "SHOW", "TABLE"}


def clean(sql: str) -> str:
    cleaned = _COMMENT.sub(" ", sql or "").strip().rstrip(";").strip()
    if not cleaned:
        raise ValueError("empty statement")
    if ";" in cleaned:
        raise ValueError("one statement at a time")
    return cleaned


def screen_read(sql: str) -> str:
    cleaned = clean(sql)
    head = cleaned.split(None, 1)[0].upper()
    if head not in READ_HEADS:
        raise ValueError("read mode allows SELECT / WITH / EXPLAIN / VALUES only")
    if _WRITE_WORDS.search(cleaned):
        raise ValueError("statement contains a write/DDL keyword; switch to write mode (if enabled) to run it")
    return cleaned


def _set_timeout(conn: Connection, seconds: int) -> None:
    if conn.dialect.name == "postgresql":
        conn.execute(text(f"SET LOCAL statement_timeout = {int(seconds * 1000)}"))


def run_read(conn: Connection, sql: str, *, params: Mapping[str, Any] | None, max_rows: int, max_bytes: int, timeout_seconds: int) -> dict[str, Any]:
    cleaned = screen_read(sql)
    started = time.perf_counter()
    if conn.dialect.name == "postgresql":
        conn.execute(text("SET TRANSACTION READ ONLY"))
    _set_timeout(conn, timeout_seconds)
    result = conn.execute(text(cleaned), dict(params or {}))
    columns = list(result.keys())
    rows: list[list[Any]] = []
    size = 0
    truncated = False
    byte_capped = False
    for row in result:
        if len(rows) >= max_rows:
            truncated = True
            break
        safe = [json_safe(v) for v in row]
        size += len(json.dumps(safe, default=str))
        if size > max_bytes:
            byte_capped = truncated = True
            break
        rows.append(safe)
    return {"columns": columns, "rows": rows, "returned": len(rows), "truncated": truncated, "byte_capped": byte_capped,
            "ms": round((time.perf_counter() - started) * 1000, 1)}


def run_write(conn: Connection, sql: str, *, params: Mapping[str, Any] | None, timeout_seconds: int) -> dict[str, Any]:
    cleaned = clean(sql)
    started = time.perf_counter()
    _set_timeout(conn, timeout_seconds)
    result = conn.execute(text(cleaned), dict(params or {}))
    rows: list[list[Any]] = []
    columns: list[str] = []
    if result.returns_rows:
        columns = list(result.keys())
        rows = [[json_safe(v) for v in r] for r in result.fetchmany(500)]
    return {"rowcount": result.rowcount, "columns": columns, "rows": rows, "ms": round((time.perf_counter() - started) * 1000, 1)}


def explain(conn: Connection, sql: str, *, params: Mapping[str, Any] | None, analyze: bool, timeout_seconds: int) -> dict[str, Any]:
    cleaned = screen_read(sql)
    if cleaned.split(None, 1)[0].upper() == "EXPLAIN":
        cleaned = cleaned.split(None, 1)[1]
    dialect = conn.dialect.name
    if dialect == "postgresql":
        if analyze:
            conn.execute(text("SET TRANSACTION READ ONLY"))
        _set_timeout(conn, timeout_seconds)
        opts = "ANALYZE, " if analyze else ""
        result = conn.execute(text(f"EXPLAIN ({opts}FORMAT JSON) {cleaned}"), dict(params or {}))
        plan = result.scalar()
        return {"dialect": dialect, "plan": plan, "text": None}
    if dialect == "sqlite":
        result = conn.execute(text(f"EXPLAIN QUERY PLAN {cleaned}"), dict(params or {}))
        lines = [" ".join(str(v) for v in r) for r in result]
        return {"dialect": dialect, "plan": None, "text": "\n".join(lines)}
    result = conn.execute(text(f"EXPLAIN {cleaned}"), dict(params or {}))
    return {"dialect": dialect, "plan": None, "text": "\n".join(" ".join(str(v) for v in r) for r in result)}
