"""Provenance-tracing endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 2).

Both endpoints are already thin: the real logic lives in
app/services/provenance.py (record_provenance_trace,
find_extraction_lineage). This module just wires HTTP status codes to
the service layer's LookupError/ValueError.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import require_scope_investigation, scope_for_request
from app.db.session import get_db
from app.services.provenance import find_extraction_lineage, record_provenance_trace
from app.schemas.responses import ExtractionLineageLookupOut, ProvenanceTraceOut

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/provenance/trace", response_model=ProvenanceTraceOut)
def get_record_provenance_trace(record_type: str, record_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        trace = record_provenance_trace(db, record_type, record_id)
        require_scope_investigation(scope_for_request(request), trace["investigation_id"])
        return trace
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/provenance/extraction-lineage", response_model=ExtractionLineageLookupOut)
def find_extraction_lineage_endpoint(record_type: str, record_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        result = find_extraction_lineage(db, record_type, record_id)
        # Unlike /provenance/trace above, this lookup has no natural 404 (a
        # not-found candidate is a legitimate `{"found": False}` response), so
        # the scope check has to happen after the fact, only when a candidate
        # -- and the document/source/chunk text it lineage-traces to -- was
        # actually found. Without this, a caller scoped to investigation A
        # could pass an entity/claim/evidence id from investigation B and
        # read its document text and source URL via this endpoint.
        if result["lineage"] is not None:
            require_scope_investigation(scope_for_request(request), result["lineage"]["candidate"]["investigation_id"])
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
