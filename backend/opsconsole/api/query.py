"""Query section: read/write SQL, EXPLAIN, saved queries, history."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from opsconsole.config import WritePolicy
from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core import sqlscreen


class RunIn(BaseModel):
    sql: str = Field(min_length=1, max_length=20_000)
    params: dict[str, Any] | None = None
    max_rows: int | None = Field(default=None, ge=1, le=10_000)
    mode: str = Field(default="read", pattern="^(read|write)$")
    confirm: str | None = Field(default=None, max_length=16)


class ExplainIn(BaseModel):
    sql: str = Field(min_length=1, max_length=20_000)
    params: dict[str, Any] | None = None
    analyze: bool = False


class SavedIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sql: str = Field(min_length=1, max_length=20_000)
    params: list[dict[str, Any]] = Field(default_factory=list)
    pinned: bool = False


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    limits = ctx.config.limits

    def _error(exc: Exception) -> ConsoleError:
        return ConsoleError(400, "query_error", f"{exc.__class__.__name__}: {str(exc).splitlines()[0][:500]}")

    @r.post("/query/run", response_model=None)
    def run(request: Request, body: RunIn) -> Any:
        started = time.perf_counter()
        if body.mode == "write":
            principal = ctx.write(request, need=WritePolicy.CHANGESETS_AND_SQL)
            ctx.confirm(body.confirm, "write")
            act = ctx.audit(principal, request, section="query", action="sql.write", note=body.sql[:2000], state="pending")
            try:
                with ctx.config.engine.begin() as conn:
                    result = sqlscreen.run_write(conn, body.sql, params=body.params, timeout_seconds=limits.query_seconds)
            except ValueError as exc:
                ctx.store.activity_set_state([act], "failed")
                ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="write", rows=None, ms=int((time.perf_counter() - started) * 1000), error=str(exc), keep=limits.query_history_rows)
                raise ConsoleError(400, "bad_statement", str(exc)) from exc
            except Exception as exc:
                ctx.store.activity_set_state([act], "failed")
                ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="write", rows=None, ms=int((time.perf_counter() - started) * 1000), error=str(exc)[:500], keep=limits.query_history_rows)
                raise _error(exc) from exc
            ctx.store.activity_set_state([act], "committed")
            ctx.introspector.invalidate_counts()
            ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="write", rows=result["rowcount"], ms=int(result["ms"]), error=None, keep=limits.query_history_rows)
            ctx.bus.publish("data", {"table": None, "changed": result["rowcount"], "sql": True})
            return {"mode": "write", **result}
        principal = ctx.read(request)
        max_rows = min(body.max_rows or limits.rows, limits.max_rows)
        try:
            with ctx.config.engine.connect() as conn:
                tx = conn.begin()
                try:
                    result = sqlscreen.run_read(conn, body.sql, params=body.params, max_rows=max_rows, max_bytes=limits.result_bytes, timeout_seconds=limits.query_seconds)
                finally:
                    tx.rollback()
        except ValueError as exc:
            ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="read", rows=None, ms=int((time.perf_counter() - started) * 1000), error=str(exc), keep=limits.query_history_rows)
            raise ConsoleError(400, "bad_statement", str(exc)) from exc
        except Exception as exc:
            ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="read", rows=None, ms=int((time.perf_counter() - started) * 1000), error=str(exc)[:500], keep=limits.query_history_rows)
            raise _error(exc) from exc
        ctx.store.history_add(principal_id=principal.id, sql=body.sql, mode="read", rows=result["returned"], ms=int(result["ms"]), error=None, keep=limits.query_history_rows)
        return {"mode": "read", **result}

    @r.post("/query/explain", response_model=None)
    def explain(request: Request, body: ExplainIn) -> Any:
        ctx.read(request)
        try:
            with ctx.config.engine.connect() as conn:
                tx = conn.begin()
                try:
                    return sqlscreen.explain(conn, body.sql, params=body.params, analyze=body.analyze, timeout_seconds=limits.query_seconds)
                finally:
                    tx.rollback()
        except ValueError as exc:
            raise ConsoleError(400, "bad_statement", str(exc)) from exc
        except Exception as exc:
            raise _error(exc) from exc

    @r.get("/query/saved", response_model=None)
    def saved(request: Request) -> Any:
        ctx.read(request)
        return {"items": ctx.store.saved_list()}

    @r.post("/query/saved", response_model=None)
    def save(request: Request, body: SavedIn) -> Any:
        principal = ctx.read(request)
        return ctx.store.saved_upsert(name=body.name, sql=body.sql, params=body.params, created_by=principal.id, pinned=body.pinned)

    @r.put("/query/saved/{qid}", response_model=None)
    def update_saved(request: Request, qid: str, body: SavedIn) -> Any:
        principal = ctx.read(request)
        return ctx.store.saved_upsert(name=body.name, sql=body.sql, params=body.params, created_by=principal.id, pinned=body.pinned, qid=qid)

    @r.delete("/query/saved/{qid}", response_model=None)
    def delete_saved(request: Request, qid: str) -> Any:
        ctx.read(request)
        if not ctx.store.saved_delete(qid):
            raise ConsoleError(404, "unknown_query", "no such saved query")
        return {"deleted": qid}

    @r.get("/query/history", response_model=None)
    def history(request: Request, limit: int = Query(50, ge=1, le=500)) -> Any:
        ctx.read(request)
        return {"items": ctx.store.history_list(limit)}

    return r
