"""mount(app, config): validate, open the store, install the request hook,
include one router per available section, serve the UI, register shutdown."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, cast

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from opsconsole.api import (
    activity,
    apiplay,
    backups,
    checks,
    config_section,
    data,
    logs,
    overview,
    query,
    schema,
    tests,
    users,
)
from opsconsole.api.logs import LogFollower
from opsconsole.config import ConsoleConfig
from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core.events import EventBus
from opsconsole.core.introspect import SchemaIntrospector
from opsconsole.core.supervisor import TaskSupervisor
from opsconsole.core.traffic import TrafficBuffer
from opsconsole.manifest import sections
from opsconsole.store import Store

log = logging.getLogger("opsconsole")
UI_DIR = Path(__file__).parent / "ui"


@dataclass
class ConsoleHandle:
    ctx: ConsoleContext
    router: APIRouter
    follower: LogFollower

    @property
    def manifest_sections(self) -> list[dict[str, Any]]:
        return sections(self.ctx)

    @property
    def store(self) -> Store:
        return self.ctx.store

    @property
    def bus(self) -> EventBus:
        return self.ctx.bus

    @property
    def supervisor(self) -> TaskSupervisor:
        return self.ctx.supervisor

    def shutdown(self) -> None:
        """Call from the host's lifespan on the way out (stops followers and runs, flushes traffic, closes the store)."""
        self.follower.stop()
        self.ctx.supervisor.shutdown()
        self.ctx.close()


def mount(app: FastAPI, config: ConsoleConfig) -> ConsoleHandle:
    config.validate()
    bus = EventBus(queue_size=config.limits.sse_queue)
    introspector = SchemaIntrospector(config.metadata, config.engine, policy=config.table_policy, ignore=config.ignore_tables,
                                      domain_of_table=config.domain_of_table, table_docs=config.table_docs, exact_count_rows=config.limits.exact_count_rows)
    traffic = TrafficBuffer(maxlen=config.limits.traffic_entries)
    traffic.bind(app)
    ctx = ConsoleContext(config, bus, introspector, traffic)
    ctx.on_store_open.append(_reconcile_pending_activity)
    follower = LogFollower(ctx)

    router = APIRouter(prefix=config.route_prefix)
    router.include_router(overview.router(ctx))
    router.include_router(data.router(ctx))
    router.include_router(schema.router(ctx))
    router.include_router(query.router(ctx))
    router.include_router(apiplay.router(ctx))
    if config.users is not None:
        router.include_router(users.router(ctx))
    if config.backups:
        router.include_router(backups.router(ctx))
    if config.tests is not None:
        router.include_router(tests.router(ctx))
    if config.log_sources:
        router.include_router(logs.router(ctx, follower))
    router.include_router(checks.router(ctx))
    if config.settings is not None:
        router.include_router(config_section.router(ctx))
    router.include_router(activity.router(ctx))
    app.include_router(router)

    @app.exception_handler(ConsoleError)
    async def _console_error(request: Request, exc: ConsoleError) -> JSONResponse:
        # cast: HTTPException.detail is typed narrower than what it actually holds here --
        # ConsoleError always constructs it as a dict, but the base class's stub doesn't say
        # so, which makes mypy think this isinstance check can never be true.
        raw_detail = cast(Any, exc.detail)
        detail = raw_detail if isinstance(raw_detail, dict) else {"code": "error", "message": str(raw_detail)}
        rid = getattr(request.state, "request_id", None)
        return JSONResponse(status_code=exc.status_code, content={"error": {**detail, "request_id": rid}, "detail": detail.get("message")})

    if config.request_hook:

        @app.middleware("http")
        async def _opsconsole_traffic(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
            started = time.perf_counter()
            response = await call_next(request)
            try:
                principal = getattr(request.state, "console_principal", None)
                traffic.record(method=request.method, path=request.url.path, endpoint=request.scope.get("endpoint"), status=response.status_code,
                               ms=(time.perf_counter() - started) * 1000, request_id=getattr(request.state, "request_id", None) or response.headers.get("x-request-id"),
                               principal=getattr(principal, "label", None))
            except Exception as exc:  # never let the console's bookkeeping break a request
                log.debug("traffic record failed: %s", exc)
            return response

    if config.ui_path is not None:
        _serve_ui(app, config)

    handle = ConsoleHandle(ctx=ctx, router=router, follower=follower)
    app.state.opsconsole = handle
    return handle


def _reconcile_pending_activity(ctx: ConsoleContext) -> None:
    """Two-phase audit, phase 3: rows left `pending` by a crash between commit and flip."""
    from opsconsole.core.paging import raw_row, row_dict

    pending = ctx.store.activity_pending()
    for row in pending:
        state = "failed"
        try:
            table = ctx.introspector.table(row["target_table"]) if row.get("target_table") else None
            if table is not None and row.get("target_pk"):
                with ctx.config.engine.connect() as conn:
                    current = raw_row(conn, table, row["target_pk"])
                now = row_dict(table, current, ctx.config.table_policy) if current else None
                expected = row.get("after")
                if (now is None and expected is None) or (now is not None and expected is not None and all(now.get(k) == v for k, v in expected.items())):
                    state = "committed"
        except Exception:
            state = "failed"
        ctx.store.activity_set_state([row["id"]], state)


def _serve_ui(app: FastAPI, config: ConsoleConfig) -> None:
    ui_path = config.ui_path or "/console"
    index = UI_DIR / "index.html"
    frame_ancestors = " ".join(["'self'", *config.frame_ancestors]) if config.frame_ancestors else "'self'"

    @app.get(ui_path, include_in_schema=False)
    def console_index() -> Response:
        html = index.read_text(encoding="utf-8")
        html = html.replace("__CONSOLE_PREFIX__", config.route_prefix).replace("__CONSOLE_UI__", ui_path).replace("__APP_NAME__", config.app_name)
        return HTMLResponse(html, headers={"Content-Security-Policy": f"frame-ancestors {frame_ancestors}", "X-Frame-Options": "SAMEORIGIN", "Cache-Control": "no-store"})

    @app.get(ui_path + "/{asset}", include_in_schema=False)
    def console_asset(asset: str) -> Response:
        if asset not in ("console.js", "console.css"):
            return JSONResponse(status_code=404, content={"detail": "not found"})
        return FileResponse(UI_DIR / asset, headers={"Cache-Control": "no-cache"})


__all__ = ["ConsoleHandle", "mount"]
