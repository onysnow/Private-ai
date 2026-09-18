from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.models.domain import (
    Investigation, Entity, Statement, Source, Evidence, Claim, Lead, ReportingTask, ConnectorRun, ConnectorFinding, ResolutionDecision, CanonicalEntityMergeAudit, PropertyConflictDecision, StatementAssessment, StatementPromotion,
    EnrichmentSession, EnrichmentSessionRun, EnrichmentSessionFinding, CrossProviderDecision, RelationshipEdge,
    ExternalRelationshipReview, ExternalRelationshipPromotion, Document, DocumentChunk, ExtractionCandidate,
    AppUser, InvestigationMembership,
)
from app.schemas.api import (
    InvestigationCreate, EntityCreate, FindingReviewRequest, ResolutionRequest, CanonicalResolutionRequest, CanonicalMergeExecuteRequest, PostMergeReconciliationRequest, PropertyConflictDecisionRequest, StatementAssessmentRequest, MultiEnrichmentRequest, ExternalRelationshipReviewRequest, AppUserCreate, AppUserUpdate, InvestigationMembershipPut, InvestigationQuestionContextRequest,
    CaseSynthesisRequest, HypothesisTestRequest,
)
from app.services.ftm import make_ftm_entity
from app.services.resolution import candidate_entities, canonical_duplicate_candidates, record_canonical_resolution
from app.services.entity_merge import preview_entity_merge, execute_entity_merge
from app.services.post_merge_reconciliation import detect_post_merge_reconciliation, record_post_merge_reconciliation
from app.services.provenance import entity_statement_history
from app.services.relationships import (
    RELATIONSHIP_SCHEMAS, investigation_relationships,
    entity_relationships, investigation_graph,
)
from app.connectors.registry import registry
from app.services.external_relationships import relationship_endpoint_candidates, create_review, promote_review
from app.services.assistant_context import build_question_context
from app.ai.reasoning import run_reasoning_module, ReasoningInputError, CitationValidationError, SchemaValidationError
from app.services.dossier import entity_dossier
from app.services.timeline import investigation_timeline, _normalize_date
from app.services.documents import ingest_document, serialize_document
from app.services.exports import build_investigation_export
from app.services.security import redact_database_url, resolve_storage_root
from app.services.credentials import credential_status, set_secret, remove_secret
from app.services.lifecycle import preview_investigation_deletion, delete_investigation
from app.services.identity import token_digest
from app.services.pdf_ocr import ocr_runtime_status
from app.services.openaleph_corpus import ensure_openaleph_collection, get_binding, get_document_sync, serialize_binding, serialize_sync, sync_document_to_openaleph, import_openaleph_evidence_candidates, import_openaleph_entity_candidates, get_openaleph_review_status, refresh_openaleph_review_candidates
from app.core.config import settings
from app.core.access import request_is_local_request
from app.core.authorization import (
    scope_for_request,
    require_scope_investigation_admin,
)
from app.core.audit_log import read_security_audit, summarize_security_audit, preview_security_audit_retention, apply_security_audit_retention
import secrets
from app.services.leads import (
    LEAD_STATUSES, serialize_lead, serialize_task,
)

from app.api.dependencies import authorize_request_resource, read_upload_limited as _read_upload_limited
from app.services.connectors import (
    persist_connector_findings as _persist_connector_findings,
    enrich_entity as _enrich_entity,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/corpus/openaleph")
def get_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"binding": serialize_binding(get_binding(db, investigation_id))}


@router.post("/investigations/{investigation_id}/corpus/openaleph/ensure")
def ensure_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)):
    try:
        binding = ensure_openaleph_collection(db, investigation_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"OpenAleph collection setup failed: {exc.__class__.__name__}: {exc}")
    return {"binding": serialize_binding(binding)}


@router.get("/documents/{document_id}/corpus/openaleph")
def get_openaleph_document_sync(document_id: str, db: Session = Depends(get_db)):
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    return {"sync": serialize_sync(get_document_sync(db, document_id))}


@router.get("/documents/{document_id}/corpus/openaleph/review-status")
def get_openaleph_document_review_status(document_id: str, db: Session = Depends(get_db)):
    """Report provider sync plus human-review queue progress for one document."""
    try:
        return get_openaleph_review_status(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/documents/{document_id}/corpus/openaleph/sync")
def sync_openaleph_document(document_id: str, db: Session = Depends(get_db)):
    try:
        row = sync_document_to_openaleph(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"sync": serialize_sync(row)}


@router.post("/documents/{document_id}/corpus/openaleph/refresh-review")
def refresh_openaleph_document_review(document_id: str, db: Session = Depends(get_db)):
    """Refresh OpenAleph Page + Mention candidates without auto-accepting either."""
    try:
        return refresh_openaleph_review_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"OpenAleph review refresh failed: {exc.__class__.__name__}: {exc}")


