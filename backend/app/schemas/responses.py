"""Response models: what each endpoint sends back (Foundation Fixes fix 2).

Routes move onto these one panel at a time. FastAPI drops any field a
response model does not list, so each model is checked against the route's
real reply (tests/test_response_models.py) before it is used. The published
OpenAPI schema (frontend/openapi.json) is generated from them, and the front
end's types, Zod checks and query hooks are generated from that file.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    # Read from ORM rows as well as dicts.
    model_config = ConfigDict(from_attributes=True)


# --- Sources and evidence ---------------------------------------------------

class SourceOut(ResponseModel):
    id: str
    investigation_id: str
    title: str
    url: str | None = None
    source_type: str
    metadata_json: dict[str, Any] | None = None
    created_at: datetime


class EvidenceOut(ResponseModel):
    id: str
    source_id: str
    quote: str | None = None
    locator: str | None = None
    notes: str | None = None


class EvidencePoolRow(ResponseModel):
    """One evidence record with the source it came from."""
    evidence: EvidenceOut
    source: SourceOut


# --- Investigation deletion -------------------------------------------------

class DeletionDocumentFile(ResponseModel):
    document_id: str
    relative_path: str
    exists: bool
    shared_with_other_investigation: bool
    action: str  # delete | preserve_shared | already_missing


class DeletionUnsafePath(ResponseModel):
    document_id: str
    storage_path: str | None = None
    error: str


class DeletionFileSummary(ResponseModel):
    delete: int
    preserve_shared: int
    already_missing: int
    unsafe: int


class InvestigationDeletionPreview(ResponseModel):
    investigation_id: str
    investigation_name: str
    record_counts: dict[str, int]
    record_total: int
    document_files: list[DeletionDocumentFile]
    document_file_summary: DeletionFileSummary
    unsafe_paths: list[DeletionUnsafePath]
    can_delete: bool
    requires_confirmation: str


class InvestigationDeletionResult(ResponseModel):
    investigation_id: str
    deleted: bool
    deleted_record_counts: dict[str, int]
    deleted_record_total: int
    document_files_deleted: int
    shared_document_files_preserved: int
    missing_document_files: int
