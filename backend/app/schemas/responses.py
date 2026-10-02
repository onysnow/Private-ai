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

from pydantic import BaseModel, ConfigDict, Field


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


# --- Investigation visuals (app/visuals) -----------------------------------------

class VisualParamOut(ResponseModel):
    description: str
    choices: list[str] | None = None
    default: str | None = None


class VisualQueryOut(ResponseModel):
    """One entry of the query catalogue the AI orders from."""
    name: str
    label: str
    description: str
    params: dict[str, VisualParamOut]
    series_kind: str          # category | time
    unit_kind: str            # amount | count
    record_noun: str
    has_data: bool
    record_count: int
    row_count: int
    currencies: list[str]


class VisualCatalogOut(ResponseModel):
    investigation_id: str
    queries: list[VisualQueryOut]
    kinds: list[str]
    drawn_kinds: list[str]


class RecordRefOut(ResponseModel):
    record_type: str
    record_id: str


class VisualDataRowOut(ResponseModel):
    label: str
    value: float
    record_refs: list[RecordRefOut]
    record_count: int
    key: str


class VisualDataOut(ResponseModel):
    """What the data service cooked: every value tagged with its records."""
    investigation_id: str
    query: str
    params: dict[str, str]
    unit: str
    unit_kind: str
    series_kind: str
    record_noun: str
    rows: list[VisualDataRowOut]
    currency: str | None = None
    record_count: int
    omitted: list[dict[str, Any]]


class CheckItemOut(ResponseModel):
    rule: int
    message: str


class CheckReportOut(ResponseModel):
    ok: bool
    errors: list[CheckItemOut]
    warnings: list[CheckItemOut]
    checked_rules: list[int]
    not_checked: dict[str, str]


class DataTableRowOut(ResponseModel):
    label: str
    value: float
    formatted: str
    record_count: int
    record_refs: list[RecordRefOut]


class DataTableOut(ResponseModel):
    columns: list[str]
    rows: list[DataTableRowOut]


class VisualPreviewOut(ResponseModel):
    """A chart cooked, drawn and checked for one order slip, as the preview
    shows it; the AI is never involved."""
    spec: dict[str, Any]
    data: VisualDataOut
    option: dict[str, Any]
    report: CheckReportOut
    alt_text: str
    description: str
    data_table: DataTableOut
    source_line: str
    width: int
    height: int


# --- Search ------------------------------------------------------------------

class SearchHitOut(ResponseModel):
    type: str
    group: str  # canonical | evidence | reporting | workflow | review | external_lead | other
    id: str
    investigation_id: str
    title: str
    snippet: str
    score: float
    # Each record type adds its own keys (locator, source_url, ...): kept open.
    provenance: dict[str, Any]
    metadata: dict[str, Any]


class SearchOut(ResponseModel):
    query: str
    investigation_id: str | None = None
    total: int
    returned: int = 0
    counts: dict[str, int]
    group_counts: dict[str, int] = {}
    results: list[SearchHitOut]


# --- Relationships -------------------------------------------------------------

class RelationshipEndpointOut(ResponseModel):
    id: str
    ftm_id: str | None = None
    schema_: str = Field(alias="schema")
    caption: str

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class StatementOut(ResponseModel):
    id: str
    prop: str
    value: str
    dataset: str
    origin: str | None = None
    original_value: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class RelationshipEvidenceReviewOut(ResponseModel):
    id: str
    relationship_edge_id: str
    evidence_id: str
    stance: str
    rationale: str | None = None
    created_at: datetime


class EvidenceSourceOut(ResponseModel):
    id: str
    title: str
    url: str | None = None
    source_type: str | None = None


class EvidenceWithSourceOut(ResponseModel):
    id: str
    quote: str | None = None
    locator: str | None = None
    notes: str | None = None
    source: EvidenceSourceOut | None = None


class RelationshipEvidenceAttachmentOut(ResponseModel):
    attachment_id: str
    attached_by: str | None = None
    note: str | None = None
    created_at: datetime
    evidence: EvidenceWithSourceOut | None = None
    latest_review: RelationshipEvidenceReviewOut | None = None


