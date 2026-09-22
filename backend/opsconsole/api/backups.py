"""Backups section over one or more BackupProviders (labelled by kind)."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.protocols import BackupProvider


class CreateIn(BaseModel):
    kind: str = Field(max_length=64)
    selection: str | None = Field(default=None, max_length=500)


class RestoreIn(BaseModel):
    kind: str = Field(max_length=64)
    confirm: str = Field(max_length=255)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    providers: dict[str, BackupProvider] = {b.kind: b for b in ctx.config.backups}

    def _provider(kind: str) -> BackupProvider:
        p = providers.get(kind)
        if p is None:
            raise ConsoleError(404, "unknown_kind", f"no backup provider {kind!r}")
        return p

    @r.get("/backups", response_model=None)
    def list_backups(request: Request) -> Any:
        ctx.read(request)
        out = []
        for kind, p in providers.items():
            try:
                items = [asdict(b) for b in p.list()]
                error = None
            except Exception as exc:
                items, error = [], f"{exc.__class__.__name__}: {str(exc)[:200]}"
            out.append({"kind": kind, "items": items, "error": error})
        return {"providers": out, "running": {k: ctx.supervisor.is_running(k) for k in ("backup", "restore")}}

    @r.post("/backups", response_model=None)
    def create(request: Request, body: CreateIn) -> Any:
        principal = ctx.write(request)
        provider = _provider(body.kind)

        def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
            record = provider.create(run, selection=body.selection)
            return "passed", {"kind": body.kind, **asdict(record)}, 0

        try:
            result = ctx.supervisor.start("backup", fn, selection=f"{body.kind}:{body.selection or ''}", principal_id=principal.id)
        except RuntimeError as exc:
            raise ConsoleError(409, "already_running", str(exc)) from exc
        ctx.audit(principal, request, section="backups", action="backup.create", note=body.kind, run_id=result["id"])
        return result

    @r.get("/backups/{kind}/{bid}/download", response_model=None)
    def download(request: Request, kind: str, bid: str) -> Any:
        principal = ctx.read(request)
        path = _provider(kind).path_for_download(bid)
        if not path or not Path(path).is_file():
            raise ConsoleError(404, "not_downloadable", "no file for this backup")
        ctx.audit(principal, request, section="backups", action="backup.download", note=f"{kind}:{bid}")
        return FileResponse(path, filename=Path(path).name)

    @r.post("/backups/{bid}/restore/plan", response_model=None)
    def plan(request: Request, bid: str, kind: str = Query(max_length=64)) -> Any:
        ctx.read(request)
        try:
            return asdict(_provider(kind).restore_plan(bid))
        except LookupError as exc:
            raise ConsoleError(404, "unknown_backup", str(exc)) from exc

    @r.post("/backups/{bid}/restore", response_model=None)
    def restore(request: Request, bid: str, body: RestoreIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, bid)
        provider = _provider(body.kind)
        for busy in ("tests", "migration", "backup"):
            if ctx.supervisor.is_running(busy):
                raise ConsoleError(409, "busy", f"a {busy} run is in progress")

        def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
            provider.restore(bid, run)
            ctx.introspector.invalidate()
            return "passed", {"kind": body.kind, "backup_id": bid}, 0

        try:
            result = ctx.supervisor.start("restore", fn, selection=f"{body.kind}:{bid}", principal_id=principal.id)
        except RuntimeError as exc:
            raise ConsoleError(409, "already_running", str(exc)) from exc
        ctx.audit(principal, request, section="backups", action="backup.restore", note=f"{body.kind}:{bid}", run_id=result["id"])
        return result

    @r.get("/backups/runs", response_model=None)
    def runs(request: Request, limit: int = Query(20, ge=1, le=200)) -> Any:
        ctx.read(request)
        return {"items": [x for x in ctx.store.runs_list(kind=None, limit=limit * 2) if x["kind"] in ("backup", "restore")][:limit]}

    return r
