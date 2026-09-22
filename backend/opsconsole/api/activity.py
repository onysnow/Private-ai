"""Activity section: everything anyone did through the console, and undo."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core import changesets


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()

    @r.get("/activity", response_model=None)
    def activity(request: Request, limit: int = Query(100, ge=1, le=1000), principal: str | None = Query(default=None, max_length=255),
                 section: str | None = Query(default=None, max_length=32), table: str | None = Query(default=None, max_length=255),
                 since: str | None = Query(default=None, max_length=40), changeset_id: str | None = Query(default=None, max_length=32)) -> Any:
        ctx.read(request)
        return {"items": ctx.store.activity_list(limit=limit, principal=principal, section=section, table=table, since=since, changeset_id=changeset_id)}

    @r.get("/activity/{aid}", response_model=None)
    def activity_detail(request: Request, aid: str) -> Any:
        ctx.read(request)
        row = ctx.store.activity_get(aid)
        if row is None:
            raise ConsoleError(404, "unknown_activity", "no such activity entry")
        return row

    @r.post("/activity/{aid}/undo", response_model=None)
    def undo(request: Request, aid: str) -> Any:
        principal = ctx.write(request)
        return changesets.undo(ctx, activity_id=aid, principal=principal)

    return r