class RelationshipProvenanceOut(ResponseModel):
    statement_count: int
    sources: list[str]
    evidence_review_history: list[RelationshipEvidenceReviewOut] = []
    evidence_attachments: list[RelationshipEvidenceAttachmentOut] = []


class ClaimDependencyOut(ResponseModel):
    claim_id: str
    evidence_id: str
    text: str
    status: str
    confidence: float
    stance: str
    note: str | None = None
    needs_review: bool


class RelationshipAdvisoryOut(ResponseModel):
    needs_review: bool
    support_state: str
    has_independent_support: bool
    healthy_supporting_claim_count: int
    challenged_supporting_claim_count: int
    disputed_claim_count: int
    rejected_claim_count: int
    claim_dependencies: list[ClaimDependencyOut]
    relationship_evidence_review: RelationshipEvidenceReviewOut | None = None
    relationship_evidence_needs_review: bool
    relationship_evidence_attachment_count: int
    relationship_evidence_review_counts: dict[str, int]


class RelationshipOut(ResponseModel):
    """One relationship edge with its FollowTheMoney statements, attached
    evidence and the advisory the review layer computes. The graph endpoint
    adds reconciliation and aggregate-provenance blocks for reviewed
    duplicates, so the model stays open to those."""
    model_config = ConfigDict(from_attributes=True, extra="allow", populate_by_name=True, serialize_by_alias=True)

    id: str
    investigation_id: str
    relationship_entity_id: str | None = None
    ftm_id: str | None = None
    schema_: str = Field(alias="schema")
    source_prop: str | None = None
    target_prop: str | None = None
    source: RelationshipEndpointOut | None = None
    target: RelationshipEndpointOut | None = None
    caption: str | None = None
    properties: dict[str, Any]
    statements: list[StatementOut]
    provenance: RelationshipProvenanceOut
    advisory: RelationshipAdvisoryOut
    created_at: datetime


# --- Timeline ----------------------------------------------------------------

class TimelineClaimContextOut(ResponseModel):
    id: str
    text: str
    status: str
    confidence: float
    evidence_stances: list[dict[str, Any]] | None = None


class TimelineClaimAdvisoryOut(ResponseModel):
    needs_review: bool
    status: str
    message: str | None = None


class TimelineContextOut(ResponseModel):
    """What a reporter-authored event points at, as it stands now. Each part
    is present only when the event links to that record."""
    model_config = ConfigDict(from_attributes=True, extra="allow")

    source: EvidenceSourceOut | None = None
    evidence: dict[str, Any] | None = None
    claim: TimelineClaimContextOut | None = None
    claim_advisory: TimelineClaimAdvisoryOut | None = None
    relationship_advisory: RelationshipAdvisoryOut | None = None


class TimelineEventOut(ResponseModel):
    """One timeline event: a reporter-authored row (which carries `context`),
    or one derived from a dated statement, source, relationship or record
    activity (`synthetic`, with no context). Derived kinds add their own
    keys, so the model stays open."""
    model_config = ConfigDict(from_attributes=True, extra="allow")

    id: str
    kind: str
    investigation_id: str
    title: str
    description: str | None = None
    date_start: str
    date_end: str | None = None
    precision: str
    verification_status: str
    synthetic: bool
    refs: dict[str, Any]
    provenance: dict[str, Any]
    context: TimelineContextOut | None = None
    sort_key: str


class TimelineOut(ResponseModel):
    investigation_id: str
    events: list[TimelineEventOut]
    counts: dict[str, int]
    verification_counts: dict[str, int]
    total: int
    returned: int
    offset: int


class TimelineEventRowOut(ResponseModel):
    """A reporter-authored event as stored (the reply to creating one)."""
    id: str
    investigation_id: str
    title: str
    description: str | None = None
    date_start: str
    date_end: str | None = None
    precision: str
    verification_status: str
    entity_id: str | None = None
    relationship_entity_id: str | None = None
    source_id: str | None = None
    evidence_id: str | None = None
    claim_id: str | None = None
    lead_id: str | None = None
    dataset: str
    origin: str | None = None
    created_at: datetime


