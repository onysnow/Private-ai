"""Checks section: registry, run, history."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core.health import list_checks, run_checks


class RunIn(BaseModel):
    only: list[str] | None = Field(default=None, max_length=200)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()

    @r.get("/checks", response_model=None)
    def registry(request: Request) -> Any:
        ctx.read(request)
        last = ctx.store.runs_last("checks")
        return {"items": list_checks(ctx), "last_run": last}

    @r.post("/checks/run", response_model=None)
    def run(request: Request, body: RunIn | None = None) -> Any:
        principal = ctx.read(request)
        try:
            return run_checks(ctx, only=body.only if body else None, principal=principal)
        except RuntimeError as exc:
            raise ConsoleError(409, "already_running", str(exc)) from exc

    @r.get("/checks/runs", response_model=None)
    def runs(request: Request, limit: int = Query(20, ge=1, le=200)) -> Any:
        ctx.read(request)
        return {"items": ctx.store.runs_list(kind="checks", limit=limit)}

    @r.get("/checks/runs/{rid}", response_model=None)
    def run_detail(request: Request, rid: str) -> Any:
        ctx.read(request)
        try:
            status = ctx.supervisor.status(rid, tail=200)
        except LookupError as exc:
            raise ConsoleError(404, "unknown_run", str(exc)) from exc
        return {**status, "results": ctx.store.check_results_for(rid)}

    return r
