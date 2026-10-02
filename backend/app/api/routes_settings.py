"""Settings and security administration endpoints: /settings/*.

Group 6 of the Stage E routes.py split. Covers the /settings/status
snapshot, persisted app-user (identity) CRUD and token lifecycle,
investigation membership grants, connector credential storage, and
security audit log access/retention.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.access import request_is_local_request
from app.core.authorization import scope_for_request
from app.core.audit_log import (
    apply_security_audit_retention,
    preview_security_audit_retention,
    read_security_audit,
    summarize_security_audit,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import AppUser
from app.schemas.api import (
    AppUserCreate, AppUserUpdate, ConnectorCredentialPut, InvestigationMembershipPut, SecurityAuditRetentionRequest,
)
from app.schemas.responses import (
    AppUserCreatedOut, AppUserOut, AppUserTokenRevokedOut, AppUserTokenRotatedOut, AppUserUpdatedOut,
    ConnectorCredentialRemovedOut, ConnectorCredentialSavedOut, InvestigationMembershipOut, OrphanStoragePreviewOut,
    SecurityAlertsOut, SecurityAuditRetentionPreviewOut, SecurityAuditRetentionResultOut, SecurityAuditSummaryOut,
    SecurityAuditViewOut, SettingsStatusOut,
)
from app.services.lifecycle import preview_orphan_document_files as _preview_orphan_document_files
from app.services.settings import (
    create_app_user as _create_app_user,
    delete_connector_credential as _delete_connector_credential,
    delete_investigation_membership as _delete_investigation_membership,
    get_settings_status,
    security_alerts,
    list_app_users as _list_app_users,
    put_investigation_membership as _put_investigation_membership,
    revoke_app_user_token as _revoke_app_user_token,
    rotate_app_user_token as _rotate_app_user_token,
    save_connector_credential as _save_connector_credential,
    update_app_user as _update_app_user,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _require_local_request(request: Request) -> None:
    if not request_is_local_request(request):
        raise HTTPException(403, "Connector credential changes are restricted to the local machine")


@router.get("/settings/status", response_model=SettingsStatusOut)
def settings_status(request: Request, db: Session = Depends(get_db)) -> Any:
    # Polled by the frontend on every page load, so this stays reachable for
    # any authenticated caller -- but a remote, non-admin scope (the shared
    # bearer fallback, or a persisted token without global-admin) gets a
    # reduced payload rather than the server-wide config a local/admin caller
    # sees. See get_settings_status() for exactly which fields are scrubbed.
    local = scope_for_request(request).is_global_admin
    return get_settings_status(db, local=local)


@router.get("/settings/security/users", response_model=list[AppUserOut])
def list_app_users(request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    return _list_app_users(db)


@router.post("/settings/security/users", response_model=AppUserCreatedOut)
def create_app_user(payload: AppUserCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    try:
        return _create_app_user(db, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.patch("/settings/security/users/{user_id}", response_model=AppUserUpdatedOut)
def update_app_user(user_id: str, payload: AppUserUpdate, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    try:
        return _update_app_user(db, user, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/settings/security/users/{user_id}/token/rotate", response_model=AppUserTokenRotatedOut)
def rotate_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return _rotate_app_user_token(db, user)


@router.post("/settings/security/users/{user_id}/token/revoke", response_model=AppUserTokenRevokedOut)
def revoke_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return _revoke_app_user_token(db, user)


@router.put("/settings/security/users/{user_id}/investigations/{investigation_id}", response_model=InvestigationMembershipOut)
def put_investigation_membership(user_id: str, investigation_id: str, payload: InvestigationMembershipPut, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    _require_local_request(request)
    try:
        membership = _put_investigation_membership(db, user_id, investigation_id, payload.role)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"user_id": user_id, "investigation_id": investigation_id, "role": membership.role}


@router.delete("/settings/security/users/{user_id}/investigations/{investigation_id}", status_code=204)
def delete_investigation_membership(user_id: str, investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    _require_local_request(request)
    _delete_investigation_membership(db, user_id, investigation_id)
    return Response(status_code=204)


@router.get("/settings/security/audit", response_model=SecurityAuditViewOut)
def get_security_audit(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=1_000_000),
    event: str | None = None,
    method: str | None = None,
    status_code: int | None = Query(default=None, ge=100, le=599),
) -> Any:
    # Read-only, but this is a server-wide log spanning every investigation and
    # actor -- an investigation-scoped remote token has no narrower business
    # reading it than it would rotating another user's token, so this gets the
    # same local-only guard as every other endpoint on this router that touches
    # the security surface (retention preview/apply, user/token/membership CRUD).
    _require_local_request(request)
    return read_security_audit(
        settings.audit_log_file,
        limit=limit,
        offset=offset,
        event=event,
        method=method,
        status_code=status_code,
    )


@router.get("/settings/security/audit/summary", response_model=SecurityAuditSummaryOut)
def get_security_audit_summary(request: Request) -> Any:
    _require_local_request(request)
    return summarize_security_audit(settings.audit_log_file)


@router.get("/settings/security/alerts", response_model=SecurityAlertsOut)
def get_security_alerts(
    request: Request,
    window_hours: float = Query(24.0, gt=0, le=24 * 30),
    max_examples: int = Query(10, ge=0, le=100),
) -> Any:
    """Recent denial events (access_denied / auth_rate_limited / browser_write_denied /
    request_rejected) as counts, busiest remote hosts and latest examples -- STRUCT-0035.

    Local-only: this aggregates denial events (including remote IPs) across every
    investigation and actor on the server, not just the caller's own scope."""
    _require_local_request(request)
    return security_alerts(window_hours=window_hours, max_examples=max_examples)


