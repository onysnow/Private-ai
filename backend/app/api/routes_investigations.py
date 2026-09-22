"""Investigation endpoints: /investigations/*.

Group 8 (final group) of the Stage E routes.py split. Covers
investigation CRUD (create/list/deletion-preview/delete), OpenAleph
corpus binding, AI assistant context/case-synthesis/hypothesis-test,
timeline, backup export, relationships/graph, and investigation-scoped
listing of documents, evidence, sources, claims, leads (+ queue),
reporting-tasks, connector-runs, and connector-findings.

This is the last of the 8 groups in REMEDIATION_PROMPT.md's Stage E
plan (STRUCT-0002/0008); once this landed, app/api/routes.py itself
was deleted and main.py no longer imports it.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.ai.governor import ReasoningThrottled
from app.ai.llm_client import LLMProviderError
from app.ai.reasoning import (
    CitationValidationError,
    ModelOutputError,
    ReasoningInputError,
    SchemaValidationError,
    list_ai_analysis_candidates,
    run_reasoning_module,
)
from app.api.dependencies import authorize_request_resource
from app.core.authorization import require_scope_investigation_admin, scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.api import (
    CaseSynthesisRequest, HypothesisTestRequest, InvestigationCreate,
    InvestigationQuestionContextRequest,
)
from app.services.assistant_context import build_question_context
from app.services.exports import build_investigation_export
from app.services.investigations import (
    create_investigation as _create_investigation,
    lead_queue as _lead_queue,
    list_investigation_claims as _list_investigation_claims,
    list_investigation_connector_findings as _list_investigation_connector_findings,
    list_investigation_connector_runs as _list_investigation_connector_runs,
    list_investigation_documents as _list_investigation_documents,
    list_investigation_evidence as _list_investigation_evidence,
    list_investigation_leads as _list_investigation_leads,
    list_investigation_reporting_tasks as _list_investigation_reporting_tasks,
    list_investigation_sources as _list_investigation_sources,
    list_investigations as _list_investigations,
)
from app.services.lifecycle import delete_investigation, preview_investigation_deletion
from app.services.openaleph_corpus import (
    ensure_openaleph_collection,
    get_binding,
    list_openaleph_operation_failures,
    record_openaleph_operation_failure,
    serialize_binding,
)
from app.services.relationships import (
    RELATIONSHIP_SCHEMAS,
    investigation_graph,
    investigation_relationships,
)
from app.services.timeline import investigation_timeline

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/corpus/openaleph", response_model=None)
def get_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"binding": serialize_binding(get_binding(db, investigation_id))}


@router.get("/investigations/{investigation_id}/corpus/openaleph/failures", response_model=None)
def list_openaleph_corpus_failures(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Server-side trace of failed OpenAleph pipeline operations (STRUCT-0027).

    Covers collection setup, review refresh, and evidence/entity import --
    the operations that previously left no record of *why* a 502 happened
    beyond whatever the caller saw in that one HTTP response.
    """
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return list_openaleph_operation_failures(db, investigation_id)


