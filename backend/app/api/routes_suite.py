"""The Authority System Suite's fields and records (the app-side suite gaps):
classification and likelihood on claims, tier on sources, the Evidence record's
fields, a link's evidence status, and the suite's own records for a case."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import CaseRecord, Claim, Evidence, Investigation, RelationshipEdge, Source
from app.schemas.api import (CaseRecordAmend, CaseRecordCreate, ClaimSuiteFields, EvidenceSuiteFields, RelationshipSuiteFields,
                             SourceSuiteFields)
from app.schemas.responses import CaseRecordOut, ClaimOut, EvidenceOut, SourceOut, SuiteCatalogOut
from app.services import case_records, suite_fields
from app.services.relationships import serialize_relationship

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/suite/catalog", response_model=SuiteCatalogOut)
def suite_catalog_listing() -> Any:
    """Every system, module and record of the vendored suite (ADR-0015): what
    /investigations/{id}/assistant/suite/{system}/{number} can run, read from the suite's own files."""
    from app.ai import suite_catalog
    from app.ai.reasoning import _vendored_suite_commit
    from app.ai.suite_router import trigger_rows

    rows = trigger_rows()
    return {"source": _vendored_suite_commit(), "systems": [{
        "code": s.code, "name": s.name,
        "trigger_row": rows[s.code].number if s.code in rows else None, "when": rows[s.code].when if s.code in rows else None,
        "modules": [{"key": m.key, "number": m.number, "title": m.title, "use_when": m.use_when,
                     "path": str(m.path.relative_to(suite_catalog.SUITE_ROOT))} for m in s.modules],
        "records": [{"kind": r.kind, "prefix": r.prefix, "id_field": r.id_field, "fields": list(r.example),
                     "closed": {k: list(v) for k, v in r.closed.items()}} for r in s.records],
    } for s in suite_catalog.systems()]}


def _get(db: Session, model: Any, row_id: str, name: str) -> Any:
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(404, f"{name} not found")
    return row


@router.patch("/claims/{claim_id}/suite", response_model=ClaimOut)
def patch_claim_suite(claim_id: str, body: ClaimSuiteFields, db: Session = Depends(get_db)) -> Any:
    """Classification, likelihood term, confidence level and basis, warrant, assumptions,
    limits, Module 02's verdict and corrected wording; written as a review event."""
    claim = _get(db, Claim, claim_id, "Claim")
    data = body.model_dump(exclude_unset=True)
    rationale, reviewer = data.pop("rationale"), data.pop("reviewer_type", "HUMAN")
    try:
        claim, _ = suite_fields.set_claim_fields(db, claim, data, rationale=rationale, reviewer_type=reviewer)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return claim


@router.patch("/sources/{source_id}/suite", response_model=SourceOut)
def patch_source_suite(source_id: str, body: SourceSuiteFields, db: Session = Depends(get_db)) -> Any:
    try:
        return suite_fields.set_source_fields(db, _get(db, Source, source_id, "Source"), body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/evidence/{evidence_id}/suite", response_model=EvidenceOut)
def patch_evidence_suite(evidence_id: str, body: EvidenceSuiteFields, db: Session = Depends(get_db)) -> Any:
    try:
        return suite_fields.set_evidence_fields(db, _get(db, Evidence, evidence_id, "Evidence"), body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/relationships/{relationship_id}/suite")
def patch_relationship_suite(relationship_id: str, body: RelationshipSuiteFields, db: Session = Depends(get_db)) -> Any:
    edge = _get(db, RelationshipEdge, relationship_id, "Relationship")
    try:
        edge = suite_fields.set_relationship_fields(db, edge, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"id": edge.id, "evidence_status": edge.evidence_status, "relationship": serialize_relationship(db, edge)}


@router.get("/investigations/{investigation_id}/case-records", response_model=list[CaseRecordOut])
def list_case_records(investigation_id: str, kind: str | None = None, db: Session = Depends(get_db)) -> Any:
    _get(db, Investigation, investigation_id, "Investigation")
    return [case_records.serialize(r) for r in case_records.list_records(db, investigation_id, kind)]


@router.post("/investigations/{investigation_id}/case-records", response_model=CaseRecordOut)
def create_case_record(investigation_id: str, body: CaseRecordCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    _get(db, Investigation, investigation_id, "Investigation")
    try:
        row = case_records.create(db, investigation_id, body.kind, body.body, created_by=scope_for_request(request).actor_id)
    except case_records.CaseRecordError as exc:
        raise HTTPException(400, str(exc)) from exc
    return case_records.serialize(row)


@router.get("/case-records/{case_record_id}", response_model=CaseRecordOut)
def get_case_record(case_record_id: str, db: Session = Depends(get_db)) -> Any:
    return case_records.serialize(_get(db, CaseRecord, case_record_id, "Record"))


@router.patch("/case-records/{case_record_id}", response_model=CaseRecordOut)
def amend_case_record(case_record_id: str, body: CaseRecordAmend, request: Request, db: Session = Depends(get_db)) -> Any:
    row = _get(db, CaseRecord, case_record_id, "Record")
    try:
        row = case_records.amend(db, row, body.body, amended_by=scope_for_request(request).actor_id)
    except case_records.CaseRecordError as exc:
        raise HTTPException(400, str(exc)) from exc
    return case_records.serialize(row)
