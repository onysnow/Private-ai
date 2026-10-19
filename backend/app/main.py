import logging
import threading
from contextlib import asynccontextmanager
from time import monotonic
from typing import Any, AsyncIterator, Awaitable, Callable, Iterator

from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, select
from sqlalchemy.exc import DataError
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
from app.api.routes_writeups import router as writeups_router
from app.api.routes_stories import router as stories_router
from app.api.routes_ai_runs import router as ai_runs_router
from app.api.routes_decks import router as decks_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_corpus import router as corpus_router
from app.api.routes_watchlists import router as watchlists_router
from app.api.routes_annotations import router as annotations_router
from app.api.routes_red_flags import router as red_flags_router
from app.api.routes_checks import router as checks_router
from app.api.routes_case_home import router as case_home_router
from app.api.routes_suite import router as suite_router
from app.api.routes_demo import router as demo_router
from app.api.routes_session import router as session_router
from app.api.routes_catalogue import router as catalogue_router
from app.api.routes_table_mappings import router as table_mappings_router
from app.api.routes_basemap import router as basemap_router
from app.api.routes_places import router as places_router
from app.api.routes_preferences import router as preferences_router
from app.api.routes_visuals import router as visuals_router
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
from app.console_adapters import build_console_config
from app.schemas.responses import API_REFUSALS
from app.web.frontend import mount_frontend
from app.jobs.runner import JobRunner, resolve_runner
from opsconsole import mount as mount_console


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
    app.include_router(writeups_router)
    app.include_router(stories_router)
    app.include_router(ai_runs_router)
    app.include_router(decks_router)
    app.include_router(jobs_router)
    app.include_router(visuals_router)
    app.include_router(corpus_router)
    app.include_router(watchlists_router)
    app.include_router(annotations_router)
    app.include_router(red_flags_router)
    app.include_router(checks_router)
    app.include_router(case_home_router)
    app.include_router(suite_router)
    app.include_router(demo_router)
    app.include_router(session_router)
    app.include_router(catalogue_router)
    app.include_router(table_mappings_router)
    app.include_router(basemap_router)
    app.include_router(places_router)
    app.include_router(preferences_router)


def operation_id(route: APIRoute) -> str:
    """The route function's name. The operator console (a separate package
    whose modules reuse short names like `run`) gets console_<module>_<name>."""
    module = getattr(route.endpoint, "__module__", "") or ""
    if module.startswith("opsconsole"):
        return f"console_{module.rsplit('.', 1)[-1]}_{route.name}"
    return route.name


def _holds_nul_character(exc: Exception) -> bool:
    """Whether a database error is PostgreSQL refusing a NUL character: psycopg's
    own check (its message) or the server's (SQLSTATE 22P05)."""
    original = getattr(exc, "orig", None)
    return getattr(original, "sqlstate", None) == "22P05" or "NUL (0x00)" in str(original)


def _warm_catalogue() -> None:
    try:
        from app.patterns.engine import _catalogue

        _catalogue()
    except Exception:  # pragma: no cover - the first request reads it instead
        logging.getLogger("journalism").warning("could not read the indicator catalogue ahead of time", exc_info=True)


def app_lock_gate(request: Request, session_factory: Any) -> Response | None:
    """The app lock (ADR-0016) for requests from this computer: while a passphrase is set, an API request without an
    unlocked session gets 423 Locked. Cases locked on their own and not opened in the session are taken out of the
    request's scope. Health, the session endpoints, the operator console and the screen itself are not gated."""
    from app.core.authorization import AuthorizationScope
    from app.models.investigations import Investigation
    from app.services import app_lock

    path = request.url.path
    if not path.startswith("/api/") or path == "/api/health" or path.startswith(("/api/session", "/api/console")):
        return None
    with session_factory() as lock_db:
        session = app_lock.get_session(request.headers.get(app_lock.SESSION_HEADER))
        if not app_lock.is_open(lock_db, session):
            return JSONResponse(status_code=423, content={
                "detail": "The app is locked.", "locked": True, "pin": app_lock.pin_allowed(lock_db, session)})
        cases = lock_db.execute(select(Investigation.id, Investigation.case_lock)).all()
        closed = {i for i, lk in cases if lk} - (session.open_cases if session else set())
        if closed:
            request.state.authorization_scope = AuthorizationScope(
                actor_id="local-owner", investigation_ids=frozenset(i for i, _ in cases if i not in closed), role="owner",
                closed_investigation_ids=frozenset(closed), owner_wide=True)
    return None


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

    jobs = JobRunner(
        resolve_runner(app_settings.job_runner, app_engine), session_factory, app_engine,
        concurrency=app_settings.job_worker_concurrency,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if bootstrap_schema:
            ensure_database_schema(app_engine)
        await jobs.start()
        # The indicator catalogue takes seconds to read; reading it now, off the
        # loop, keeps the first Red Flags or Case home request from waiting on it.
        threading.Thread(target=_warm_catalogue, name="warm-catalogue", daemon=True).start()
        try:
            yield
        finally:
            await jobs.stop()
        console = getattr(_app.state, "opsconsole", None)
        if console is not None:
            console.shutdown()

    # Operation ids are the route functions' names (unique; pinned by
    # tests/test_response_models.py), so the generated front-end client reads
    # `investigationDeletionPreview`, not the name, path and method run together.
    # Every route, the console's included, declares how it refuses: the checks
    # in front of all of them (api_access_guard below) answer in that shape too.
    app = FastAPI(title="Journalism Workbench API", version="1.24.0", lifespan=lifespan,
                  generate_unique_id_function=operation_id, responses=API_REFUSALS)
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
    app.state.jobs = jobs
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

    @app.exception_handler(DataError)
    async def text_the_database_cannot_keep(request: Request, exc: Exception) -> JSONResponse:
        # PostgreSQL keeps no NUL character (U+0000) in text or JSON: psycopg
        # refuses it before sending (psycopg/types/string.py), or the server does
        # (SQLSTATE 22P05, untranslatable_character). It is the request that has
        # to change, so it is refused instead of failing as a server error
        # (tests/test_api_contract.py found it). Any other data error is one.
        if _holds_nul_character(exc):
            return JSONResponse(status_code=400, content={"detail": "Text cannot contain the NUL character (U+0000)."})
        return await unhandled_exception(request, exc)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Workbench-Session"],
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
                rate_key = f"{client_host or ''}"
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
            failure_limiter.reset(f"{client_host or ''}")
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

        if local_request:
            locked = app_lock_gate(request, session_factory)
            if locked is not None:
                locked.headers["X-Request-ID"] = request_id
                return locked

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

    if app_settings.console_enabled:
        # The operator console (ADR-0003): a host-agnostic package mounted with the
        # app's adapters. /api/console/* answers loopback callers only (see
        # app/console_adapters.py); the UI is served at /console and the Next.js
        # /console page embeds it when the workbench runs on its own dev server.
        mount_console(app, build_console_config(app_settings, app_engine, session_factory, app_version=app.version))

    # The workbench screen (ADR-0004), last: a "/" mount takes whatever is left.
    mount_frontend(app, app_settings.frontend_dist_dir)

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
