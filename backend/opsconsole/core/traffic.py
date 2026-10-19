"""Per-route traffic: a bounded ring buffer fed by a request hook, summarised
on demand (count, p50/p95/max, 4xx/5xx), flushed to the store periodically."""

from __future__ import annotations

import statistics
import threading
import time
from collections import deque
from typing import Any, Callable

from fastapi import FastAPI
from fastapi.routing import APIRoute

from opsconsole.core.ids import now_iso


def iter_api_routes(routes: list[Any], prefix: str = "") -> list[tuple[str, APIRoute]]:
    """FastAPI 0.141 registers lazily-included routers as `_IncludedRouter`
    entries; walk into them so every real route is listed with its full path."""
    out: list[tuple[str, APIRoute]] = []
    for route in routes:
        if isinstance(route, APIRoute):
            out.append((prefix + route.path, route))
            continue
        inner = getattr(route, "original_router", None) or getattr(route, "router", None)
        if inner is not None and hasattr(inner, "routes"):
            ctx = getattr(route, "include_context", None)
            inner_prefix = prefix + (getattr(ctx, "prefix", "") or "")
            out.extend(iter_api_routes(list(inner.routes), inner_prefix))
    return out


class TrafficBuffer:
    def __init__(self, *, maxlen: int) -> None:
        self._entries: deque[dict[str, Any]] = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self._endpoint_paths: dict[Any, str] | None = None
        self.total = 0
        self.last_flush_at: str | None = None

    def bind(self, app: FastAPI) -> None:
        self._app = app

    def _path_for(self, endpoint: Any, fallback: str) -> str:
        if self._endpoint_paths is None:
            mapping: dict[Any, str] = {}
            for path, route in iter_api_routes(list(self._app.routes)):
                mapping.setdefault(route.endpoint, path)
            self._endpoint_paths = mapping
        return self._endpoint_paths.get(endpoint, fallback)

    def record(self, *, method: str, path: str, endpoint: Any, status: int, ms: float, request_id: str | None, principal: str | None = None) -> None:
        route = self._path_for(endpoint, path) if endpoint is not None else path
        entry = {"t": time.time(), "method": method, "route": route, "path": path, "status": status, "ms": round(ms, 2), "request_id": request_id, "principal": principal}
        with self._lock:
            self._entries.append(entry)
            self.total += 1

    def recent(self, limit: int, *, route: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._entries)
        if route:
            items = [e for e in items if e["route"] == route]
        return list(reversed(items[-limit:]))

    def summary(self, *, since: float | None = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._entries)
        if since:
            items = [e for e in items if e["t"] >= since]
        groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for e in items:
            groups.setdefault((e["method"], e["route"]), []).append(e)
        out = []
        for (method, route), entries in groups.items():
            durations = sorted(e["ms"] for e in entries)
            out.append({
                "method": method, "route": route, "count": len(entries),
                "p50_ms": round(statistics.median(durations), 1), "p95_ms": round(durations[max(0, int(len(durations) * 0.95) - 1)], 1),
                "max_ms": round(durations[-1], 1), "status_4xx": sum(1 for e in entries if 400 <= e["status"] < 500),
                "status_5xx": sum(1 for e in entries if e["status"] >= 500), "last_seen": max(e["t"] for e in entries),
            })
        out.sort(key=lambda r: (-r["count"], r["route"]))
        return out

    def fill(self) -> tuple[int, int]:
        with self._lock:
            return len(self._entries), self._entries.maxlen or 0

    def flush(self, write: Callable[[str, list[dict[str, Any]]], None]) -> int:
        rows = [{k: v for k, v in r.items() if k != "last_seen"} for r in self.summary(since=time.time() - 60)]
        if rows:
            write(now_iso(), rows)
        self.last_flush_at = now_iso()
        return len(rows)
