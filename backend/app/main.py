from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.db.session import engine, SessionLocal
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
from app.core.config import settings as default_settings
from app.core.access import bearer_token, enforce_api_access, enforce_browser_write_access, request_is_local_request
from app.core.authorization import (
    InvestigationAuthorizationError, reset_current_authorization_scope,
    scope_for_request, set_current_authorization_scope,
)
from app.services.identity import scope_for_persisted_token
from app.core.request_limits import RequestLimitPolicy, validate_request_envelope
from app.core.rate_limiter import FixedWindowRateLimiter
from app.core.audit_log import SecurityAuditLogger, new_request_id, should_audit_request


def create_app(app_settings=None) -> FastAPI:
    """Build a FastAPI app instance (STRUCT-0010).

    `app_settings` lets a caller (a future test fixture, in particular)
    inject a different CORS/rate-limit/audit-log/auth-token configuration
    than the process-wide `app.core.config.settings` singleton, without
    monkeypatching module attributes. Defaults to that singleton so
    `app = create_app()` below is behaviorally identical to the previous
    module-level construction -- this is additive, not a behavior change.

    Deliberately NOT parameterized here: `engine`/`SessionLocal` (from
    app.db.session), which are themselves built from `settings.database_url`
    at THEIR module's import time, independent of this factory. Injecting a
    different database per app instance is a bigger, separate refactor
    (tracked as STRUCT-0011, which depends on this factory existing first)
    -- doing both at once would be a much larger, riskier change than this
    pass's other fixes.
    """
    app_settings = app_settings or default_settings
    ensure_database_schema(engine)
    app = FastAPI(title="Journalism Workbench API", version="1.24.0")

    @app.exception_handler(InvestigationAuthorizationError)
    async def investigation_authorization_denied(_request, _exc):
        # Fail closed without revealing whether a different investigation exists.
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
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

    request_limits = RequestLimitPolicy(
        default_bytes=app_settings.max_api_request_bytes,
        # Allow multipart framing overhead while preserving the stricter route-level file limit.
        document_bytes=app_settings.max_document_bytes + (1024 * 1024),
        backup_bytes=app_settings.max_backup_bytes + (1024 * 1024),
    )
    audit = SecurityAuditLogger(app_settings.audit_log_file)
    auth_failures = FixedWindowRateLimiter(app_settings.api_auth_failure_limit_per_minute, 60)

    @app.middleware("http")
    async def api_access_guard(request, call_next):
        request_id = new_request_id()
        should_audit = should_audit_request(request.method, request.url.path)
        local_request = request_is_local_request(request)
        client_host = request.client.host if request.client else None

        limit = request_limits.for_path(request.url.path)
        valid_envelope, status, length_detail = validate_request_envelope(
            method=request.method,
            content_length=request.headers.get("content-length"),
            content_type=request.headers.get("content-type"),
            transfer_encoding=request.headers.get("transfer-encoding"),
            limit=limit,
        )
        if not valid_envelope:
            response = JSONResponse(status_code=status, content={"detail": length_detail})
            response.headers["X-Request-ID"] = request_id
            if should_audit:
                audit.write(
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
                with SessionLocal() as identity_db:
                    persisted_scope = scope_for_persisted_token(identity_db, supplied_token, mark_used=True)
                if persisted_scope is not None:
                    request.state.authorization_scope = persisted_scope

        denial = None if persisted_scope is not None else await enforce_api_access(request, app_settings.api_auth_token)
        if denial is not None:
            if denial.status_code == 401:
                rate_key = f"{client_host or ''}|{request.url.hostname or ''}"
                allowed_failure, retry_after = auth_failures.hit(rate_key)
                if not allowed_failure:
                    denial = JSONResponse(
                        status_code=429,
                        content={"detail": "Too many failed authentication attempts. Try again later."},
                        headers={"Retry-After": str(retry_after)},
                    )
            denial.headers["X-Request-ID"] = request_id
            if should_audit:
                audit.write(
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
            auth_failures.reset(f"{client_host or ''}|{request.url.hostname or ''}")
        browser_denial = await enforce_browser_write_access(request, app_settings.cors_origins)
        if browser_denial is not None:
            browser_denial.headers["X-Request-ID"] = request_id
            if should_audit:
                audit.write(
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
        if should_audit:
            audit.write(
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
    def home():
        return FileResponse(static_dir / "index.html")

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response

    return app


app = create_app()
