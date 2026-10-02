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

from app.ai.reasoning import (
    TAS_MODULES,
    ReasoningInputError,
    list_ai_analysis_candidates,
    validate_reasoning_request,
)
from app.api.dependencies import MAX_OFFSET, authorize_request_resource
from app.core.authorization import current_authorization_scope, require_scope_investigation_admin, scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.jobs.handlers import AI_REASONING
from app.jobs.records import create_job, serialize_job
from app.jobs.runner import job_runner
from app.models.domain import BackgroundJob, Investigation
from app.schemas.responses import (
    AiAnalysisCandidatesOut, AiModelFailedOut, AiOutputRejectedOut, AiReasoningRunOut, ClaimOut, ErrorOut, ConnectorFindingOut, ConnectorRunOut, DemoSeedOut, DocumentOut,
    EvidencePoolRow, FinancialLedgerOut, GraphOut, InvestigationDeletionPreview, InvestigationDeletionResult,
    InvestigationOut, LeadOut, LeadQueueOut, OpenAlephCorpusBindingOut, OpenAlephOperationFailureOut,
    QuestionContextOut, RelationshipOut, ReportingTaskOut, SourceOut, TimelineOut, ValidationErrorOut, file_response, upstream,
)
from app.schemas.api import (
    CaseSynthesisRequest, HypothesisTestRequest, InvestigationCreate,
    InvestigationQuestionContextRequest, PresentationDraftRequest,
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
from app.services.demo_seed import seed_demo_investigation
from app.services.financial_flows import investigation_financial_ledger
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

# A reasoning run that is queued answers 202 with the job to follow (Foundation Fixes fix 4);
# one whose answer fails its checks is refused (422) with what the check found, and
# one the provider failed, or whose answer is unusable, answers 502 (app/ai/reasoning.py
# describe_reasoning_failure).
QUEUED_RUN: dict[int | str, dict[str, Any]] = {
    202: {"model": AiReasoningRunOut, "description": "Queued: no proposal yet; follow the job (GET /api/jobs/{job_id})"},
    422: {"model": ValidationErrorOut | AiOutputRejectedOut,
          "description": "The input does not match the route, or the model's answer did not pass its checks"},
    502: {"model": ErrorOut | AiModelFailedOut,
          "description": "The AI provider failed (the details are logged on the server), or its answer could not be used at all"},
}


@router.get("/investigations/{investigation_id}/corpus/openaleph", response_model=OpenAlephCorpusBindingOut)
def get_openaleph_corpus_binding(investigation_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return {"binding": serialize_binding(get_binding(db, investigation_id))}


@router.get("/investigations/{investigation_id}/corpus/openaleph/failures", response_model=list[OpenAlephOperationFailureOut])
def list_openaleph_corpus_failures(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Server-side trace of failed OpenAleph pipeline operations (STRUCT-0027).

    Covers collection setup, review refresh, and evidence/entity import --
    the operations that previously left no record of *why* a 502 happened
    beyond whatever the caller saw in that one HTTP response.
    """
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return list_openaleph_operation_failures(db, investigation_id)


@router.post("/investigations/{investigation_id}/corpus/openaleph/ensure", response_model=OpenAlephCorpusBindingOut,
             responses=upstream("OpenAleph", 502, 503))
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


@router.post("/investigations/{investigation_id}/assistant/context", response_model=QuestionContextOut)
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


async def _run_reasoning_endpoint(request: Request, response: Response, db: Session, *, investigation_id: str, module: str, question: str, max_results: int = 30, include_external_leads: bool = True, working_theory: str | None = None, control_flags: dict | None = None, record_refs: list[dict] | None = None) -> dict[str, Any]:
    """Validate, then run as a background job (Foundation Fixes fix 4).

    In the Docker stack the run is queued and this answers 202 with the job
    to follow (GET /api/jobs/{id}; its `result` holds what this endpoint
    used to return). In developer mode the job runs first and the answer is
    the same as it always was, including the error statuses.
    """
    if not settings.enable_ai_features or not (settings.ai_provider or "").strip():
        raise HTTPException(400, "AI reasoning endpoints are not enabled on this deployment (enable_ai_features and ai_provider must both be set)")
    try:
        resolved_flags = validate_reasoning_request(
            investigation_id=investigation_id, module=module, working_theory=working_theory,
            control_flags=control_flags, record_refs=record_refs,
        )
    except ReasoningInputError as exc:
        raise HTTPException(400, str(exc))
    scope = current_authorization_scope()
    runner = job_runner(request)
    job = create_job(
        db, kind=AI_REASONING, investigation_id=investigation_id, subject_type="ai_run", runner=runner.mode,
        payload={
            "module": module, "question": question, "working_theory": working_theory, "max_results": max_results,
            "include_external_leads": include_external_leads, "record_refs": record_refs,
            "control_flags": control_flags if module in TAS_MODULES else None, "resolved_control_flags": resolved_flags,
            "actor_id": scope.actor_id if scope is not None else "local-owner",
        },
        message="Waiting for the model",
    )
    await runner.submit(job, db)
    db.expire_all()
    row = db.get(BackgroundJob, job.id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    result = (row.payload or {}).get("result") or {}
    if row.status == "succeeded":
        return {**result, "job": serialize_job(row)}
    if row.status == "failed":
        raise HTTPException(result.get("status_code", 500), result.get("detail", row.error or "AI run failed"), headers=result.get("headers"))
    response.status_code = 202
    return {"candidate_id": None, "job": serialize_job(row)}


@router.post("/investigations/{investigation_id}/assistant/case-synthesis", response_model=AiReasoningRunOut, responses=QUEUED_RUN)
async def investigation_case_synthesis(
    investigation_id: str, body: CaseSynthesisRequest, request: Request, response: Response, db: Session = Depends(get_db),
) -> Any:
    """TAS Module 08 (Case Synthesis) as a real, citation-validated LLM call.

    Never writes to canonical records — the result is persisted as a
    review_status="proposed" AIAnalysisCandidate. See app/ai/reasoning.py.
    """
    return await _run_reasoning_endpoint(
        request, response, db, investigation_id=investigation_id, module="case_synthesis", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        control_flags={"severity_floor": body.severity_floor, "source_tier_floor": body.source_tier_floor},
    )


@router.post("/investigations/{investigation_id}/assistant/hypothesis-test", response_model=AiReasoningRunOut, responses=QUEUED_RUN)
async def investigation_hypothesis_test(
    investigation_id: str, body: HypothesisTestRequest, request: Request, response: Response, db: Session = Depends(get_db),
) -> Any:
    """TAS Module 06 (Hypothesis and Contradiction Testing) as a real,
    citation-validated LLM call. Same non-canonical-write guarantee as
    /assistant/case-synthesis above.
    """
    return await _run_reasoning_endpoint(
        request, response, db, investigation_id=investigation_id, module="hypothesis_test", question=body.question,
        max_results=body.max_results, include_external_leads=body.include_external_leads,
        working_theory=body.working_theory,
        control_flags={"severity_floor": body.severity_floor, "source_tier_floor": body.source_tier_floor},
    )


@router.post("/investigations/{investigation_id}/assistant/presentation-draft", response_model=AiReasoningRunOut, responses=QUEUED_RUN)
async def investigation_presentation_draft(
    investigation_id: str, body: PresentationDraftRequest, request: Request, response: Response, db: Session = Depends(get_db),
) -> Any:
    """Draft a brief/deck from a reporter-selected evidence set and a goal.

    App-local reasoning module (not vendored TAS -- see
    app/ai/presentation_modules/PRESENTATION_DRAFT.md), reusing the same
    citation-validated LLM pipeline and non-canonical-write guarantee as
    /assistant/case-synthesis and /assistant/hypothesis-test above: the
    result is a review_status="proposed" AIAnalysisCandidate, promoted to
    a Writeup and/or Deck only by a separate, human action.
    """
    return await _run_reasoning_endpoint(
        request, response, db, investigation_id=investigation_id, module="presentation_draft", question=body.goal,
        record_refs=[ref.model_dump() for ref in body.record_refs],
    )


@router.get("/investigations/{investigation_id}/ai-analysis-candidates", response_model=AiAnalysisCandidatesOut)
def list_investigation_ai_analysis_candidates(
    investigation_id: str,
    review_status: str | None = None,
    module: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
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


@router.get("/investigations/{investigation_id}/timeline", response_model=TimelineOut)
def get_investigation_timeline(
    investigation_id: str,
    kind: list[str] | None = Query(default=None),
    verification_status: list[str] | None = Query(default=None),
    include_record_activity: bool = False,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
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


@router.get("/investigations/{investigation_id}/export", response_class=Response,
            responses=file_response("application/zip", "A portable backup of the investigation (.jwbackup.zip)"))
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


@router.post("/investigations", response_model=InvestigationOut)
def create_investigation(body: InvestigationCreate, db: Session = Depends(get_db)) -> Any:
    return _create_investigation(db, body)


@router.get("/investigations", response_model=list[InvestigationOut])
def list_investigations(request: Request, db: Session = Depends(get_db)) -> Any:
    scope = scope_for_request(request)
    return _list_investigations(db, scope)


@router.post("/demo/seed", response_model=DemoSeedOut)
def seed_demo(db: Session = Depends(get_db)) -> Any:
    """Create the one demo investigation (sample entities, relationships,
    claims/evidence, leads, and a timeline) if it doesn't already exist.
    Idempotent -- calling this again just returns the existing one."""
    inv, created = seed_demo_investigation(db)
    return {"investigation_id": inv.id, "created": created}


@router.get("/investigations/{investigation_id}/deletion-preview", response_model=InvestigationDeletionPreview)
def investigation_deletion_preview(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    try:
        return preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.delete("/investigations/{investigation_id}", response_model=InvestigationDeletionResult)
def remove_investigation(investigation_id: str, request: Request, confirmation: str = Query(...), db: Session = Depends(get_db)) -> Any:
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        return delete_investigation(db, investigation_id, settings.document_storage_dir, confirmation=confirmation)
    except ValueError as exc:
        raise HTTPException(404 if str(exc) == "Investigation not found" else 400, str(exc))


@router.get("/investigations/{investigation_id}/relationships", response_model=list[RelationshipOut])
def list_investigation_relationships(
    investigation_id: str,
    include_reconciled_duplicates: bool = Query(default=True),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_relationships(
        db, investigation_id, include_reconciled_duplicates=include_reconciled_duplicates, limit=limit, offset=offset,
    )


@router.get("/investigations/{investigation_id}/graph", response_model=GraphOut)
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


@router.get("/investigations/{investigation_id}/financial-flows", response_model=FinancialLedgerOut)
def get_investigation_financial_flows(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Transaction ledger built from canonical Payment relationships. Read-only."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return investigation_financial_ledger(db, investigation_id)


@router.get("/investigations/{investigation_id}/documents", response_model=list[DocumentOut])
def list_documents(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_documents(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/evidence", response_model=list[EvidencePoolRow])
def list_investigation_evidence(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_evidence(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/sources", response_model=list[SourceOut])
def list_sources(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_sources(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/claims", response_model=list[ClaimOut])
def list_claims(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_claims(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/leads", response_model=list[LeadOut])
def list_leads(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_leads(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/leads/queue", response_model=LeadQueueOut)
def lead_queue(
    investigation_id: str,
    status: list[str] | None = Query(default=None),
    priority: list[str] | None = Query(default=None),
    owner: str | None = None,
    unresolved_only: bool = True,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _lead_queue(
        db, investigation_id, status=status, priority=priority, owner=owner, unresolved_only=unresolved_only,
        limit=limit, offset=offset,
    )


@router.get("/investigations/{investigation_id}/reporting-tasks", response_model=list[ReportingTaskOut])
def list_reporting_tasks(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_reporting_tasks(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/connector-runs", response_model=list[ConnectorRunOut])
def list_connector_runs(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_connector_runs(db, investigation_id, limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/connector-findings", response_model=list[ConnectorFindingOut])
def list_connector_findings(
    investigation_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    db: Session = Depends(get_db),
) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _list_investigation_connector_findings(db, investigation_id, limit=limit, offset=offset)
