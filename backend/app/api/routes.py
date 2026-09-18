from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.domain import (
    Investigation, Source, Evidence, Claim, Lead, ReportingTask, ConnectorRun, ConnectorFinding, Document,
)
from app.schemas.api import (
    InvestigationCreate, InvestigationQuestionContextRequest,
    CaseSynthesisRequest, HypothesisTestRequest,
)
from app.services.relationships import (
    RELATIONSHIP_SCHEMAS, investigation_relationships,
    investigation_graph,
)
from app.services.assistant_context import build_question_context
from app.ai.reasoning import run_reasoning_module, ReasoningInputError, CitationValidationError, SchemaValidationError
from app.services.timeline import investigation_timeline
from app.services.documents import serialize_document
from app.services.exports import build_investigation_export
from app.services.lifecycle import preview_investigation_deletion, delete_investigation
from app.services.openaleph_corpus import ensure_openaleph_collection, get_binding, serialize_binding
from app.core.config import settings
from app.core.authorization import (
    scope_for_request,
    require_scope_investigation_admin,
)
from app.services.leads import (
    LEAD_STATUSES, serialize_lead, serialize_task,
)

from app.api.dependencies import authorize_request_resource

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


@router.get("/investigations/{investigation_id}/documents")
def list_documents(investigation_id: str, db: Session = Depends(get_db)):
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    rows = db.scalars(select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at.desc())).all()
    return [serialize_document(db, row) for row in rows]


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


@router.get("/investigations/{investigation_id}/connector-runs")
def list_connector_runs(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorRun).where(ConnectorRun.investigation_id == investigation_id).order_by(ConnectorRun.started_at.desc())).all()

@router.get("/investigations/{investigation_id}/connector-findings")
def list_connector_findings(investigation_id: str, db: Session = Depends(get_db)):
    return db.scalars(select(ConnectorFinding).where(ConnectorFinding.investigation_id == investigation_id).order_by(ConnectorFinding.created_at.desc())).all()


