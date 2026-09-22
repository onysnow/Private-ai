"""Logs section: sources, tail with server-side filters; live lines arrive over /events as `logs:<source>`."""

from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import APIRouter, Query, Request

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.protocols import LogFilter, LogLine, LogSource

log = logging.getLogger("opsconsole")


class LogFollower:
    """One thread per source, started on first demand, feeding the event bus."""

    def __init__(self, ctx: ConsoleContext) -> None:
        self.ctx = ctx
        self._threads: dict[str, threading.Thread] = {}
        self._stop = threading.Event()
        self._lock = threading.Lock()

    def ensure(self, source: LogSource) -> None:
        with self._lock:
            t = self._threads.get(source.id)
            if t is not None and t.is_alive():
                return
            t = threading.Thread(target=self._follow, args=(source,), name=f"opsconsole-logs-{source.id}", daemon=True)
            self._threads[source.id] = t
            t.start()

    def _follow(self, source: LogSource) -> None:
        try:
            for line in source.follow(from_end=True):
                if self._stop.is_set():
                    return
                if line is None:
                    if self.ctx.bus.subscribers == 0:
                        self._stop.wait(1.0)
                    continue
                self.ctx.bus.publish(f"logs:{source.id}", _line_dict(line))
        except Exception as exc:
            log.warning("log follower for %s stopped: %s", source.id, exc)

    def stop(self) -> None:
        self._stop.set()


def _line_dict(line: LogLine) -> dict[str, Any]:
    return {"ts": line.ts, "level": line.level, "message": line.message, "logger": line.logger, "request_id": line.request_id, **{k: v for k, v in line.extra.items() if k not in ("ts", "level", "message", "logger", "request_id")}}


def router(ctx: ConsoleContext, follower: LogFollower) -> APIRouter:
    r = APIRouter()
    sources = {s.id: s for s in ctx.config.log_sources}

    @r.get("/logs/sources", response_model=None)
    def list_sources(request: Request) -> Any:
        ctx.read(request)
        items = []
        for s in ctx.config.log_sources:
            ok, reason = s.available()
            items.append({"id": s.id, "title": s.title, "available": ok, "reason": reason})
        items.append({"id": "activity", "title": "Console activity", "available": True, "reason": None})
        return {"items": items}

    @r.get("/logs/{source}", response_model=None)
    def tail(request: Request, source: str, limit: int = Query(200, ge=1, le=5000), level: str | None = Query(default=None, max_length=16),
             request_id: str | None = Query(default=None, max_length=64), logger: str | None = Query(default=None, max_length=128),
             contains: str | None = Query(default=None, max_length=200), since: str | None = Query(default=None, max_length=40), follow: bool = Query(False)) -> Any:
        ctx.read(request)
        limit = min(limit, ctx.config.limits.log_lines)
        if source == "activity":
            rows = ctx.store.activity_list(limit=limit, since=since)
            if contains:
                rows = [a for a in rows if contains.lower() in str(a).lower()]
            return {"source": source, "items": [{"ts": a["at"], "level": "INFO", "message": f"{a['action']} {a.get('target_table') or ''} {a.get('target_pk') or ''}".strip(), "logger": a["section"], "request_id": a.get("request_id"), "principal": a["principal_label"], "id": a["id"]} for a in rows], "returned": len(rows)}
        src = sources.get(source)
        if src is None:
            raise ConsoleError(404, "unknown_source", "no such log source")
        ok, reason = src.available()
        if not ok:
            return {"source": source, "items": [], "returned": 0, "available": False, "reason": reason}
        if follow:
            follower.ensure(src)
        items = src.tail(limit=limit, filters=LogFilter(level=level, request_id=request_id, logger=logger, contains=contains, since=since))
        return {"source": source, "items": [_line_dict(line) for line in items], "returned": len(items), "available": True}

    return r