@router.post("/documents/{document_id}/corpus/openaleph/import-evidence")
def import_openaleph_document_evidence(document_id: str, db: Session = Depends(get_db)):
    """Stage OpenAleph page text as review-required evidence candidates."""
    try:
        return import_openaleph_evidence_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"OpenAleph extraction import failed: {exc.__class__.__name__}: {exc}")


@router.post("/documents/{document_id}/corpus/openaleph/import-entities")
def import_openaleph_document_entities(document_id: str, db: Session = Depends(get_db)):
    """Stage OpenAleph/ftm-analyze Mention entities for explicit reporter review."""
    try:
        return import_openaleph_entity_candidates(db, document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"OpenAleph entity import failed: {exc.__class__.__name__}: {exc}")


def _require_local_request(request: Request) -> None:
    if not request_is_local_request(request):
        raise HTTPException(403, "Connector credential changes are restricted to the local machine")


def _connector_credential_status(provider: str) -> dict:
    fallback = settings.aleph_api_key if provider == "aleph" else settings.opensanctions_api_key
    return credential_status(settings.connector_credentials_file, provider, fallback)


@router.get("/settings/status")
def settings_status(db: Session = Depends(get_db)):
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
        "connectors": {
            "aleph": _connector_credential_status("aleph"),
            "opensanctions": _connector_credential_status("opensanctions"),
        },
    }