@router.get("/settings/security/audit/retention-preview", response_model=SecurityAuditRetentionPreviewOut)
def get_security_audit_retention_preview(
    request: Request,
    keep_days: int = Query(90, ge=1, le=3650),
    max_records: int = Query(5000, ge=100, le=1_000_000),
) -> Any:
    _require_local_request(request)
    try:
        preview = preview_security_audit_retention(
            settings.audit_log_file, keep_days=keep_days, max_records=max_records
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    preview.pop("_lines", None)
    preview.pop("_keep_indexes", None)
    return preview


@router.post("/settings/security/audit/retention", response_model=SecurityAuditRetentionResultOut)
def prune_security_audit(body: SecurityAuditRetentionRequest, request: Request) -> Any:
    # The body's types are checked by its model (a wrong type is a 422 now,
    # where the hand-written checks here answered 400); the ranges and the
    # confirmation text are still the audit log's to check.
    _require_local_request(request)
    try:
        return apply_security_audit_retention(
            settings.audit_log_file,
            keep_days=body.keep_days,
            max_records=body.max_records,
            confirmation=body.confirmation,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.put("/settings/connectors/{provider}/credential", response_model=ConnectorCredentialSavedOut)
def save_connector_credential(provider: str, body: ConnectorCredentialPut, request: Request) -> Any:
    _require_local_request(request)
    try:
        return _save_connector_credential(provider, body.credential)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/settings/connectors/{provider}/credential", response_model=ConnectorCredentialRemovedOut)
def delete_connector_credential(provider: str, request: Request) -> Any:
    _require_local_request(request)
    try:
        return _delete_connector_credential(provider)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/settings/storage/orphans", response_model=OrphanStoragePreviewOut)
def get_orphan_storage_preview(request: Request, db: Session = Depends(get_db)) -> Any:
    """Preview-only report of files under document storage that no Document row
    references (STRUCT area: lifecycle.preview_orphan_document_files was implemented
    and unit-tested but never wired to a route -- the frontend's "Preview retained
    orphan files" button 404'd on every call). Local-only: this walks the server's
    whole document storage root, not just the caller's own investigation's files."""
    _require_local_request(request)
    return _preview_orphan_document_files(db, settings.document_storage_dir)
