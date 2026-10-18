"""Manifest, health board, server metrics, and the SSE event stream."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import StreamingResponse

from opsconsole import schemas as s
from opsconsole.config import WritePolicy
from opsconsole.context import ConsoleContext
from opsconsole.core.health import health_board
from opsconsole.core.metrics import server_metrics
from opsconsole.manifest import build_manifest


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()

    @r.get("/manifest", response_model=s.ConsoleManifestOut)
    def manifest(request: Request) -> Any:
        principal = ctx.read(request)
        ctx.housekeeping()
        can_write = ctx.config.writes != WritePolicy.DISABLED and ctx.config.auth.allow_write(request) is not None
        return build_manifest(ctx, principal, can_write=can_write)

    @r.get("/health", response_model=s.ConsoleHealthOut)
    def health(request: Request, tiles: str | None = Query(default=None, max_length=500)) -> Any:
        ctx.read(request)
        ctx.housekeeping()
        only = {t.strip() for t in tiles.split(",") if t.strip()} if tiles else None
        return health_board(ctx, only=only)

    @r.get("/health/server", response_model=s.ConsoleServerMetricsOut)
    def server(request: Request) -> Any:
        ctx.read(request)
        return server_metrics(paths={"console_dir": str(ctx.config.console_dir)})

    @r.get("/events", response_class=Response,
           responses=s.file_response({"text/event-stream": s.TEXT}, "Server-sent events: one `event:` and `data:` pair per console event, JSON in `data`"))
    def events(request: Request, topics: str = Query(default="*", max_length=500)) -> Any:
        ctx.read(request)
        wanted = frozenset(t.strip() for t in topics.split(",") if t.strip()) or frozenset({"*"})
        return StreamingResponse(ctx.bus.stream(wanted), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return r