@router.get("/settings/security/users")
def list_app_users(request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
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


@router.post("/settings/security/users")
def create_app_user(payload: AppUserCreate, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    if payload.global_role not in {"member", "admin"}:
        raise HTTPException(400, "global_role must be member or admin")
    token = secrets.token_urlsafe(32)
    user = AppUser(
        display_name=payload.display_name.strip(),
        global_role=payload.global_role,
        token_digest=token_digest(token),
    )
    if not user.display_name:
        raise HTTPException(400, "display_name is required")
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


@router.patch("/settings/security/users/{user_id}")
def update_app_user(user_id: str, payload: AppUserUpdate, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if payload.display_name is not None:
        display_name = payload.display_name.strip()
        if not display_name:
            raise HTTPException(400, "display_name is required")
        user.display_name = display_name
    if payload.global_role is not None:
        if payload.global_role not in {"member", "admin"}:
            raise HTTPException(400, "global_role must be member or admin")
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


@router.post("/settings/security/users/{user_id}/token/rotate")
def rotate_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
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


@router.post("/settings/security/users/{user_id}/token/revoke")
def revoke_app_user_token(user_id: str, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.token_revoked_at is None:
        user.token_revoked_at = utcnow_naive()
        db.commit()
    return {"id": user.id, "token_revoked_at": user.token_revoked_at, "token_status": "revoked"}


@router.put("/settings/security/users/{user_id}/investigations/{investigation_id}")
def put_investigation_membership(user_id: str, investigation_id: str, payload: InvestigationMembershipPut, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    if payload.role not in {"viewer", "reporter", "admin"}:
        raise HTTPException(400, "role must be viewer, reporter, or admin")
    if db.get(AppUser, user_id) is None:
        raise HTTPException(404, "User not found")
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    membership = db.scalar(select(InvestigationMembership).where(
        InvestigationMembership.user_id == user_id,
        InvestigationMembership.investigation_id == investigation_id,
    ))
    if membership is None:
        membership = InvestigationMembership(user_id=user_id, investigation_id=investigation_id, role=payload.role)
        db.add(membership)
    else:
        membership.role = payload.role
    db.commit()
    return {"user_id": user_id, "investigation_id": investigation_id, "role": membership.role}


@router.delete("/settings/security/users/{user_id}/investigations/{investigation_id}", status_code=204)
def delete_investigation_membership(user_id: str, investigation_id: str, request: Request, db: Session = Depends(get_db)):
    _require_local_request(request)
    membership = db.scalar(select(InvestigationMembership).where(
        InvestigationMembership.user_id == user_id,
        InvestigationMembership.investigation_id == investigation_id,
    ))
    if membership is None:
        return Response(status_code=204)
    db.delete(membership)
    db.commit()
    return Response(status_code=204)


@router.get("/settings/security/audit")
def get_security_audit(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=1_000_000),
    event: str | None = None,
    method: str | None = None,
    status_code: int | None = Query(default=None, ge=100, le=599),
):
    return read_security_audit(
        settings.audit_log_file,
        limit=limit,
        offset=offset,
        event=event,
        method=method,
        status_code=status_code,
    )


@router.get("/settings/security/audit/summary")
def get_security_audit_summary():
    return summarize_security_audit(settings.audit_log_file)


@router.get("/settings/security/audit/retention-preview")
def get_security_audit_retention_preview(
    request: Request,
    keep_days: int = Query(90, ge=1, le=3650),
    max_records: int = Query(5000, ge=100, le=1_000_000),
):
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


@router.post("/settings/security/audit/retention")
def prune_security_audit(body: dict, request: Request):
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


@router.put("/settings/connectors/{provider}/credential")
def save_connector_credential(provider: str, body: dict, request: Request):
    _require_local_request(request)
    if provider not in {"aleph", "opensanctions"}:
        raise HTTPException(404, "Connector not found")
    secret = body.get("credential") if isinstance(body, dict) else None
    if not isinstance(secret, str) or not secret.strip():
        raise HTTPException(400, "Credential cannot be blank")
    try:
        set_secret(settings.connector_credentials_file, provider, secret)
        registry.refresh(provider)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(500, "Could not securely store connector credential") from exc
    return {"provider": provider, **_connector_credential_status(provider)}


@router.delete("/settings/connectors/{provider}/credential")
def delete_connector_credential(provider: str, request: Request):
    _require_local_request(request)
    if provider not in {"aleph", "opensanctions"}:
        raise HTTPException(404, "Connector not found")
    try:
        removed = remove_secret(settings.connector_credentials_file, provider)
        registry.refresh(provider)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(500, "Could not remove connector credential") from exc
    return {"provider": provider, "removed": removed, **_connector_credential_status(provider)}


@router.post("/investigations/{investigation_id}/assistant/context")
def investigation_question_context(
    investigation_id: str, body: InvestigationQuestionContextRequest, db: Session = Depends(get_db),
):
    """Build a provenance-bearing retrieval packet for the local AI layer."""
    try:
        return build_question_context(
            db, investigation_id=investigation_id, question=body.question,
            max_results=body.max_results, include_external_leads=body.include_external_leads,
            include_reconciled_duplicates=body.include_reconciled_duplicates,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


def _run_reasoning_endpoint(db: Session, *, investigation_id: str, module: str, question: str, max_results: int, include_external_leads: bool, working_theory: str | None = None):
    if not settings.enable_ai_features or not (settings.ai_provider or "").strip():
        raise HTTPException(400, "AI reasoning endpoints are not enabled on this deployment (enable_ai_features and ai_provider must both be set)")
    try:
        candidate = run_reasoning_module(
            db, investigation_id=investigation_id, module=module, question=question,
            working_theory=working_theory, max_results=max_results, include_external_leads=include_external_leads,
        )
        return {"candidate_id": candidate.id, "review_status": candidate.review_status, "payload": candidate.payload}
    except ReasoningInputError as exc:
        raise HTTPException(400, str(exc))
    except CitationValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: referenced evidence not present in the retrieval packet.", "invalid_citations": exc.bad_refs})
    except SchemaValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: did not match the required output schema.", "schema_errors": exc.errors})
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/investigations/{investigation_id}/assistant/case-synthesis")
def investigation_case_synthesis(
    investigation_id: str, body: CaseSynthesisRequest, db: Session = Depends(get_db),
):
    """TAS Module 08 (Case Synthesis) as a real, citation-validated LLM call.

    Never writes to canonical records — the result is persisted as a
    review_status="proposed" AIAnalysisCandidate. See app/ai/reasoning.py.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="case_synthesis", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
    )


@router.post("/investigations/{investigation_id}/assistant/hypothesis-test")
def investigation_hypothesis_test(
    investigation_id: str, body: HypothesisTestRequest, db: Session = Depends(get_db),
):
    """TAS Module 06 (Hypothesis and Contradiction Testing) as a real,
    citation-validated LLM call. Same non-canonical-write guarantee as
    /assistant/case-synthesis above.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="hypothesis_test", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        working_theory=body.working_theory,
    )


@router.get("/investigations/{investigation_id}/timeline")
def get_investigation_timeline(
    investigation_id: str,
    kind: list[str] | None = Query(default=None),
    verification_status: list[str] | None = Query(default=None),
    include_record_activity: bool = False,
    db: Session = Depends(get_db),
):
    try:
        return investigation_timeline(
            db, investigation_id, kinds=set(kind or []) or None,
            verification_statuses=set(verification_status or []) or None,
            include_record_activity=include_record_activity,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/export")
def export_investigation(
    investigation_id: str,
    include_documents: bool = True,
    db: Session = Depends(get_db),
):
    try:
        payload, manifest = build_investigation_export(db, investigation_id, include_documents=include_documents)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    inv = manifest["investigation"]
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in inv["name"]).strip("_") or "investigation"
    filename = f"{safe_name}.jwbackup.zip"
    return Response(
        content=payload, media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-JW-Backup-Version": str(manifest["version"]),
        },
    )


@router.post("/investigations")
def create_investigation(body: InvestigationCreate, db: Session = Depends(get_db)):
    row = Investigation(name=body.name, description=body.description)
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.get("/investigations")
def list_investigations(request: Request, db: Session = Depends(get_db)):
    rows = db.scalars(select(Investigation).order_by(Investigation.created_at.desc())).all()
    scope = scope_for_request(request)
    if scope.unrestricted:
        return rows
    return [row for row in rows if scope.allows(row.id)]

@router.get("/investigations/{investigation_id}/deletion-preview")
def investigation_deletion_preview(investigation_id: str, db: Session = Depends(get_db)):
    try:
        return preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.delete("/investigations/{investigation_id}")
def remove_investigation(investigation_id: str, request: Request, confirmation: str = Query(...), db: Session = Depends(get_db)):
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        return delete_investigation(db, investigation_id, settings.document_storage_dir, confirmation=confirmation)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.post("/entities")
def create_entity(body: EntityCreate, db: Session = Depends(get_db)):
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        ftm = make_ftm_entity(body.schema, body.caption, body.properties)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    row = Entity(investigation_id=body.investigation_id, ftm_id=ftm["id"], schema=ftm["schema"], caption=body.caption, properties=ftm["properties"])
    db.add(row); db.flush()
    for prop, values in ftm["properties"].items():
        for value in values:
            db.add(Statement(entity_id=row.id, prop=prop, value=value, dataset=body.dataset, origin=body.origin, original_value=value))
    db.commit(); db.refresh(row)
    return row

@router.get("/investigations/{investigation_id}/entities")
def list_entities(investigation_id: str, include_relationships: bool = False, db: Session = Depends(get_db)):
    stmt = select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))
    if not include_relationships:
        relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
        stmt = stmt.where(~Entity.id.in_(relationship_ids))
    return db.scalars(stmt.order_by(Entity.caption)).all()

@router.get("/entities/{entity_id}/dossier")
def get_entity_dossier(entity_id: str, db: Session = Depends(get_db)):
    try:
        return entity_dossier(db, entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/entities/{entity_id}/property-conflicts/{prop}/decisions")
def decide_property_conflict(entity_id: str, prop: str, body: PropertyConflictDecisionRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    allowed = {"preferred", "superseded", "temporal_change", "both_valid", "unresolved"}
    if body.decision not in allowed:
        raise HTTPException(400, f"decision must be one of: {', '.join(sorted(allowed))}")
    ledger = entity_statement_history(db, entity_id)
    available = {row["value"] for row in ledger if row["prop"] == prop}
    values = list(dict.fromkeys(body.values))
    if len(values) < 2 or not set(values).issubset(available):
        raise HTTPException(400, "values must identify at least two current ledger values for this property")
    if body.decision == "preferred":
        if body.preferred_value not in values:
            raise HTTPException(400, "preferred decisions require preferred_value from the reviewed values")
    elif body.preferred_value is not None:
        raise HTTPException(400, "preferred_value is only valid for a preferred decision")
    intervals = [item.model_dump() for item in body.temporal_intervals]
    if intervals and body.decision != "temporal_change":
        raise HTTPException(400, "temporal_intervals are only valid for a temporal_change decision")
    for interval in intervals:
        if interval["value"] not in values:
            raise HTTPException(400, "temporal interval values must be among the reviewed values")
        if not interval.get("date_start") and not interval.get("date_end"):
            raise HTTPException(400, "temporal intervals require date_start and/or date_end; dates are never inferred")
        for key in ("date_start", "date_end"):
            if interval.get(key) and _normalize_date(interval[key]) is None:
                raise HTTPException(400, f"{key} must be YYYY, YYYY-MM, or YYYY-MM-DD")
        if interval.get("evidence_id"):
            evidence = db.get(Evidence, interval["evidence_id"]); source = db.get(Source, evidence.source_id) if evidence else None
            if evidence is None or source is None or source.investigation_id != entity.investigation_id:
                raise HTTPException(400, "temporal interval evidence must belong to this investigation")
    row = PropertyConflictDecision(
        investigation_id=entity.investigation_id, entity_id=entity.id, prop=prop,
        decision=body.decision, values_json=values, preferred_value=body.preferred_value, rationale=body.rationale,
        temporal_intervals_json=intervals,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.get("/entities/{entity_id}/property-conflicts/{prop}/decisions")
def list_property_conflict_decisions(entity_id: str, prop: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.entity_id == entity_id, PropertyConflictDecision.prop == prop
    ).order_by(PropertyConflictDecision.created_at.desc())).all()

@router.get("/entities/{entity_id}/statements")
def list_entity_statements(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(Statement).where(Statement.entity_id == entity_id)).all()


@router.get("/entities/{entity_id}/statement-history")
def list_entity_statement_history(entity_id: str, db: Session = Depends(get_db)):
    try:
        return entity_statement_history(db, entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/relationships")
def list_investigation_relationships(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_relationships(db, investigation_id)


@router.get("/investigations/{investigation_id}/graph")
def get_investigation_graph(
    investigation_id: str,
    schema: list[str] | None = Query(default=None),
    include_reconciled_duplicates: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    requested = set(schema or [])
    unsupported = requested - set(RELATIONSHIP_SCHEMAS)
    if unsupported:
        raise HTTPException(400, f"Unsupported relationship schema(s): {', '.join(sorted(unsupported))}")
    return investigation_graph(
        db, investigation_id, requested or None,
        include_reconciled_duplicates=include_reconciled_duplicates,
    )


@router.get("/entities/{entity_id}/relationships")
def list_entity_relationships(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return entity_relationships(db, entity_id)


@router.post("/documents/upload")
async def upload_document(
    investigation_id: str = Form(...),
    title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    data = await _read_upload_limited(file, settings.max_document_bytes)
    if not data:
        raise HTTPException(400, "Document is empty")
    try:
        doc = ingest_document(
            db, investigation_id=investigation_id, title=title or file.filename or "Document",
            filename=file.filename or "document", mime_type=file.content_type, data=data,
            storage_dir=resolve_storage_root(settings.document_storage_dir),
        )
    except ValueError as exc:
        if str(exc) == "Investigation not found":
            raise HTTPException(404, str(exc))
        raise
    if doc.extraction_status == "failed":
        raise HTTPException(422, {"message": "Document saved but extraction failed", "document": serialize_document(db, doc), "error": doc.extraction_error})
    result = serialize_document(db, doc)
    if settings.openaleph_enabled and settings.openaleph_auto_sync_documents:
        sync_row = sync_document_to_openaleph(db, doc.id)
        result["openaleph_sync"] = serialize_sync(sync_row)
    else:
        result["openaleph_sync"] = serialize_sync(get_document_sync(db, doc.id))
    return result


@router.get("/investigations/{investigation_id}/documents")
def list_documents(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at.desc())).all()
    return [serialize_document(db, row) for row in rows]


@router.get("/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)):
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    result = serialize_document(db, row)
    result["chunks"] = db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == row.id).order_by(DocumentChunk.ordinal)).all()
    return result


@router.get("/documents/{document_id}/candidates")
def list_document_candidates(document_id: str, status: str | None = None, candidate_type: str | None = None, db: Session = Depends(get_db)):
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    stmt = select(ExtractionCandidate).where(ExtractionCandidate.document_id == document_id)
    if status: stmt = stmt.where(ExtractionCandidate.review_status == status)
    if candidate_type: stmt = stmt.where(ExtractionCandidate.candidate_type == candidate_type)
    return db.scalars(stmt.order_by(ExtractionCandidate.created_at)).all()


@router.get("/investigations/{investigation_id}/evidence")
def list_investigation_evidence(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    sources = db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all()
    source_by_id = {source.id: source for source in sources}
    if not source_by_id:
        return []
    evidence_rows = db.scalars(
        select(Evidence)
        .where(Evidence.source_id.in_(source_by_id.keys()))
        .order_by(Evidence.id)
    ).all()
    return [{"evidence": evidence, "source": source_by_id[evidence.source_id]} for evidence in evidence_rows]


@router.get("/investigations/{investigation_id}/sources")
def list_sources(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(Source).where(Source.investigation_id == investigation_id).order_by(Source.created_at.desc())).all()

@router.get("/investigations/{investigation_id}/claims")
def list_claims(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(Claim).where(Claim.investigation_id == investigation_id).order_by(Claim.created_at.desc())).all()


@router.get("/investigations/{investigation_id}/leads")
def list_leads(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    return [serialize_lead(db, row) for row in rows]


@router.get("/investigations/{investigation_id}/leads/queue")
def lead_queue(
    investigation_id: str,
    status: list[str] | None = Query(default=None),
    priority: list[str] | None = Query(default=None),
    owner: str | None = None,
    unresolved_only: bool = True,
    db: Session = Depends(get_db),
):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    items = [serialize_lead(db, row) for row in rows]
    requested_status = set(status or [])
    requested_priority = set(priority or [])
    if unresolved_only and not requested_status:
        requested_status = {"unreviewed", "active", "blocked"}
    if requested_status:
        items = [item for item in items if item["status"] in requested_status]
    if requested_priority:
        items = [item for item in items if item["priority"] in requested_priority]
    if owner is not None:
        items = [item for item in items if (item["owner"] or "") == owner]
    priority_rank = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    # Reporter-set priority remains authoritative. Within the same priority bucket,
    # surface leads with explicit contradiction/dispute pressure first.
    items.sort(key=lambda item: (
        priority_rank.get(item["priority"], 9),
        -item.get("triage", {}).get("attention_score", 0),
        item["created_at"],
    ))
    counts = {key: sum(1 for item in items if item["status"] == key) for key in sorted(LEAD_STATUSES)}
    return {"investigation_id": investigation_id, "total": len(items), "counts": counts, "items": items}


@router.get("/investigations/{investigation_id}/reporting-tasks")
def list_reporting_tasks(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(ReportingTask).where(ReportingTask.investigation_id == investigation_id).order_by(ReportingTask.created_at.desc())).all()
    return [serialize_task(db, row) for row in rows]


@router.post("/entities/{entity_id}/enrich/{provider}")
async def enrich_entity(entity_id: str, provider: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return await _enrich_entity(provider, entity, db)


@router.post("/entities/{entity_id}/enrich")
async def enrich_entity_multi(entity_id: str, body: MultiEnrichmentRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")

    providers = body.providers or registry.names()
    providers = list(dict.fromkeys(providers))
    unknown = [name for name in providers if registry.get(name) is None]
    if unknown:
        raise HTTPException(400, f"Unknown connectors: {', '.join(unknown)}")

    session = EnrichmentSession(
        investigation_id=entity.investigation_id, entity_id=entity.id, providers=providers, status="running",
    )
    db.add(session); db.commit(); db.refresh(session)

    provider_results = []
    total_results = 0
    failures = 0
    for provider in providers:
        session_run = EnrichmentSessionRun(
            session_id=session.id, provider=provider, status="running", started_at=utcnow_naive(),
        )
        db.add(session_run); db.commit(); db.refresh(session_run)
        connector = registry.get(provider)
        run = ConnectorRun(
            investigation_id=entity.investigation_id, provider=provider, query=f"entity:{entity.ftm_id or entity.id}",
        )
        db.add(run); db.commit(); db.refresh(run)
        session_run.run_id = run.id; db.commit()
        try:
            findings = await connector.enrich({
                "id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption,
                "properties": entity.properties or {},
            })
            rows = _persist_connector_findings(db, run, entity.investigation_id, provider, findings)
            for finding_row in rows:
                link = db.scalar(select(EnrichmentSessionFinding).where(
                    EnrichmentSessionFinding.session_id == session.id,
                    EnrichmentSessionFinding.finding_id == finding_row.id,
                ))
                if link is None:
                    db.add(EnrichmentSessionFinding(session_id=session.id, finding_id=finding_row.id, provider=provider))
            db.commit()
            session_run.status = "completed"
            session_run.result_count = len(rows)
            session_run.finished_at = utcnow_naive()
            total_results += len(rows)
            provider_results.append({"provider": provider, "status": "completed", "result_count": len(rows), "run_id": run.id})
        except Exception as exc:
            failures += 1
            run.status = "failed"; run.error = str(exc); run.finished_at = utcnow_naive()
            session_run.status = "failed"; session_run.error = str(exc); session_run.finished_at = utcnow_naive()
            provider_results.append({"provider": provider, "status": "failed", "result_count": 0, "run_id": run.id, "error": str(exc)})
        db.commit()

    session.total_results = total_results
    session.status = "failed" if providers and failures == len(providers) else ("partial" if failures else "completed")
    session.finished_at = utcnow_naive()
    db.commit(); db.refresh(session)
    return {
        "id": session.id, "entity_id": session.entity_id, "investigation_id": session.investigation_id,
        "status": session.status, "providers": providers, "total_results": total_results,
        "started_at": session.started_at, "finished_at": session.finished_at, "runs": provider_results,
    }


@router.get("/entities/{entity_id}/enrichment-sessions")
def list_entity_enrichment_sessions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(EnrichmentSession).where(EnrichmentSession.entity_id == entity_id).order_by(EnrichmentSession.started_at.desc())).all()


@router.get("/entities/{entity_id}/cross-provider-decisions")
def list_cross_provider_decisions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(CrossProviderDecision).where(CrossProviderDecision.entity_id == entity_id).order_by(CrossProviderDecision.created_at.desc())).all()


@router.get("/investigations/{investigation_id}/connector-runs")
def list_connector_runs(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorRun).where(ConnectorRun.investigation_id == investigation_id).order_by(ConnectorRun.started_at.desc())).all()

@router.get("/investigations/{investigation_id}/connector-findings")
def list_connector_findings(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorFinding).where(ConnectorFinding.investigation_id == investigation_id).order_by(ConnectorFinding.created_at.desc())).all()


@router.get("/connector-findings/{finding_id}/relationship-candidates")
def external_relationship_candidates(finding_id: str, db: Session = Depends(get_db)):
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    try:
        return relationship_endpoint_candidates(db, finding)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/connector-findings/{finding_id}/relationship-reviews")
def list_external_relationship_reviews(finding_id: str, db: Session = Depends(get_db)):
    if db.get(ConnectorFinding, finding_id) is None:
        raise HTTPException(404, "Finding not found")
    return db.scalars(select(ExternalRelationshipReview).where(ExternalRelationshipReview.finding_id == finding_id).order_by(ExternalRelationshipReview.created_at.desc())).all()


@router.post("/connector-findings/{finding_id}/relationship-reviews")
def review_external_relationship(finding_id: str, body: ExternalRelationshipReviewRequest, db: Session = Depends(get_db)):
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    try:
        return create_review(db, finding, body.source_entity_id, body.target_entity_id, body.decision, body.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/external-relationship-reviews/{review_id}/promote")
def promote_external_relationship(review_id: str, db: Session = Depends(get_db)):
    review = db.get(ExternalRelationshipReview, review_id)
    if review is None:
        raise HTTPException(404, "Relationship review not found")
    try:
        return promote_review(db, review)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/entities/{entity_id}/external-relationship-promotions")
def list_external_relationship_promotions(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(ExternalRelationshipPromotion).where(
        (ExternalRelationshipPromotion.investigation_id == entity.investigation_id),
        ((ExternalRelationshipPromotion.relationship_entity_id == entity_id))
    ).order_by(ExternalRelationshipPromotion.promoted_at.desc())).all()

@router.patch("/connector-findings/{finding_id}/review")
def review_finding(finding_id: str, body: FindingReviewRequest, db: Session = Depends(get_db)):
    if body.status not in {"unreviewed", "accepted", "needs_followup", "rejected"}:
        raise HTTPException(400, "Invalid review status")
    row = db.get(ConnectorFinding, finding_id)
    if row is None: raise HTTPException(404, "Finding not found")
    row.review_status = body.status; db.commit(); db.refresh(row)
    return row

@router.get("/entities/{entity_id}/duplicate-candidates")
def entity_duplicate_candidates(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return canonical_duplicate_candidates(db, entity)

@router.post("/entities/{entity_id}/canonical-resolution")
def canonical_entity_resolution(entity_id: str, body: CanonicalResolutionRequest, db: Session = Depends(get_db)):
    if body.decision not in {"same", "different", "unsure"}:
        raise HTTPException(400, "Decision must be same, different, or unsure")
    entity = db.get(Entity, entity_id); other = db.get(Entity, body.other_entity_id)
    if entity is None or other is None:
        raise HTTPException(404, "Entity not found")
    try:
        return record_canonical_resolution(db, entity, other, decision=body.decision, confidence=body.confidence, rationale=body.rationale)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.get("/entities/{entity_id}/merge-preview")
def entity_merge_preview(entity_id: str, target_entity_id: str = Query(...), db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id); target = db.get(Entity, target_entity_id)
    try:
        return preview_entity_merge(db, source, target)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.post("/entities/{entity_id}/merge")
def entity_merge_execute(entity_id: str, body: CanonicalMergeExecuteRequest, db: Session = Depends(get_db)):
    source = db.get(Entity, entity_id); target = db.get(Entity, body.target_entity_id)
    try:
        audit = execute_entity_merge(db, source, target, preview_digest=body.preview_digest, rationale=body.rationale)
        return {"audit": audit, "source_entity_id": entity_id, "target_entity_id": body.target_entity_id}
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.get("/entities/{entity_id}/merge-history")
def entity_merge_history(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(CanonicalEntityMergeAudit).where(
        CanonicalEntityMergeAudit.investigation_id == entity.investigation_id,
        ((CanonicalEntityMergeAudit.source_entity_id == entity_id) | (CanonicalEntityMergeAudit.target_entity_id == entity_id))
    ).order_by(CanonicalEntityMergeAudit.created_at.desc())).all()

@router.get("/entities/{entity_id}/post-merge-reconciliation")
def entity_post_merge_reconciliation(entity_id: str, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    try:
        return detect_post_merge_reconciliation(db, entity)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.post("/entities/{entity_id}/post-merge-reconciliation")
def decide_entity_post_merge_reconciliation(entity_id: str, body: PostMergeReconciliationRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Entity not found")
    try:
        return record_post_merge_reconciliation(
            db, entity, record_type=body.record_type, record_a_id=body.record_a_id, record_b_id=body.record_b_id,
            decision=body.decision, rationale=body.rationale, preferred_record_id=body.preferred_record_id,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.get("/connector-findings/{finding_id}/candidates")
def finding_candidates(finding_id: str, db: Session = Depends(get_db)):
    row = db.get(ConnectorFinding, finding_id)
    if row is None: raise HTTPException(404, "Finding not found")
    return candidate_entities(db, row.investigation_id, row.caption, row.schema)

@router.post("/connector-findings/{finding_id}/resolution")
def resolve_finding(finding_id: str, body: ResolutionRequest, db: Session = Depends(get_db)):
    if body.decision not in {"positive", "negative", "unsure"}:
        raise HTTPException(400, "Decision must be positive, negative, or unsure")
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None: raise HTTPException(404, "Finding not found")
    if body.entity_id and db.get(Entity, body.entity_id) is None:
        raise HTTPException(404, "Entity not found")
    row = ResolutionDecision(
        investigation_id=finding.investigation_id, finding_id=finding.id, entity_id=body.entity_id,
        decision=body.decision, confidence=body.confidence, rationale=body.rationale,
    )
    finding.review_status = "accepted" if body.decision == "positive" else ("rejected" if body.decision == "negative" else "needs_followup")
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.get("/connector-findings/{finding_id}/assessments")
def list_assessments(finding_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(StatementAssessment).where(StatementAssessment.finding_id == finding_id).order_by(StatementAssessment.created_at.desc())).all()

@router.post("/connector-findings/{finding_id}/assessments")
def assess_statement(finding_id: str, body: StatementAssessmentRequest, db: Session = Depends(get_db)):
    allowed = {"accepted", "conflicting", "outdated", "superseded", "unresolved"}
    if body.status not in allowed:
        raise HTTPException(400, f"Status must be one of: {', '.join(sorted(allowed))}")
    finding = db.get(ConnectorFinding, finding_id)
    if finding is None: raise HTTPException(404, "Finding not found")
    if body.entity_id and db.get(Entity, body.entity_id) is None:
        raise HTTPException(404, "Entity not found")
    row = StatementAssessment(
        investigation_id=finding.investigation_id, finding_id=finding.id, entity_id=body.entity_id,
        prop=body.prop, value=body.value, status=body.status, note=body.note,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.get("/entities/{entity_id}/promotions")
def list_entity_promotions(entity_id: str, db: Session = Depends(get_db)):
    if db.get(Entity, entity_id) is None:
        raise HTTPException(404, "Entity not found")
    return db.scalars(select(StatementPromotion).where(StatementPromotion.entity_id == entity_id).order_by(StatementPromotion.promoted_at.desc())).all()