# --- Provenance ----------------------------------------------------------------

class LineageCandidateOut(ResponseModel):
    id: str
    investigation_id: str
    document_id: str
    chunk_id: str | None = None
    candidate_type: str
    payload: dict[str, Any]
    confidence: float
    review_status: str
    accepted_record_type: str | None = None
    accepted_record_id: str | None = None
    reviewer_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class LineageDocumentOut(ResponseModel):
    id: str
    investigation_id: str
    source_id: str | None = None
    filename: str
    mime_type: str | None = None
    sha256: str
    extraction_status: str
    created_at: datetime


class LineageSourceOut(ResponseModel):
    id: str
    investigation_id: str
    title: str
    url: str | None = None
    source_type: str
    metadata_json: dict[str, Any]


class LineageChunkOut(ResponseModel):
    id: str
    document_id: str
    ordinal: int
    locator: str
    page_number: int | None = None
    text: str
    extraction_method: str
    candidate_span: dict[str, Any] | None = None


class ExtractionLineageOut(ResponseModel):
    """The read-only trail document → chunk → proposal → review → accepted record."""
    candidate: LineageCandidateOut
    document: LineageDocumentOut | None = None
    source: LineageSourceOut | None = None
    chunk: LineageChunkOut | None = None


class ExtractionLineageLookupOut(ResponseModel):
    found: bool
    lineage: ExtractionLineageOut | None = None


class TraceEvidenceOut(ResponseModel):
    id: str
    quote: str | None = None
    locator: str | None = None
    notes: str | None = None


class TraceEvidenceLinkOut(ResponseModel):
    link_id: str | None = None
    stance: str
    note: str | None = None
    evidence: TraceEvidenceOut | None = None
    source: EvidenceSourceOut | None = None
    extraction_lineage: ExtractionLineageOut | None = None


class TraceClaimOut(ResponseModel):
    id: str
    text: str
    status: str
    confidence: float


class TraceClaimLinkOut(ResponseModel):
    link_id: str
    stance: str
    note: str | None = None
    claim: TraceClaimOut | None = None


class TraceLeadOut(ResponseModel):
    id: str
    title: str
    detail: str | None = None
    status: str
    provider: str | None = None


class TraceLeadLinkOut(ResponseModel):
    link_id: str
    note: str | None = None
    lead: TraceLeadOut


class ProvenanceTraceOut(ResponseModel):
    """Everything connected to one record, followed back to its sources.
    `root` is the record itself and takes a different shape per record type."""
    record_type: str  # entity | claim | evidence | relationship | source | document | lead | task
    record_id: str
    investigation_id: str | None = None
    root: dict[str, Any]
    extraction_lineage: ExtractionLineageOut | None = None
    evidence_links: list[TraceEvidenceLinkOut]
    claim_links: list[TraceClaimLinkOut]
    relationships: list[RelationshipOut]
    lead_links: list[TraceLeadLinkOut]
    reconciliation: dict[str, Any] | None = None


class CanonicalStatementOut(ResponseModel):
    id: str
    dataset: str
    origin: str | None = None
    original_value: str | None = None
    first_seen: str | None = None
    last_seen: str | None = None


class ExternalAssessmentOut(ResponseModel):
    assessment_id: str
    status: str
    note: str | None = None
    created_at: str | None = None
    finding_id: str | None = None
    provider: str | None = None
    dataset: str | None = None
    source_url: str | None = None
    provider_record_id: str | None = None
    finding_caption: str | None = None
    promoted: bool
    promotion_id: str | None = None
    promoted_at: str | None = None
    reviewer_note: str | None = None


class StatementHistoryRowOut(ResponseModel):
    """One property value of an entity: its canonical statements and every
    outside assessment of it, with support and conflict counts."""
    prop: str
    value: str
    canonical: bool
    canonical_statements: list[CanonicalStatementOut]
    external_assessments: list[ExternalAssessmentOut]
    support_count: int
    conflict_count: int
    latest_status: str | None = None
