from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.reasoning import ai_reasoning_status
from app.connectors.registry import CONNECTOR_SPECS, registry
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import AppUser, Investigation, InvestigationMembership
from app.schemas.api import AppUserCreate, AppUserUpdate
from app.services.credentials import credential_status, remove_secret, set_secret
from app.services.identity import token_digest
from app.services.pdf_ocr import ocr_runtime_status
from app.services.security import redact_database_url, resolve_storage_root

CONNECTOR_PROVIDERS = set(CONNECTOR_SPECS)  # derives from the registry's own table (STRUCT-0022)
GLOBAL_ROLES = {"member", "admin"}
MEMBERSHIP_ROLES = {"viewer", "reporter", "admin"}


def connector_credential_status(provider: str) -> dict:
    spec = CONNECTOR_SPECS.get(provider)
    fallback = getattr(settings, spec.default_setting) if spec else ""
    return credential_status(settings.connector_credentials_file, provider, fallback)


def get_settings_status(db: Session) -> dict:
    persisted_identity_count = len(db.scalars(select(AppUser).where(AppUser.disabled == False)).all())
    ocr = ocr_runtime_status(settings.pdf_ocr_language) if settings.enable_pdf_ocr else None
    return {
        "environment": settings.app_environment,
        "database": redact_database_url(settings.database_url),
        "document_storage_dir": str(resolve_storage_root(settings.document_storage_dir)),
        "limits": {
            "max_document_bytes": settings.max_document_bytes,
            "max_backup_bytes": settings.max_backup_bytes,
            "max_backup_uncompressed_bytes": settings.max_backup_uncompressed_bytes,
            "max_backup_files": settings.max_backup_files,
        },
        "restore_api_enabled": settings.enable_restore_api,
        "document_extraction": {
            "pdf_ocr_enabled": settings.enable_pdf_ocr,
            "pdf_ocr_language": settings.pdf_ocr_language,
            "pdf_ocr_dpi": settings.pdf_ocr_dpi,
            "pdf_ocr_min_native_chars": settings.pdf_ocr_min_native_chars,
            "local_entity_suggestions_enabled": settings.enable_local_entity_suggestions,
            "entity_extraction_owner": "workbench_local" if settings.enable_local_entity_suggestions else "openaleph_ftm_analyze",
            "ocr_runtime": ({
                "available": ocr.available,
                "tessdata": ocr.tessdata,
                "requested_languages": list(ocr.requested_languages),
                "missing_languages": list(ocr.missing_languages),
                "detail": ocr.detail,
            } if ocr is not None else {
                "available": False,
                "tessdata": None,
                "requested_languages": [],
                "missing_languages": [],
                "detail": "PDF OCR is disabled by configuration",
            }),
        },
        "access": {
            "remote_api_enabled": bool(settings.api_auth_token.strip()) or persisted_identity_count > 0,
            "mode": "persisted_users" if persisted_identity_count else ("shared_bearer" if settings.api_auth_token.strip() else "local_only"),
            "token_configured": bool(settings.api_auth_token.strip()),
            "persisted_identity_count": persisted_identity_count,
            "investigation_scope_configured": bool(settings.api_auth_investigation_ids.strip()),
        },
        "cors_allowed_origins": settings.cors_origins,
        # Issue #36 follow-up: the reviewer-facing panel needs to know whether the
        # TAS reasoning endpoints are callable before offering to run them.
        "ai": ai_reasoning_status(settings),
        # STRUCT-0040: derive from CONNECTOR_PROVIDERS (itself derived from the
        # registry, STRUCT-0022) rather than a hardcoded pair, so a new
        # connector (firecrawl, or any future one) surfaces its credential
        # status here automatically instead of silently staying invisible.
        "connectors": {
            provider: connector_credential_status(provider)
            for provider in sorted(CONNECTOR_PROVIDERS)
        },
    }


def list_app_users(db: Session) -> list[dict]:
    users = db.scalars(select(AppUser).order_by(AppUser.display_name, AppUser.id)).all()
    memberships = db.scalars(select(InvestigationMembership)).all()
    by_user: dict[str, list[dict]] = {}
    for membership in memberships:
        by_user.setdefault(membership.user_id, []).append({
            "investigation_id": membership.investigation_id,
            "role": membership.role,
        })
    return [{
        "id": user.id,
        "display_name": user.display_name,
        "global_role": user.global_role,
        "disabled": user.disabled,
        "disabled_at": user.disabled_at,
        "token_created_at": user.token_created_at,
        "token_last_used_at": user.token_last_used_at,
        "token_rotated_at": user.token_rotated_at,
        "token_revoked_at": user.token_revoked_at,
        "token_status": "revoked" if user.token_revoked_at is not None else ("disabled" if user.disabled else "active"),
        "memberships": sorted(by_user.get(user.id, []), key=lambda row: row["investigation_id"]),
    } for user in users]


