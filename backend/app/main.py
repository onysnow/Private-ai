import logging
from contextlib import asynccontextmanager
from pathlib import Path
from time import monotonic
from typing import Any, AsyncIterator, Awaitable, Callable, Iterator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, build_engine, build_session_factory, engine as default_engine, get_db
from app.db.migrations import ensure_database_schema
from app.api.routes_investigations import router as investigations_router
from app.api.routes_system import router as system_router
from app.api.routes_provenance import router as provenance_router
from app.api.routes_sources import router as sources_router
from app.api.routes_reporting_tasks import router as reporting_tasks_router
from app.api.routes_connectors import router as connectors_router
from app.api.routes_extraction_candidates import router as extraction_candidates_router
from app.api.routes_enrichment_sessions import router as enrichment_sessions_router
from app.api.routes_backups import router as backups_router
from app.api.routes_relationships import router as relationships_router
from app.api.routes_claims import router as claims_router
from app.api.routes_leads import router as leads_router
from app.api.routes_documents import router as documents_router
from app.api.routes_connector_findings import router as connector_findings_router
from app.api.routes_settings import router as settings_router
from app.api.routes_entities import router as entities_router
from app.api.routes_console import router as console_router
from app.core.config import Settings, settings as default_settings
from app.core.access import bearer_token, enforce_api_access, enforce_browser_write_access, request_is_local_request
from app.core.authorization import (
    InvestigationAuthorizationError, reset_current_authorization_scope,
    scope_for_request, set_current_authorization_scope,
)
from app.services.identity import scope_for_persisted_token
from app.core.request_limits import RequestLimitPolicy, validate_request_envelope
from app.core.rate_limiter import FixedWindowRateLimiter
from app.core.audit_log import SecurityAuditLogger, new_request_id, should_audit_request
from app.core.app_log import configure_app_logging, current_request_id


def register_domain_routers(app: FastAPI) -> None:
    """Wire every domain route module onto `app` (STRUCT-0039).

    This is the single source of truth for "which routers make up this API" --
    both the real `create_app()` below and every test file that needs a
    FastAPI app wired the same way as production import and call this,
    instead of each hand-copying the same 16-line include_router block (which
    happened 5 times across 3 test files before this fix, with nothing
    keeping the copies in sync as routers were added/removed during the
    routes.py Stage E split).
    """
    app.include_router(investigations_router)
    app.include_router(system_router)
    app.include_router(provenance_router)
    app.include_router(sources_router)
    app.include_router(reporting_tasks_router)
    app.include_router(connectors_router)
    app.include_router(extraction_candidates_router)
    app.include_router(enrichment_sessions_router)
    app.include_router(backups_router)
    app.include_router(relationships_router)
    app.include_router(claims_router)
    app.include_router(leads_router)
    app.include_router(documents_router)
    app.include_router(connector_findings_router)
    app.include_router(settings_router)
    app.include_router(entities_router)
    app.include_router(console_router)


