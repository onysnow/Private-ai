"""API section: route table, request builder, traffic statistics, golden-path probes, collections."""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core.ids import now_iso
from opsconsole.core.traffic import iter_api_routes
from opsconsole.protocols import ActAsPolicy, Principal, Probe


class SendIn(BaseModel):
    method: str = Field(pattern="^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$")
    path: str = Field(min_length=1, max_length=2000)
    query: dict[str, str] | None = None
    headers: dict[str, str] | None = None
    body: Any = None
    act_as: str | None = Field(default=None, max_length=255)
    timeout_seconds: float = Field(default=10.0, ge=0.5, le=60)


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    requests: list[dict[str, Any]] = Field(default_factory=list, max_length=200)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    limits = ctx.config.limits

    def _routes(request: Request) -> list[dict[str, Any]]:
        app = request.app
        try:
            openapi = app.openapi()
        except Exception:
            openapi = {"paths": {}}
        traffic = {(t["method"], t["route"]): t for t in ctx.traffic.summary()} if ctx.config.request_hook else {}
        out: list[dict[str, Any]] = []
        for path, route in iter_api_routes(list(app.routes)):
            spec = openapi.get("paths", {}).get(path, {})
            meta = None
            if ctx.config.describe_route is not None:
                try:
                    meta = ctx.config.describe_route(route)
                except Exception:
                    meta = None
            for method in sorted(route.methods or []):
                if method in ("HEAD", "OPTIONS"):
                    continue
                op = spec.get(method.lower(), {})
                params = [{"name": p.get("name"), "in": p.get("in"), "required": p.get("required", False), "schema": p.get("schema")} for p in op.get("parameters", [])]
                body = op.get("requestBody", {}).get("content", {})
                stats = traffic.get((method, path))
                out.append({
                    "method": method, "path": path, "name": route.name, "summary": op.get("summary") or (route.summary or ""), "tags": op.get("tags", []),
                    "params": params, "body": next(iter(body.keys()), None), "console": path.startswith(ctx.config.route_prefix),
                    "auth": meta.auth if meta else "", "roles": list(meta.roles) if meta else [], "notes": meta.notes if meta else "",
                    "traffic": {k: stats[k] for k in ("count", "p50_ms", "p95_ms", "status_4xx", "status_5xx", "last_seen")} if stats else None,
                })
        out.sort(key=lambda x: (x["path"], x["method"]))
        return out

    @r.get("/api/routes", response_model=None)
    def routes(request: Request) -> Any:
        ctx.read(request)
        return {"items": _routes(request)}

    @r.post("/api/send", response_model=None)
    def send(request: Request, body: SendIn) -> Any:
        principal = ctx.read(request)
        if not body.path.startswith("/"):
            raise ConsoleError(400, "bad_path", "path must start with '/' (requests only go to this server)")
        headers = {k: v for k, v in (body.headers or {}).items() if k.lower() not in ("host", "content-length")}
        if body.act_as:
            auth = ctx.config.auth
            if not isinstance(auth, ActAsPolicy) and not hasattr(auth, "act_as"):
                raise ConsoleError(400, "act_as_unsupported", "this host does not support act-as")
            derived = getattr(auth, "act_as")(request, body.act_as)
            if derived is None:
                raise ConsoleError(403, "act_as_refused", f"cannot act as {body.act_as!r}")
            headers.update(dict(derived))
            ctx.audit(principal, request, section="api", action="send.act_as", note=f"{body.method} {body.path} as {body.act_as}")
        base = str(request.base_url).rstrip("/")
        started = time.perf_counter()
        try:
            with httpx.Client(base_url=base, timeout=body.timeout_seconds, follow_redirects=False) as client:
                response = client.request(body.method, body.path, params=body.query, headers=headers,
                                          json=body.body if body.body is not None and not isinstance(body.body, str) else None,
                                          content=body.body.encode() if isinstance(body.body, str) else None)
        except httpx.HTTPError as exc:
            raise ConsoleError(502, "self_unreachable", f"{exc.__class__.__name__}: {exc} (tried {base})") from exc
        raw = response.content[: limits.response_body_bytes]
        text_body = raw.decode("utf-8", errors="replace")
        parsed: Any = None
        if "json" in response.headers.get("content-type", ""):
            try:
                parsed = response.json() if len(response.content) <= limits.response_body_bytes else None
            except ValueError:
                parsed = None
        return {"status": response.status_code, "headers": dict(response.headers), "body": parsed if parsed is not None else text_body,
                "truncated": len(response.content) > limits.response_body_bytes, "bytes": len(response.content), "ms": round((time.perf_counter() - started) * 1000, 1),
                "request_id": response.headers.get("x-request-id")}

    if ctx.config.request_hook:

        @r.get("/api/traffic", response_model=None)
        def traffic(request: Request, since_seconds: int | None = Query(default=None, ge=1, le=86_400)) -> Any:
            ctx.read(request)
            since = time.time() - since_seconds if since_seconds else None
            fill, cap = ctx.traffic.fill()
            return {"items": ctx.traffic.summary(since=since), "buffer": {"fill": fill, "capacity": cap, "total": ctx.traffic.total}, "history": ctx.store.traffic_history(route=None, limit=200)}

        @r.get("/api/traffic/recent", response_model=None)
        def recent(request: Request, limit: int = Query(100, ge=1, le=2000), route: str | None = Query(default=None, max_length=512)) -> Any:
            ctx.read(request)
            return {"items": ctx.traffic.recent(limit, route=route)}

    @r.post("/api/probes/run", response_model=None)
    def probes(request: Request) -> Any:
        principal = ctx.read(request)
        base = str(request.base_url).rstrip("/")
        suite = [Probe("GET", "/openapi.json", (200,), "OpenAPI document"), Probe("GET", f"{ctx.config.route_prefix}/manifest", (200,), "Console manifest")] + list(ctx.config.api_probe_suite)
        return _run_probes(ctx, principal, base, suite)

    @r.get("/api/collections", response_model=None)
    def collections(request: Request) -> Any:
        ctx.read(request)
        return {"items": ctx.store.collections_list()}

    @r.post("/api/collections", response_model=None)
    def save_collection(request: Request, body: CollectionIn) -> Any:
        ctx.read(request)
        return ctx.store.collection_upsert(name=body.name, requests=body.requests)

    @r.delete("/api/collections/{cid}", response_model=None)
    def delete_collection(request: Request, cid: str) -> Any:
        ctx.read(request)
        if not ctx.store.collection_delete(cid):
            raise ConsoleError(404, "unknown_collection", "no such collection")
        return {"deleted": cid}

    return r


