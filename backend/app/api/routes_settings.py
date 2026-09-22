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
from app.core.audit_log import (
    apply_security_audit_retention,
    preview_security_audit_retention,
    read_security_audit,
    summarize_security_audit,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import AppUser
from app.schemas.api import AppUserCreate, AppUserUpdate, InvestigationMembershipPut
from app.services.settings import (
    create_app_user as _create_app_user,
    delete_connector_credential as _delete_connector_credential,
    delete_investigation_membership as _delete_investigation_membership,
    get_settings_status,
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


@router.get("/settings/status", response_model=None)
def settings_status(db: Session = Depends(get_db)) -> Any:
    return get_settings_status(db)


@router.get("/settings/security/users", response_model=None)
def list_app_users(request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    return _list_app_users(db)


@router.post("/settings/security/users", response_model=None)
def create_app_user(payload: AppUserCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    try:
        return _create_app_user(db, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.patch("/settings/security/users/{user_id}", response_model=None)
def update_app_user(user_id: str, payload: AppUserUpdate, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    try:
        return _update_app_user(db, user, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/settings/security/users/{user_id}/token/rotate", response_model=None)
def rotate_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return _rotate_app_user_token(db, user)


@router.post("/settings/security/users/{user_id}/token/revoke", response_model=None)
def revoke_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return _revoke_app_user_token(db, user)


@router.put("/settings/security/users/{user_id}/investigations/{investigation_id}", response_model=None)
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


@router.get("/settings/security/audit", response_model=None)
def get_security_audit(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=1_000_000),
    event: str | None = None,
    method: str | None = None,
    status_code: int | None = Query(default=None, ge=100, le=599),
) -> Any:
    return read_security_audit(
        settings.audit_log_file,
        limit=limit,
        offset=offset,
        event=event,
        method=method,
        status_code=status_code,
    )


@router.get("/settings/security/audit/summary", response_model=None)
def get_security_audit_summary() -> Any:
    return summarize_security_audit(settings.audit_log_file)


@router.get("/settings/security/audit/retention-preview", response_model=None)
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


@router.post("/settings/security/audit/retention", response_model=None)
def prune_security_audit(body: dict, request: Request) -> Any:
    _require_local_request(request)
    keep_days = body.get("keep_days", 90) if isinstance(body, dict) else 90
    max_records = body.get("max_records", 5000) if isinstance(body, dict) else 5000
    confirmation = body.get("confirmation", "") if isinstance(body, dict) else ""
    if not isinstance(keep_days, int) or isinstance(keep_days, bool):
        raise HTTPException(400, "keep_days must be an integer")
    if not isinstance(max_records, int) or isinstance(max_records, bool):
        raise HTTPException(400, "max_records must be an integer")
    if not isinstance(confirmation, str):
        raise HTTPException(400, "confirmation must be text")
    try:
        return apply_security_audit_retention(
            settings.audit_log_file,
            keep_days=keep_days,
            max_records=max_records,
            confirmation=confirmation,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.put("/settings/connectors/{provider}/credential", response_model=None)
def save_connector_credential(provider: str, body: dict, request: Request) -> Any:
    _require_local_request(request)
    secret = body.get("credential") if isinstance(body, dict) else None
    try:
        return _save_connector_credential(provider, secret)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/settings/connectors/{provider}/credential", response_model=None)
def delete_connector_credential(provider: str, request: Request) -> Any:
    _require_local_request(request)
    try:
        return _delete_connector_credential(provider)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