def create_app_user(db: Session, payload: AppUserCreate) -> dict:
    if payload.global_role not in GLOBAL_ROLES:
        raise ValueError("global_role must be member or admin")
    display_name = payload.display_name.strip()
    if not display_name:
        raise ValueError("display_name is required")
    token = secrets.token_urlsafe(32)
    user = AppUser(
        display_name=display_name,
        global_role=payload.global_role,
        token_digest=token_digest(token),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "display_name": user.display_name,
        "global_role": user.global_role,
        "token": token,
        "token_notice": "Store this token now; only its SHA-256 digest is retained.",
    }


def update_app_user(db: Session, user: AppUser, payload: AppUserUpdate) -> dict:
    if payload.display_name is not None:
        display_name = payload.display_name.strip()
        if not display_name:
            raise ValueError("display_name is required")
        user.display_name = display_name
    if payload.global_role is not None:
        if payload.global_role not in GLOBAL_ROLES:
            raise ValueError("global_role must be member or admin")
        user.global_role = payload.global_role
    if payload.disabled is not None and payload.disabled != user.disabled:
        user.disabled = payload.disabled
        user.disabled_at = utcnow_naive() if payload.disabled else None
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "display_name": user.display_name,
        "global_role": user.global_role,
        "disabled": user.disabled,
        "disabled_at": user.disabled_at,
        "token_status": "revoked" if user.token_revoked_at is not None else ("disabled" if user.disabled else "active"),
    }


def rotate_app_user_token(db: Session, user: AppUser) -> dict:
    token = secrets.token_urlsafe(32)
    now = utcnow_naive()
    user.token_digest = token_digest(token)
    user.token_created_at = now
    user.token_rotated_at = now
    user.token_revoked_at = None
    user.token_last_used_at = None
    db.commit()
    return {
        "id": user.id,
        "token": token,
        "token_created_at": now,
        "token_rotated_at": now,
        "token_notice": "Store this replacement token now; only its SHA-256 digest is retained.",
    }


def revoke_app_user_token(db: Session, user: AppUser) -> dict:
    if user.token_revoked_at is None:
        user.token_revoked_at = utcnow_naive()
        db.commit()
    return {"id": user.id, "token_revoked_at": user.token_revoked_at, "token_status": "revoked"}


def put_investigation_membership(db: Session, user_id: str, investigation_id: str, role: str) -> InvestigationMembership:
    if role not in MEMBERSHIP_ROLES:
        raise ValueError("role must be viewer, reporter, or admin")
    if db.get(AppUser, user_id) is None:
        raise LookupError("User not found")
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    membership = db.scalar(select(InvestigationMembership).where(
        InvestigationMembership.user_id == user_id,
        InvestigationMembership.investigation_id == investigation_id,
    ))
    if membership is None:
        membership = InvestigationMembership(user_id=user_id, investigation_id=investigation_id, role=role)
        db.add(membership)
    else:
        membership.role = role
    db.commit()
    return membership


def delete_investigation_membership(db: Session, user_id: str, investigation_id: str) -> bool:
    membership = db.scalar(select(InvestigationMembership).where(
        InvestigationMembership.user_id == user_id,
        InvestigationMembership.investigation_id == investigation_id,
    ))
    if membership is None:
        return False
    db.delete(membership)
    db.commit()
    return True


def save_connector_credential(provider: str, secret: str | None) -> dict:
    if provider not in CONNECTOR_PROVIDERS:
        raise LookupError("Connector not found")
    if not isinstance(secret, str) or not secret.strip():
        raise ValueError("Credential cannot be blank")
    try:
        set_secret(settings.connector_credentials_file, provider, secret)
        registry.refresh(provider)
    except (ValueError, RuntimeError) as exc:
        raise RuntimeError("Could not securely store connector credential") from exc
    return {"provider": provider, **connector_credential_status(provider)}


def delete_connector_credential(provider: str) -> dict:
    if provider not in CONNECTOR_PROVIDERS:
        raise LookupError("Connector not found")
    try:
        removed = remove_secret(settings.connector_credentials_file, provider)
        registry.refresh(provider)
    except (ValueError, RuntimeError) as exc:
        raise RuntimeError("Could not remove connector credential") from exc
    return {"provider": provider, "removed": removed, **connector_credential_status(provider)}