def create_app(
    app_settings: Settings | None = None,
    *,
    bootstrap_schema: bool = True,
    audit: SecurityAuditLogger | None = None,
    request_limits: RequestLimitPolicy | None = None,
    auth_failures: FixedWindowRateLimiter | None = None,
    database_url: str | None = None,
    engine: Engine | None = None,
) -> FastAPI:
    """Build a FastAPI app instance (STRUCT-0010).

    Importing this module has no side effects: `app = create_app()` at the
    bottom only constructs the ASGI app. The database schema check
    (`ensure_database_schema`) runs in the app's lifespan -- i.e. when
    uvicorn starts serving, or when a test enters `with TestClient(app):` --
    and can be skipped per instance with `bootstrap_schema=False`.

    `app_settings` injects a different CORS / rate-limit / audit-log /
    auth-token configuration than the process-wide `app.core.config.settings`
    singleton; `audit`, `request_limits` and `auth_failures` inject the
    objects the access-guard middleware uses, so a test can hand in an
    in-memory audit logger or a tiny rate limit without touching module
    state or the real audit file. Omitted, each is built from `app_settings`
    exactly as before.

    `database_url` (or a ready `engine`) gives this instance its own database:
    its own Engine and session factory, its own `get_db` dependency override,
    and its own schema bootstrap -- none of it touching app.db.session's
    module-level `engine`/`SessionLocal`, which stay the default for
    `create_app()` with no database argument (and for code that imports them
    directly, which is why they are not removed).
    """
    app_settings = app_settings or default_settings
    if engine is not None and database_url is not None:
        raise ValueError("pass database_url or engine, not both")
    app_engine: Engine = engine if engine is not None else (build_engine(database_url) if database_url else default_engine)
    session_factory = build_session_factory(app_engine) if app_engine is not default_engine else SessionLocal

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if bootstrap_schema:
            ensure_database_schema(app_engine)
        yield

    app = FastAPI(title="Journalism Workbench API", version="1.24.0", lifespan=lifespan)
    if app_settings.app_log_file:
        configure_app_logging(app_settings.app_log_file)
    app_logger = logging.getLogger("journalism.request")

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        # Logged with the traceback under the request id the client also gets, so the
        # console's log view can be searched by the id in the 500's body.
        request_id = getattr(request.state, "request_id", None) or "unknown"
        app_logger.error(
            "unhandled exception", exc_info=(type(exc), exc, exc.__traceback__),
            extra={"request_id": request_id, "method": request.method, "path": request.url.path, "status_code": 500},
        )
        return JSONResponse(status_code=500, content={"detail": f"Internal server error (request {request_id})"}, headers={"X-Request-ID": request_id})
    app.state.engine = app_engine
    app.state.session_factory = session_factory
    if app_engine is not default_engine:
        def _app_get_db() -> Iterator[Session]:
            db = session_factory()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = _app_get_db

    @app.exception_handler(InvestigationAuthorizationError)
    async def investigation_authorization_denied(_request: Request, _exc: Exception) -> JSONResponse:
        # Fail closed without revealing whether a different investigation exists.
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_domain_routers(app)

    # Bound to non-Optional names here so the middleware closure below sees the
    # resolved objects (mypy does not narrow Optional parameters inside nested defs).
    limits_policy = request_limits or RequestLimitPolicy(
        default_bytes=app_settings.max_api_request_bytes,
        # Allow multipart framing overhead while preserving the stricter route-level file limit.
        document_bytes=app_settings.max_document_bytes + (1024 * 1024),
        backup_bytes=app_settings.max_backup_bytes + (1024 * 1024),
    )
    audit_logger = audit or SecurityAuditLogger(app_settings.audit_log_file)
    failure_limiter = auth_failures or FixedWindowRateLimiter(
        app_settings.api_auth_failure_limit_per_minute, 60,
        state_file=app_settings.api_auth_failure_state_file or None,
    )
    app.state.audit_logger = audit_logger  # reachable from routes/tests without re-plumbing

    @app.middleware("http")
    async def api_access_guard(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = new_request_id()
        # Exposed so route handlers can reference the same id in a generic
        # error detail (STRUCT-0028) instead of embedding raw exception text.
        request.state.request_id = request_id
        # Each request runs in its own task context, so this set() dies with the
        # request; no reset needed on the early-return paths below.
        current_request_id.set(request_id)
        started = monotonic()
        should_audit = should_audit_request(request.method, request.url.path)
        local_request = request_is_local_request(request)
        client_host = request.client.host if request.client else None

        limit = limits_policy.for_path(request.url.path)
        valid_envelope, status, length_detail = validate_request_envelope(
            method=request.method,
            content_length=request.headers.get("content-length"),
            content_type=request.headers.get("content-type"),
            transfer_encoding=request.headers.get("transfer-encoding"),
            limit=limit,
        )
        if not valid_envelope:
            response: Response = JSONResponse(status_code=status, content={"detail": length_detail})
            response.headers["X-Request-ID"] = request_id
            if should_audit:
                audit_logger.write(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status_code=status,
                    client_host=client_host,
                    local_request=local_request,
                    event="request_rejected",
                )
            return response
        persisted_scope = None
        if not local_request:
            supplied_token = bearer_token(request.headers.get("authorization"))
            if supplied_token:
                with session_factory() as identity_db:
                    persisted_scope = scope_for_persisted_token(identity_db, supplied_token, mark_used=True)
                if persisted_scope is not None:
                    request.state.authorization_scope = persisted_scope

        denial = None if persisted_scope is not None else await enforce_api_access(request, app_settings.api_auth_token)
        if denial is not None:
            if denial.status_code == 401:
                rate_key = f"{client_host or ''}|{request.url.hostname or ''}"
                allowed_failure, retry_after = failure_limiter.hit(rate_key)
                if not allowed_failure:
                    denial = JSONResponse(
                        status_code=429,
                        content={"detail": "Too many failed authentication attempts. Try again later."},
                        headers={"Retry-After": str(retry_after)},
                    )
            denial.headers["X-Request-ID"] = request_id
            if should_audit:
                audit_logger.write(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status_code=denial.status_code,
                    client_host=client_host,
                    local_request=local_request,
                    event="access_denied" if denial.status_code != 429 else "auth_rate_limited",
                )
            return denial
        if not local_request:
            failure_limiter.reset(f"{client_host or ''}|{request.url.hostname or ''}")
        browser_denial = await enforce_browser_write_access(request, app_settings.cors_origins)
        if browser_denial is not None:
            browser_denial.headers["X-Request-ID"] = request_id
            if should_audit:
                audit_logger.write(
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status_code=browser_denial.status_code,
                    client_host=client_host,
                    local_request=local_request,
                    event="browser_write_denied",
                )
            return browser_denial

        auth_token = set_current_authorization_scope(scope_for_request(request))
        try:
            response = await call_next(request)
        finally:
            reset_current_authorization_scope(auth_token)

        response.headers["X-Request-ID"] = request_id
        duration_ms = round((monotonic() - started) * 1000, 1)
        app_logger.log(
            logging.WARNING if response.status_code >= 500 else logging.INFO,
            "%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, duration_ms,
            extra={"request_id": request_id, "method": request.method, "path": request.url.path, "status_code": response.status_code, "duration_ms": duration_ms, "client_host": client_host or ""},
        )
        if should_audit:
            audit_logger.write(
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                client_host=client_host,
                local_request=local_request,
            )
        return response

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", include_in_schema=False)
    def home() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    @app.get("/console", include_in_schema=False)
    def console_page() -> FileResponse:
        """The backend-served operator console (the Next.js app has the same page at
        /console). The API behind it refuses non-loopback callers, so serving the
        HTML to anyone is harmless."""
        return FileResponse(static_dir / "console.html")

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response

    return app


app = create_app()