@router.post("/investigations/{investigation_id}/corpus/openaleph/ensure", response_model=None)
def ensure_openaleph_corpus_binding(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        binding = ensure_openaleph_collection(db, investigation_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        db.rollback()
        record_openaleph_operation_failure(
            db, investigation_id=investigation_id, document_id=None,
            operation="ensure_collection", error=f"{exc.__class__.__name__}: {exc}",
        )
        raise HTTPException(502, f"OpenAleph collection setup failed. Details were logged server-side (request {request.state.request_id}).")
    return {"binding": serialize_binding(binding)}


@router.post("/investigations/{investigation_id}/assistant/context", response_model=None)
def investigation_question_context(
    investigation_id: str, body: InvestigationQuestionContextRequest, db: Session = Depends(get_db),
) -> Any:
    """Build a provenance-bearing retrieval packet for the local AI layer."""
    try:
        return build_question_context(
            db, investigation_id=investigation_id, question=body.question,
            max_results=body.max_results, include_external_leads=body.include_external_leads,
            include_reconciled_duplicates=body.include_reconciled_duplicates,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


def _run_reasoning_endpoint(db: Session, *, investigation_id: str, module: str, question: str, max_results: int, include_external_leads: bool, working_theory: str | None = None, control_flags: dict | None = None) -> dict[str, Any]:
    if not settings.enable_ai_features or not (settings.ai_provider or "").strip():
        raise HTTPException(400, "AI reasoning endpoints are not enabled on this deployment (enable_ai_features and ai_provider must both be set)")
    try:
        candidate = run_reasoning_module(
            db, investigation_id=investigation_id, module=module, question=question,
            working_theory=working_theory, max_results=max_results, include_external_leads=include_external_leads,
            control_flags=control_flags,
        )
        return {"candidate_id": candidate.id, "review_status": candidate.review_status, "payload": candidate.payload}
    except ReasoningInputError as exc:
        raise HTTPException(400, str(exc))
    except ReasoningThrottled as exc:
        raise HTTPException(429, str(exc), headers={"Retry-After": str(exc.retry_after_seconds)})
    except LLMProviderError as exc:
        # STRUCT-0028: no raw vendor error text in the response; the exception message
        # is what the server log/audit gets.
        raise HTTPException(502, "The AI provider request failed (network, authentication, or provider error). Check the server log for details.")
    except ModelOutputError as exc:
        # Provider/model failure, persisted as a rejected candidate for the audit trail;
        # 502 because nothing about the reporter's request was wrong.
        raise HTTPException(502, {"message": f"Model output unusable: {exc}", "rejection_reason": exc.reason})
    except CitationValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: referenced evidence not present in the retrieval packet.", "invalid_citations": exc.bad_refs})
    except SchemaValidationError as exc:
        raise HTTPException(422, {"message": "Model output rejected: did not match the required output schema.", "schema_errors": exc.errors})
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/investigations/{investigation_id}/assistant/case-synthesis", response_model=None)
def investigation_case_synthesis(
    investigation_id: str, body: CaseSynthesisRequest, db: Session = Depends(get_db),
) -> Any:
    """TAS Module 08 (Case Synthesis) as a real, citation-validated LLM call.

    Never writes to canonical records — the result is persisted as a
    review_status="proposed" AIAnalysisCandidate. See app/ai/reasoning.py.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="case_synthesis", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        control_flags={"severity_floor": body.severity_floor, "source_tier_floor": body.source_tier_floor},
    )


@router.post("/investigations/{investigation_id}/assistant/hypothesis-test", response_model=None)
def investigation_hypothesis_test(
    investigation_id: str, body: HypothesisTestRequest, db: Session = Depends(get_db),
) -> Any:
    """TAS Module 06 (Hypothesis and Contradiction Testing) as a real,
    citation-validated LLM call. Same non-canonical-write guarantee as
    /assistant/case-synthesis above.
    """
    return _run_reasoning_endpoint(
        db, investigation_id=investigation_id, module="hypothesis_test", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        working_theory=body.working_theory,
        control_flags={"severity_floor": body.severity_floor, "source_tier_floor": body.source_tier_floor},
    )


@router.get("/investigations/{investigation_id}/ai-analysis-candidates", response_model=None)
def list_investigation_ai_analysis_candidates(
    investigation_id: str,
    review_status: str | None = None,
    module: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """The review queue for TAS reasoning output, newest first. Payloads are
    omitted here; GET /ai-analysis-candidates/{id} returns the full row.
    """
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return {"candidates": list_ai_analysis_candidates(
            db, investigation_id=investigation_id, review_status=review_status, module=module, limit=limit, offset=offset,
        )}
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/investigations/{investigation_id}/timeline", response_model=None)
def get_investigation_timeline(
    investigation_id: str,
    kind: list[str] | None = Query(default=None),
    verification_status: list[str] | None = Query(default=None),
    include_record_activity: bool = False,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    try:
        return investigation_timeline(
            db, investigation_id, kinds=set(kind or []) or None,
            verification_statuses=set(verification_status or []) or None,
            include_record_activity=include_record_activity, limit=limit, offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/export")
def export_investigation(
    investigation_id: str,
    include_documents: bool = True,
    db: Session = Depends(get_db),
) -> Response:
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


@router.post("/investigations", response_model=None)
def create_investigation(body: InvestigationCreate, db: Session = Depends(get_db)) -> Any:
    return _create_investigation(db, body)


@router.get("/investigations", response_model=None)
def list_investigations(request: Request, db: Session = Depends(get_db)) -> Any:
    scope = scope_for_request(request)
    return _list_investigations(db, scope)


@router.get("/investigations/{investigation_id}/deletion-preview", response_model=None)
def investigation_deletion_preview(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    try:
        return preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.delete("/investigations/{investigation_id}", response_model=None)
def remove_investigation(investigation_id: str, request: Request, confirmation: str = Query(...), db: Session = Depends(get_db)) -> Any:
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        return delete_investigation(db, investigation_id, settings.document_storage_dir, confirmation=confirmation)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.get("/investigations/{investigation_id}/relationships", response_model=None)
def list_investigation_relationships(
    investigation_id: str,
    include_reconciled_duplicates: bool = Query(default=True),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_relationships(
        db, investigation_id, include_reconciled_duplicates=include_reconciled_duplicates, limit=limit, offset=offset,
    )


@router.get("/investigations/{investigation_id}/graph", response_model=None)
def get_investigation_graph(
    investigation_id: str,
    schema: list[str] | None = Query(default=None),
    include_reconciled_duplicates: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> Any:
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


@router.get("/investigations/{investigation_id}/documents", response_model=None)
def list_documents(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_documents(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/evidence", response_model=None)
def list_investigation_evidence(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_evidence(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/sources", response_model=None)
def list_sources(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_sources(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/claims", response_model=None)
def list_claims(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_claims(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/leads", response_model=None)
def list_leads(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_leads(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/leads/queue", response_model=None)
def lead_queue(
    investigation_id: str,
    status: list[str] | None = Query(default=None),
    priority: list[str] | None = Query(default=None),
    owner: str | None = None,
    unresolved_only: bool = True,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _lead_queue(
        db, investigation_id, status=status, priority=priority, owner=owner, unresolved_only=unresolved_only,
        limit=limit, offset=offset,
    )


@router.get("/investigations/{investigation_id}/reporting-tasks", response_model=None)
def list_reporting_tasks(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_reporting_tasks(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/connector-runs", response_model=None)
def list_connector_runs(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_connector_runs(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/connector-findings", response_model=None)
def list_connector_findings(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_connector_findings(db, investigation_id, limit=limit, offset=offset)