def _run_probes(ctx: ConsoleContext, principal: Principal, base: str, suite: list[Probe]) -> dict[str, Any]:
    def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
        results = []
        ok = 0
        with httpx.Client(base_url=base, timeout=10.0, follow_redirects=False) as client:
            for probe in suite:
                if run.cancelled:
                    break
                started = time.perf_counter()
                try:
                    response = client.request(probe.method, probe.path)
                    entry = {"method": probe.method, "path": probe.path, "title": probe.title, "status": response.status_code, "ok": response.status_code in probe.expect, "error": None}
                except httpx.HTTPError as exc:
                    entry = {"method": probe.method, "path": probe.path, "title": probe.title, "status": None, "ok": False, "error": f"{exc.__class__.__name__}: {exc}"}
                entry["ms"] = round((time.perf_counter() - started) * 1000, 1)
                ok += 1 if entry["ok"] else 0
                results.append(entry)
                run.log(f"{'ok  ' if entry['ok'] else 'FAIL'} {probe.method} {probe.path} -> {entry['status']} {entry['ms']}ms")
        summary = {"checked": len(results), "ok": ok, "failed": len(results) - ok, "results": results, "at": now_iso(), "base_url": base}
        return ("passed" if ok == len(results) else "failed"), summary, None

    return ctx.supervisor.start("probes", fn, selection=None, principal_id=principal.id)
