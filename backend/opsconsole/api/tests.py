"""Tests section: collect, run, stream (via /events), history, cancel, re-run failed."""

from __future__ import annotations

import re
import threading
from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.protocols import Principal, TestRunner

_SAFE_SELECTION = re.compile(r"^[A-Za-z0-9_./:\[\]\- ,]{0,500}$")


class RunIn(BaseModel):
    selection: str | None = Field(default=None, max_length=500)


def start_test_run(ctx: ConsoleContext, runner: TestRunner, *, selection: str | None, principal: Principal) -> dict[str, Any]:
    selection = (selection or "").strip() or None
    if selection and not _SAFE_SELECTION.match(selection):
        raise ConsoleError(400, "bad_selection", "selection may only contain test ids / -k expressions (letters, digits, _ . / : [ ] - space)")

    def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
        code = runner.run(selection, run)
        summary = runner.parse_summary(list(run.lines))
        status = "cancelled" if run.cancelled else ("passed" if code == 0 else "failed")
        return status, {"passed": summary.passed, "failed": summary.failed, "errors": summary.errors, "skipped": summary.skipped, "line": summary.line, "failed_ids": summary.failed_ids[:200], "exit_code": code}, code

    try:
        return ctx.supervisor.start("tests", fn, selection=selection, principal_id=principal.id)
    except RuntimeError as exc:
        raise ConsoleError(409, "already_running", str(exc)) from exc


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    runner = ctx.config.tests
    assert runner is not None
    tree_cache: dict[str, Any] = {}
    tree_lock = threading.Lock()

    @r.get("/tests/tree", response_model=None)
    def tree(request: Request, refresh: bool = Query(False)) -> Any:
        ctx.read(request)
        with tree_lock:
            if refresh or "nodes" not in tree_cache:
                try:
                    nodes = runner.collect()
                except Exception as exc:
                    raise ConsoleError(500, "collect_failed", f"{exc.__class__.__name__}: {str(exc)[:300]}") from exc
                tree_cache["nodes"] = [{"id": n.id, "kind": n.kind, "parent": n.parent, "title": n.title} for n in nodes]
            return {"items": tree_cache["nodes"], "count": sum(1 for n in tree_cache["nodes"] if n["kind"] == "test")}

    @r.post("/tests/run", response_model=None)
    def run(request: Request, body: RunIn | None = None) -> Any:
        principal = ctx.read(request)
        result = start_test_run(ctx, runner, selection=body.selection if body else None, principal=principal)
        with tree_lock:
            tree_cache.clear()
        return result

    @r.post("/tests/rerun-failed", response_model=None)
    def rerun_failed(request: Request) -> Any:
        principal = ctx.read(request)
        last = ctx.store.runs_last("tests")
        failed = ((last or {}).get("summary") or {}).get("failed_ids") or []
        if not failed:
            raise ConsoleError(400, "nothing_failed", "the last run has no failed tests to re-run")
        return start_test_run(ctx, runner, selection=" ".join(failed[:100]), principal=principal)

    @r.get("/tests/runs", response_model=None)
    def runs(request: Request, limit: int = Query(20, ge=1, le=200)) -> Any:
        ctx.read(request)
        current = ctx.store.run_running("tests")
        return {"items": ctx.store.runs_list(kind="tests", limit=limit), "running": current["id"] if current else None}

    @r.get("/tests/runs/{rid}", response_model=None)
    def run_status(request: Request, rid: str, tail: int = Query(60, ge=1, le=2000)) -> Any:
        ctx.read(request)
        try:
            return ctx.supervisor.status(rid, tail=tail)
        except LookupError as exc:
            raise ConsoleError(404, "unknown_run", str(exc)) from exc

    @r.get("/tests/runs/{rid}/log", response_model=None)
    def run_log(request: Request, rid: str) -> Any:
        ctx.read(request)
        row = ctx.store.run_get(rid)
        if row is None:
            raise ConsoleError(404, "unknown_run", "no such run")
        lines, total = ctx.supervisor.read_log(row["log_path"], None)
        return {"id": rid, "lines": lines, "count": total}

    @r.post("/tests/runs/{rid}/cancel", response_model=None)
    def cancel(request: Request, rid: str) -> Any:
        ctx.read(request)
        try:
            return ctx.supervisor.cancel(rid)
        except LookupError as exc:
            raise ConsoleError(409, "not_running", str(exc)) from exc

    return r
