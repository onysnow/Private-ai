"""Serving the Next.js workbench from the API's own origin (ADR-0004).

The workbench is a static export (frontend/next.config.mjs), so the API can
hand it out as plain files at "/": one screen, one origin, no second server.
Everything the API itself owns -- /api/*, /docs, /openapi.json, the operator
console at /console -- is routed before this catch-all mount, and the mount
refuses /api paths outright so an unknown API route still answers with the
API's JSON 404, never the workbench's HTML 404 page.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

# backend/app/web/frontend.py -> repo root is three parents up from backend/app/web.
_REPO_ROOT = Path(__file__).resolve().parents[3]

_NOT_BUILT_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Journalism Workbench</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#222}code{background:#f2f0ea;padding:.1rem .3rem;border-radius:4px}</style>
</head><body>
<h1>The workbench screen isn't built yet</h1>
<p>The API is running, but it has no copy of the workbench screen to show.</p>
<p>Start the app with <strong>Start Journalism Workbench.bat</strong> (Docker), which builds it automatically,
or build it yourself: <code>cd frontend</code>, <code>npm ci</code>, <code>npm run build</code>, then restart the API.</p>
<p>API documentation: <a href="/docs">/docs</a> &middot; Operator console: <a href="/console">/console</a></p>
</body></html>"""


def resolve_frontend_dist(configured: str) -> Path | None:
    """The export folder to serve, or None if there isn't a built one.

    `configured` comes from the FRONTEND_DIST_DIR setting; empty means the
    repo's own frontend/out (a local `npm run build`).
    """
    candidates = [Path(configured)] if configured else [_REPO_ROOT / "frontend" / "out"]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return None


class WorkbenchStaticFiles(StaticFiles):
    """StaticFiles that leaves the API's namespace alone."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)


def mount_frontend(app: FastAPI, configured_dir: str) -> Path | None:
    """Mount the workbench at "/". Call this after every other route and
    mount, since a "/" mount matches whatever is left."""
    dist = resolve_frontend_dist(configured_dir)
    if dist is None:
        @app.get("/", include_in_schema=False)
        def frontend_not_built() -> HTMLResponse:
            return HTMLResponse(_NOT_BUILT_PAGE, status_code=503)
        return None
    app.mount("/", WorkbenchStaticFiles(directory=dist, html=True), name="workbench")
    return dist
