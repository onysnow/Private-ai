"""Response models: what each endpoint sends back (Foundation Fixes fix 2).

Routes move onto these one panel at a time. FastAPI drops any field a
response model does not list, so each model is checked against the route's
real reply (tests/test_response_models.py) before it is used. The published
OpenAPI schema (frontend/openapi.json) is generated from them, and the front
end's types, Zod checks and query hooks are generated from that file.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

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
    """What the review layer says about one relationship record: the claims
    that rest on its attached evidence, and how its evidence was reviewed."""
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
    # Says which advisory shape this is (see RelationshipAggregateAdvisoryOut).
    presentation_aggregate: Literal[False]


class AggregateClaimDependencyOut(ClaimDependencyOut):
    """A claim dependency collected across reviewed duplicate edges, naming
    the underlying edge it belongs to."""
    relationship_id: str | None = None


class RelationshipAggregateAdvisoryOut(ResponseModel):
    """The advisory of a compact graph edge that stands in for several
    reviewed duplicate records: computed over every underlying edge's
    evidence, so one challenged claim does not colour an edge another
    reviewed evidence record supports. Presentation only; no record changes."""
    needs_review: bool
    support_state: str
    has_independent_support: bool
    healthy_supporting_evidence_count: int
    challenged_supporting_evidence_count: int
    disputed_claim_count: int
    rejected_claim_count: int
    claim_dependencies: list[AggregateClaimDependencyOut]
    presentation_aggregate: Literal[True]


class RelationshipReconciliationOut(ResponseModel):
    """How a reporter's latest duplicate decision places this edge: the
    preferred record of its pair, or a suppressed copy of one."""
    decision_id: str
    decision: str
    preferred_record_id: str
    secondary_record_id: str
    rationale: str | None = None
    is_preferred: bool
    suppressed_duplicate: bool
    suppressed_duplicate_ids: list[str]
    suppressed_duplicate_count: int


class AggregateProvenanceOut(ResponseModel):
    """The provenance inventory of a compact preferred edge: every statement
    source and evidence record beneath it and its reviewed duplicates.
    Presentation only; no records are merged."""
    presentation_only: Literal[True]
    underlying_relationship_ids: list[str]
    underlying_relationship_count: int
    statement_count: int
    statement_sources: list[str]
    evidence_count: int
    evidence: list[EvidenceWithSourceOut]


def _absent_when_none(value: Any) -> bool:
    """A key the service adds only in some replies is left out, not sent as null."""
    return value is None


class RelationshipOut(ResponseModel):
    """One relationship edge with its FollowTheMoney statements, attached
    evidence and the advisory the review layer computes. The graph and the
    dossier add `reconciliation` to an edge a reporter reviewed as a
    duplicate, and `aggregate_provenance` (with an aggregate advisory) to the
    preferred edge of a collapsed pair; both keys are absent otherwise."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

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
    # FollowTheMoney property values: every value is a list of strings.
    properties: dict[str, list[str]]
    statements: list[StatementOut]
    provenance: RelationshipProvenanceOut
    advisory: RelationshipAdvisoryOut | RelationshipAggregateAdvisoryOut
    created_at: datetime
    reconciliation: RelationshipReconciliationOut | None = Field(default=None, exclude_if=_absent_when_none)
    aggregate_provenance: AggregateProvenanceOut | None = Field(default=None, exclude_if=_absent_when_none)


class EntityRelationshipOut(RelationshipOut):
    """A relationship seen from one entity (its dossier, or its relationship
    list): whether the entity is the edge's source or its target."""
    direction: Literal["outgoing", "incoming"]


class GraphNodeOut(ResponseModel):
    """A canonical entity that is an endpoint of a shown edge."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    ftm_id: str
    caption: str
    schema_: str = Field(alias="schema")
    properties: dict[str, list[str]]


class GraphReconciliationOut(ResponseModel):
    """How many edges the duplicate view hid."""
    collapsed_by_default: bool
    suppressed_duplicate_count: int
    underlying_edge_count: int
    visible_edge_count: int


class GraphOut(ResponseModel):
    nodes: list[GraphNodeOut]
    edges: list[RelationshipOut]
    schemas: list[str]
    reconciliation: GraphReconciliationOut


class RelationshipEvidenceReviewsOut(ResponseModel):
    """Every reporter assessment of one relationship's attached evidence, oldest first."""
    relationship_id: str
    reviews: list[RelationshipEvidenceReviewOut]


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


# --- Background jobs (ADR-0004) -------------------------------------------------

class BackgroundJobOut(ResponseModel):
    """One piece of slow work and where it stands; the screen polls this.
    Every key is always sent (null when unknown), so the nullable ones have
    no default: the generated type then matches lib/jobs.ts, which follows a
    job."""
    id: str
    kind: str
    investigation_id: str | None
    subject_type: str | None
    subject_id: str | None
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    finished: bool
    progress: int | None
    message: str | None
    error: str | None
    attempts: int
    runner: str
    # What the job produced, in the shape its handler chose.
    result: Any = None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    updated_at: datetime


# --- Documents and extraction proposals ----------------------------------------

class DocumentOut(ResponseModel):
    id: str
    investigation_id: str
    source_id: str
    filename: str
    mime_type: str | None = None
    sha256: str
    extraction_status: str
    extraction_error: str | None = None
    extraction_issues: list[str]
    created_at: datetime
    chunk_count: int
    candidate_counts: dict[str, int]


class DocumentChunkOut(ResponseModel):
    id: str
    document_id: str
    locator: str
    page_number: int | None = None
    ordinal: int
    text: str
    created_at: datetime


class DocumentDetailOut(DocumentOut):
    """A document with its extracted chunks (GET /documents/{id})."""
    chunks: list[DocumentChunkOut]


class OpenAlephSyncOut(ResponseModel):
    """How one document stands in the OpenAleph corpus."""
    id: str
    document_id: str
    investigation_id: str
    provider: str
    collection_id: str
    provider_record_id: str | None = None
    status: str
    error: str | None = None
    response_json: dict[str, Any]
    synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DocumentUploadOut(DocumentOut):
    """The reply to an upload: the saved document, the job that reads it
    (already finished in developer mode), and its OpenAleph state."""
    job: BackgroundJobOut | None = None
    openaleph_sync: OpenAlephSyncOut | None = None


class ExplanationExcerptOut(ResponseModel):
    """The matched text with a little of what surrounds it."""
    before: str
    match: str
    after: str
    start_char: int
    end_char: int


# Where a part of a proposal came from. Each kind of source carries its own
# detail, so `kind` says which shape follows.
class ExplanationChunkRefOut(ResponseModel):
    kind: Literal["chunk"]
    id: str
    label: str
    locator: str
    page_number: int | None = None
    extraction_method: str
    excerpt: ExplanationExcerptOut | None = None


class ExplanationDocumentRefOut(ResponseModel):
    kind: Literal["document"]
    id: str
    label: str
    sha256: str
    mime_type: str | None = None


class ExplanationSourceRefOut(ResponseModel):
    kind: Literal["source"]
    id: str
    label: str
    url: str | None = None
    source_type: str


class ExplanationProviderRefOut(ResponseModel):
    kind: Literal["provider"]
    id: str | None = None
    label: str
    provider: str
    collection_id: str | None = None
    provider_document_id: str | None = None
    provider_entity_id: str | None = None


class ExplanationClaimRefOut(ResponseModel):
    kind: Literal["claim"]
    id: str
    label: str
    status: str


class ExplanationEvidenceRefOut(ResponseModel):
    kind: Literal["evidence"]
    id: str
    label: str
    locator: str | None = None
    source_id: str
    source_title: str | None = None


class ExplanationEntityRefOut(ResponseModel):
    kind: Literal["entity"]
    id: str
    label: str
    schema_: str = Field(alias="schema")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


ExplanationSourceOut = Annotated[
    ExplanationChunkRefOut | ExplanationDocumentRefOut | ExplanationSourceRefOut | ExplanationProviderRefOut
    | ExplanationClaimRefOut | ExplanationEvidenceRefOut | ExplanationEntityRefOut,
    Field(discriminator="kind"),
]


class ExplanationMethodOut(ResponseModel):
    id: str
    label: str
    description: str
    automated: bool


class ExplanationConfidenceOut(ResponseModel):
    value: float | None = None
    basis: str


class ExplanationPartOut(ResponseModel):
    """One part of a proposal: what it says, why, and where it came from."""
    id: str
    label: str
    # The part's value: a string for most parts, a property map for a
    # staged relationship's properties.
    value: Any = None
    reasoning: list[str]
    sources: list[ExplanationSourceOut]


class ExtractionExplanationOut(ResponseModel):
    """Why a proposal exists (#190): per-part reasoning and sources."""
    candidate_id: str
    candidate_type: str
    review_status: str
    summary: str
    method: ExplanationMethodOut
    rationale_basis: Literal["recorded", "reconstructed", "provider", "reporter"]
    confidence: ExplanationConfidenceOut
    parts: list[ExplanationPartOut]
    sources: list[ExplanationSourceOut]
    caveats: list[str]
    review_rule: str


class ExtractionCandidateOut(ResponseModel):
    """One extraction proposal. `explanation` is present only when the list
    was asked for explanations (?explain=true), so it is left out of the
    reply rather than sent as null."""
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
    explanation: ExtractionExplanationOut | None = Field(default=None, exclude_if=lambda value: value is None)


class ExtractionReviewOut(ResponseModel):
    """The reply to a review decision: the proposal as it now stands and, for
    an acceptance, the record it made (an entity, claim, evidence record or
    relationship, each in its own shape)."""
    candidate: ExtractionCandidateOut
    record: dict[str, Any] | None = None


# --- OpenAleph corpus ------------------------------------------------------------

class OpenAlephBindingOut(ResponseModel):
    id: str
    investigation_id: str
    provider: str
    collection_id: str
    foreign_id: str | None = None
    collection_label: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class OpenAlephDocumentSyncOut(ResponseModel):
    sync: OpenAlephSyncOut | None = None


class OpenAlephReviewStatusOut(ResponseModel):
    """Provider sync plus how far reporter review of its proposals has got."""
    document_id: str
    investigation_id: str
    provider: str
    document_extraction_status: str
    binding: OpenAlephBindingOut | None = None
    sync: OpenAlephSyncOut | None = None
    ready_for_import: bool
    candidate_counts: dict[str, dict[str, int]]
    provider_candidate_total: int
    provider_candidate_pending_review: int
    provider_candidate_accepted: int
    provider_candidate_rejected: int


class OpenAlephEvidenceImportOut(ResponseModel):
    document_id: str
    collection_id: str
    provider_document_id: str | None = None
    provider: str
    retrieved: int
    created_chunks: int
    created_candidates: int
    skipped: int
    review_required: bool


class OpenAlephEntityImportOut(ResponseModel):
    document_id: str
    collection_id: str
    provider_document_id: str | None = None
    provider: str
    retrieved: int
    created_candidates: int
    skipped: int
    review_required: bool
    automatic_resolution: bool


class OpenAlephReviewRefreshOut(ResponseModel):
    document_id: str
    provider: str
    evidence: OpenAlephEvidenceImportOut
    entities: OpenAlephEntityImportOut
    status: OpenAlephReviewStatusOut


# --- The corpus copy of confirmed records (ADR-0006, Wave B) -----------------------
# Every key is always sent (null when unknown), as for BackgroundJobOut.

class OpenAlephOperationFailureOut(ResponseModel):
    """A failed OpenAleph operation, kept for the reporter and the operator."""
    id: str
    investigation_id: str
    document_id: str | None
    operation: str
    error: str
    created_at: datetime


class CorpusPendingOut(ResponseModel):
    """What the next push would change, and the records it cannot send (with why)."""
    to_send: int
    to_remove: int
    cannot_send: list[str]


class CorpusPushOut(ResponseModel):
    """The last push of confirmed records to the investigation's collection."""
    status: Literal["never", "running", "succeeded", "waiting", "failed"]
    started_at: datetime | None
    finished_at: datetime | None
    message: str | None
    error: str | None
    sent: int
    removed: int
    unchanged: int
    removals_waiting: int


class CorpusSyncOut(ResponseModel):
    """The "Corpus sync" line: is OpenAleph in step with what reporters confirmed?"""
    investigation_id: str
    enabled: bool
    # True when a background worker sends changes by itself; otherwise only
    # "Sync now" does (developer mode).
    background: bool
    collection_id: str | None
    collection_label: str | None
    pushed_records: int
    pending: CorpusPendingOut
    push: CorpusPushOut
    consecutive_failures: int
    failures: list[OpenAlephOperationFailureOut]


class CorpusSyncNowOut(ResponseModel):
    """The answer to "Sync now": queued for the worker, or run here and finished."""
    queued: bool
    ran: bool
    sync: CorpusSyncOut


# --- Portable backups --------------------------------------------------------------

class BackupInvestigationOut(ResponseModel):
    id: str
    name: str
    description: str | None = None


class LineageIntegrityOut(ResponseModel):
    """Whether every proposal in the archive still points at its document,
    chunk and accepted record."""
    document_count: int
    chunk_count: int
    candidate_count: int
    candidate_status_counts: dict[str, int]
    accepted_record_counts: dict[str, int]
    valid: bool
    errors: list[str]


class RestoreConflictOut(ResponseModel):
    kind: str  # database_record | foreign_investigation | document_path
    table: str
    id: str
    message: str


class BackupPreviewOut(ResponseModel):
    format: str
    version: int
    investigation: BackupInvestigationOut
    record_counts: dict[str, int]
    lineage_integrity: LineageIntegrityOut | None = None
    document_file_count: int
    missing_document_count: int
    warnings: list[str]
    conflicts: list[RestoreConflictOut]
    can_restore: bool
    restore_api_enabled: bool


class BackupRestoreResultOut(ResponseModel):
    investigation_id: str
    restored_counts: dict[str, int]
    # The archive's own manifest.json, echoed back as it was read.
    manifest: dict[str, Any]


# --- Claims --------------------------------------------------------------------

class ClaimOut(ResponseModel):
    id: str
    investigation_id: str
    text: str
    status: str  # lead | unverified | supported | confirmed | disputed | rejected
    confidence: float
    created_at: datetime


class StanceCountsOut(ResponseModel):
    """How many evidence links take each stance."""
    supports: int
    contradicts: int
    context: int


class ClaimEvidenceLinkOut(ResponseModel):
    """The link itself, as stored (the reply to linking evidence to a claim)."""
    id: str
    claim_id: str
    evidence_id: str
    stance: str  # supports | contradicts | context
    note: str | None = None
    created_at: datetime


class ClaimEvidenceRowOut(ResponseModel):
    """One linked evidence record with the source it came from, as the
    claim's evidence list and review workspace show it."""
    id: str
    stance: str
    note: str | None = None
    created_at: datetime
    evidence: EvidenceOut | None = None
    source: SourceOut | None = None


class ClaimDependentRelationshipOut(ResponseModel):
    """A canonical relationship that rests on evidence linked to the claim."""
    id: str
    relationship_entity_id: str | None = None
    source_entity_id: str
    target_entity_id: str
    evidence_ids: list[str]


class ClaimReviewEventOut(ResponseModel):
    id: str
    claim_id: str
    from_status: str
    to_status: str
    from_confidence: float
    to_confidence: float
    rationale: str
    created_at: datetime


class ClaimReviewWorkspaceOut(ResponseModel):
    claim: ClaimOut
    evidence: list[ClaimEvidenceRowOut]
    dependent_relationships: list[ClaimDependentRelationshipOut]
    review_history: list[ClaimReviewEventOut]
    stance_counts: StanceCountsOut


class ClaimReviewResultOut(ResponseModel):
    """The reply to recording a review: the claim as it now stands, the
    immutable review event, and the workspace refreshed."""
    claim: ClaimOut
    review: ClaimReviewEventOut
    workspace: ClaimReviewWorkspaceOut


# --- Leads and reporting tasks -------------------------------------------------

class LeadLinkOut(ResponseModel):
    """What a lead points at: exactly one record, named by its kind."""
    id: str
    lead_id: str
    type: Literal["entity", "source", "claim", "evidence", "relationship"] | None = None
    target_id: str | None = None
    label: str | None = None
    note: str | None = None
    created_at: datetime


class TaskWorkflowEventOut(ResponseModel):
    id: str
    from_status: str | None = None
    to_status: str
    note: str | None = None
    created_at: datetime
    # The lead's context frozen when the event was recorded, in the shape
    # that version wrote; a later edit never rewrites it.
    lead_provenance: dict[str, Any] | None = None


class ReportingTaskOut(ResponseModel):
    id: str
    investigation_id: str
    lead_id: str | None = None
    title: str
    detail: str | None = None
    status: str  # todo | in_progress | blocked | done | cancelled
    priority: str  # low | normal | high | urgent
    owner: str | None = None
    due_date: str | None = None
    created_at: datetime
    updated_at: datetime
    history: list[TaskWorkflowEventOut]
    # The newest frozen lead snapshot from the history, for the task list.
    task_context: dict[str, Any] | None = None


class LeadWorkflowEventOut(ResponseModel):
    id: str
    lead_id: str
    from_status: str | None = None
    to_status: str
    note: str | None = None
    created_at: datetime


class LeadTriageOut(ResponseModel):
    """Evidence tension around the records a lead links to: a queue-attention
    signal only, never a change to the lead or its records."""
    needs_attention: bool
    attention_score: int
    stance_counts: StanceCountsOut
    linked_claim_count: int
    disputed_claim_count: int
    relationship_evidence_review_counts: dict[str, int]
    reasons: list[str]


class LeadOut(ResponseModel):
    id: str
    investigation_id: str
    title: str
    detail: str | None = None
    provider: str | None = None
    provider_record_id: str | None = None
    kind: Literal["connector", "question"]
    status: str  # unreviewed | active | blocked | resolved | rejected
    priority: str
    owner: str | None = None
    next_action: str | None = None
    created_at: datetime
    links: list[LeadLinkOut]
    tasks: list[ReportingTaskOut]
    history: list[LeadWorkflowEventOut]
    triage: LeadTriageOut


class LeadQueueOut(ResponseModel):
    """The leads of a case in triage order, with counts by status."""
    investigation_id: str
    total: int
    counts: dict[str, int]
    items: list[LeadOut]


class LeadClaimConversionOut(ResponseModel):
    kind: Literal["claim"]
    record: ClaimOut
    lead: LeadOut


class LeadTaskConversionOut(ResponseModel):
    kind: Literal["task"]
    record: ReportingTaskOut
    lead: LeadOut


# Converting a lead makes a claim or a task; `kind` says which record follows.
LeadConversionOut = Annotated[LeadClaimConversionOut | LeadTaskConversionOut, Field(discriminator="kind")]


# --- Investigations and canonical entities ---------------------------------------

class InvestigationOut(ResponseModel):
    id: str
    name: str
    description: str | None = None
    is_demo: bool
    created_at: datetime


class EntityOut(ResponseModel):
    """A canonical FollowTheMoney entity as stored. `merged_into_entity_id`
    names the surviving record when this one was merged away."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    investigation_id: str
    ftm_id: str
    schema_: str = Field(alias="schema")
    caption: str
    properties: dict[str, list[str]]
    canonical_id: str | None = None
    merged_into_entity_id: str | None = None
    created_at: datetime


class EntityStatementOut(StatementOut):
    """A statement as stored, with the entity it belongs to."""
    entity_id: str


class PropertyTemporalIntervalOut(ResponseModel):
    """When one value of a property held, as the reporter recorded it."""
    value: str
    date_start: str | None = None
    date_end: str | None = None
    precision: str
    evidence_id: str | None = None


class PropertyConflictDecisionOut(ResponseModel):
    """A reporter's decision on a property with several values, as stored."""
    id: str
    investigation_id: str
    entity_id: str
    prop: str
    decision: str  # preferred | superseded | temporal_change | both_valid | unresolved
    values_json: list[str]
    preferred_value: str | None = None
    rationale: str | None = None
    temporal_intervals_json: list[PropertyTemporalIntervalOut]
    created_at: datetime


# --- External connectors and their findings ------------------------------------------

class ConnectorStatusOut(ResponseModel):
    configured: bool


class ConnectorsOut(ResponseModel):
    """The connectors this server knows, and whether each has what it needs."""
    providers: list[str]
    status: dict[str, ConnectorStatusOut]


class ConnectorRunOut(ResponseModel):
    id: str
    investigation_id: str
    provider: str
    query: str
    status: str
    result_count: int
    error: str | None = None
    started_at: datetime
    finished_at: datetime | None = None


class ConnectorFindingOut(ResponseModel):
    """What a connector found, kept as the provider sent it (`properties` and
    `raw` are the provider's own shapes) until a reporter decides what it means."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    investigation_id: str
    run_id: str | None = None
    provider: str
    provider_record_id: str
    caption: str
    schema_: str | None = Field(default=None, alias="schema")
    properties: dict[str, Any]
    source_url: str | None = None
    raw: dict[str, Any]
    review_status: str  # unreviewed | accepted | needs_followup | rejected
    created_at: datetime


class EntityCandidateOut(ResponseModel):
    """A canonical entity that may be what a finding describes, with a name-match score."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    entity_id: str
    caption: str
    schema_: str = Field(alias="schema")
    score: float


class ResolutionDecisionOut(ResponseModel):
    """A reporter's identity decision on a finding, as stored."""
    id: str
    investigation_id: str
    finding_id: str
    entity_id: str | None = None
    decision: str  # positive | negative | unsure
    confidence: float
    rationale: str | None = None
    created_at: datetime


class StatementAssessmentOut(ResponseModel):
    """A reporter's assessment of one value a finding asserts, as stored."""
    id: str
    investigation_id: str
    finding_id: str
    entity_id: str | None = None
    prop: str
    value: str
    status: str  # accepted | conflicting | outdated | superseded | unresolved
    note: str | None = None
    created_at: datetime


class StatementPromotionOut(ResponseModel):
    """An accepted value written into the canonical graph, with its provenance."""
    id: str
    investigation_id: str
    finding_id: str
    assessment_id: str
    entity_id: str
    statement_id: str
    provider: str
    dataset: str
    source_url: str | None = None
    original_value: str
    reviewer_note: str | None = None
    promoted_at: datetime


class ExternalEndpointFindingOut(ResponseModel):
    """The connector finding that describes one end of an external relationship."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    caption: str
    schema_: str | None = Field(default=None, alias="schema")
    provider_record_id: str
    source_url: str | None = None


class ExternalRelationshipCandidatesOut(ResponseModel):
    """For a relationship a connector found: which canonical entities may be
    its two ends. An end's own finding is named only when the connector
    also returned it."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    schema_: str = Field(alias="schema")
    source_prop: str
    target_prop: str
    source_external_id: str
    target_external_id: str
    source_candidates: list[EntityCandidateOut]
    target_candidates: list[EntityCandidateOut]
    source_external_finding: ExternalEndpointFindingOut | None = Field(default=None, exclude_if=_absent_when_none)
    target_external_finding: ExternalEndpointFindingOut | None = Field(default=None, exclude_if=_absent_when_none)


class ExternalRelationshipReviewOut(ResponseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    investigation_id: str
    finding_id: str
    schema_: str = Field(alias="schema")
    source_entity_id: str | None = None
    target_entity_id: str | None = None
    decision: str  # supported | conflicting | unresolved | rejected
    note: str | None = None
    created_at: datetime


class ExternalRelationshipPromotionOut(ResponseModel):
    """A supported external relationship written into the canonical graph."""
    id: str
    investigation_id: str
    finding_id: str
    review_id: str
    relationship_edge_id: str
    relationship_entity_id: str
    provider: str
    source_url: str | None = None
    promoted_at: datetime


# --- Enrichment sessions and cross-provider clusters -----------------------------------

class EnrichmentRunResultOut(ResponseModel):
    """One provider's part of an enrichment session; `error` is sent only when it failed."""
    provider: str
    status: str  # completed | failed
    result_count: int
    run_id: str
    error: str | None = Field(default=None, exclude_if=_absent_when_none)


class EnrichmentSessionOut(ResponseModel):
    """The reply to running every chosen connector against one entity."""
    id: str
    entity_id: str
    investigation_id: str
    status: str  # completed | partial | failed
    providers: list[str]
    total_results: int
    started_at: datetime
    finished_at: datetime | None = None
    runs: list[EnrichmentRunResultOut]


class EnrichmentSessionRowOut(ResponseModel):
    """An enrichment session as stored."""
    id: str
    investigation_id: str
    entity_id: str
    status: str
    providers: list[str]
    total_results: int
    started_at: datetime
    finished_at: datetime | None = None


class EnrichmentSessionRunOut(ResponseModel):
    id: str
    session_id: str
    run_id: str | None = None
    provider: str
    status: str
    result_count: int
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class EnrichmentSessionDetailOut(EnrichmentSessionRowOut):
    """A stored session with its per-provider runs."""
    runs: list[EnrichmentSessionRunOut]


class EnrichmentSessionFindingOut(ResponseModel):
    id: str
    session_id: str
    finding_id: str
    provider: str
    created_at: datetime


class CrossProviderDecisionOut(ResponseModel):
    """A reporter's decision that findings from different providers are, or
    are not, the same outside entity."""
    id: str
    investigation_id: str
    entity_id: str
    session_id: str | None = None
    cluster_key: str
    finding_ids: list[str]
    decision: str  # positive | negative | unsure
    confidence: float
    rationale: str | None = None
    created_at: datetime


class ClusterReasonOut(ResponseModel):
    kind: str  # schema | identifier | name | context
    detail: str
    weight: float


class ClusterPairOut(ResponseModel):
    finding_ids: list[str]
    score: float
    reasons: list[ClusterReasonOut]


class ClusterFindingOut(ResponseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    provider: str
    provider_record_id: str
    caption: str
    schema_: str | None = Field(default=None, alias="schema")
    properties: dict[str, Any]
    source_url: str | None = None


class ClusterDecisionOut(ResponseModel):
    id: str
    decision: str
    confidence: float
    rationale: str | None = None
    created_at: datetime


class EnrichmentClusterOut(ResponseModel):
    """Findings from different providers that may describe one outside
    entity, with the reasons for each pairing and the latest reporter decision."""
    cluster_key: str
    score: float
    providers: list[str]
    finding_ids: list[str]
    findings: list[ClusterFindingOut]
    pairs: list[ClusterPairOut]
    decision: ClusterDecisionOut | None = None


# --- Canonical duplicates, merges and post-merge reconciliation ----------------------------

class CanonicalDecisionSummaryOut(ResponseModel):
    """The latest reporter decision on a duplicate pair (`created_at` as the
    service formats it, an ISO string)."""
    id: str
    decision: str  # same | different | unsure
    confidence: float
    rationale: str | None = None
    created_at: str


class CanonicalDuplicateCandidateOut(EntityCandidateOut):
    latest_decision: CanonicalDecisionSummaryOut | None = None


class CanonicalResolutionDecisionOut(ResponseModel):
    """A reporter's decision whether two canonical records are one entity, as stored."""
    id: str
    investigation_id: str
    entity_a_id: str
    entity_b_id: str
    decision: str  # same | different | unsure
    confidence: float
    rationale: str | None = None
    created_at: datetime


class MergeEntityOut(ResponseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    caption: str
    schema_: str = Field(alias="schema")


class MergeResolutionOut(ResponseModel):
    id: str
    decision: str
    confidence: float
    rationale: str | None = None


class MergeReferenceOut(ResponseModel):
    """Records of one kind that would move to the surviving entity (the first hundred ids)."""
    count: int
    record_ids: list[str]


class MergeBlockerOut(ResponseModel):
    code: str  # relationship_self_loop | external_review_self_loop
    record_ids: list[str]
    message: str


class CanonicalMergePreviewOut(ResponseModel):
    """What a merge would move, what blocks it, and the digest the execute
    call must repeat so a stale preview is never acted on."""
    source: MergeEntityOut
    target: MergeEntityOut
    resolution: MergeResolutionOut | None = None
    references: dict[str, MergeReferenceOut]
    total_references: int
    blockers: list[MergeBlockerOut]
    can_execute: bool
    preview_digest: str


class CanonicalEntityMergeAuditOut(ResponseModel):
    """The record of a merge: the preview it was executed from and what moved."""
    id: str
    investigation_id: str
    source_entity_id: str
    target_entity_id: str
    resolution_decision_id: str | None = None
    preview_digest: str
    # The preview the merge was executed from, stored as it was shown.
    preview_json: dict[str, Any]
    moved_counts_json: dict[str, int]
    rationale: str | None = None
    created_at: datetime


class CanonicalMergeExecuteOut(ResponseModel):
    audit: CanonicalEntityMergeAuditOut
    source_entity_id: str
    target_entity_id: str


class ReconciliationDecisionOut(ResponseModel):
    """A reporter's decision on one duplicate pair after a merge."""
    id: str
    investigation_id: str
    entity_id: str
    record_type: str  # statement | relationship
    record_a_id: str
    record_b_id: str
    decision: str  # duplicate | keep_separate | unsure
    rationale: str | None = None
    preferred_record_id: str | None = None
    created_at: datetime


class StatementDuplicatePairOut(ResponseModel):
    """Two statements of the merged entity that assert the same value."""
    record_type: Literal["statement"]
    record_a: StatementOut
    record_b: StatementOut
    same_assertion: bool
    provenance_differs: bool
    latest_decision: ReconciliationDecisionOut | None = None


class RelationshipDuplicatePairOut(ResponseModel):
    """Two edges of the merged entity with the same schema and ends."""
    record_type: Literal["relationship"]
    record_a: RelationshipOut
    record_b: RelationshipOut
    same_assertion: bool
    provenance_differs: bool
    latest_decision: ReconciliationDecisionOut | None = None


class ReconciliationSummaryOut(ResponseModel):
    statement_pairs: int
    relationship_pairs: int
    unresolved_pairs: int


class PostMergeReconciliationOut(ResponseModel):
    """The duplicate pairs a merge left behind, for the reporter to review.
    Nothing is deleted: a decision only records which record is preferred."""
    entity_id: str
    statement_duplicates: list[StatementDuplicatePairOut]
    relationship_duplicates: list[RelationshipDuplicatePairOut]
    summary: ReconciliationSummaryOut


# --- Entity dossier ------------------------------------------------------------------

class EntityAliasLinkOut(ResponseModel):
    id: str
    caption: str
    merged_into_entity_id: str | None = None


class EntityAliasResolutionOut(ResponseModel):
    """Sent when the dossier was asked for by a merged alias: which record
    was asked for and which one answers."""
    requested_entity_id: str
    requested_caption: str
    active_entity_id: str
    active_caption: str
    alias_chain: list[EntityAliasLinkOut]


class IdentityAliasOut(ResponseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    caption: str
    schema_: str = Field(alias="schema")
    merged_into_entity_id: str | None = None


class IdentityDecisionOut(ResponseModel):
    id: str
    decision: str
    confidence: float
    rationale: str | None = None
    created_at: datetime
    other_entity: MergeEntityOut | None = None


class IdentityMergeAuditOut(ResponseModel):
    id: str
    source_entity_id: str
    target_entity_id: str
    resolution_decision_id: str | None = None
    rationale: str | None = None
    moved_counts: dict[str, int]
    created_at: datetime


class EntityIdentityHistoryOut(ResponseModel):
    """Every identity judgement about the entity: merged aliases, reporter
    decisions, merge audits. Audit-oriented; nothing here is inferred."""
    canonical_entity_id: str
    aliases: list[IdentityAliasOut]
    canonical_decisions: list[IdentityDecisionOut]
    merge_audits: list[IdentityMergeAuditOut]
    unresolved_decision_count: int


class DossierSummaryOut(ResponseModel):
    statement_count: int
    property_conflict_count: int
    identity_alias_count: int
    identity_decision_count: int
    identity_unresolved_count: int
    relationship_count: int
    relationship_underlying_count: int
    relationship_suppressed_duplicate_count: int
    relationship_schemas: dict[str, int]
    relationship_review_advisory_count: int
    relationship_mixed_support_count: int
    claim_count: int
    claim_statuses: dict[str, int]
    evidence_count: int
    lead_count: int
    task_count: int
    timeline_event_count: int
    external_finding_count: int
    external_finding_statuses: dict[str, int]
    enrichment_session_count: int
    unresolved_external_count: int


class DossierConflictDecisionOut(ResponseModel):
    """A property-conflict decision as the dossier shows it."""
    id: str
    decision: str
    values: list[str]
    preferred_value: str | None = None
    rationale: str | None = None
    temporal_intervals: list[PropertyTemporalIntervalOut]
    created_at: datetime


class DossierConflictValueOut(ResponseModel):
    """One value of a disputed property: where it is asserted and how it was assessed."""
    value: str
    canonical: bool
    support_count: int
    conflict_count: int
    latest_status: str | None = None
    canonical_statements: list[CanonicalStatementOut]
    external_assessments: list[ExternalAssessmentOut]


class DossierPropertyConflictOut(ResponseModel):
    """A property with several canonical values, or an outside conflict with
    its value. Diagnostic only: the dossier never picks a value itself."""
    prop: str
    status: str
    preferred_value: str | None = None
    reason: str  # multiple_canonical_values | external_conflict
    latest_decision: DossierConflictDecisionOut | None = None
    decision_history: list[DossierConflictDecisionOut]
    values: list[DossierConflictValueOut]


class DossierMatchBasisOut(ResponseModel):
    """Why a record is in the dossier: an explicit link, or (named as such) a
    text mention of the entity, with the matched terms."""
    type: str
    terms: list[str] | None = Field(default=None, exclude_if=_absent_when_none)


class DossierClaimOut(ResponseModel):
    claim: ClaimOut
    match_basis: DossierMatchBasisOut


class DossierClaimLinkOut(ResponseModel):
    claim_id: str
    stance: str
    note: str | None = None


class DossierEvidenceOut(ResponseModel):
    evidence: EvidenceOut
    source: SourceOut | None = None
    match_basis: DossierMatchBasisOut
    claim_links: list[DossierClaimLinkOut]


class LeadRowOut(ResponseModel):
    """A lead as stored (without its profile, links and history)."""
    id: str
    investigation_id: str
    title: str
    detail: str | None = None
    provider: str | None = None
    provider_record_id: str | None = None
    status: str
    created_at: datetime


class DossierLeadOut(ResponseModel):
    lead: LeadRowOut
    match_basis: DossierMatchBasisOut


class DossierExternalOut(ResponseModel):
    """Everything connectors found about the entity and every review of it."""
    findings: list[ConnectorFindingOut]
    resolution_decisions: list[ResolutionDecisionOut]
    statement_assessments: list[StatementAssessmentOut]
    promotions: list[StatementPromotionOut]
    enrichment_sessions: list[EnrichmentSessionRowOut]
    enrichment_links: list[EnrichmentSessionFindingOut]
    cross_provider_decisions: list[CrossProviderDecisionOut]


class EntityDossierOut(ResponseModel):
    """Everything the workbench holds about one canonical entity."""
    entity: EntityOut
    alias_resolution: EntityAliasResolutionOut | None = None
    identity_history: EntityIdentityHistoryOut
    summary: DossierSummaryOut
    statement_history: list[StatementHistoryRowOut]
    property_conflicts: list[DossierPropertyConflictOut]
    relationships: list[EntityRelationshipOut]
    claims: list[DossierClaimOut]
    evidence: list[DossierEvidenceOut]
    leads: list[DossierLeadOut]
    tasks: list[ReportingTaskOut]
    timeline: list[TimelineEventOut]
    external: DossierExternalOut


# --- Money flows ---------------------------------------------------------------------

class FinancialTransactionOut(ResponseModel):
    """One Payment edge the ledger could read in full. Keys follow the
    frontend's transaction type (lib/financial-flow-types.ts)."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    relationship_id: str
    dateTime: str | None = None
    from_: str = Field(alias="from")
    to: str
    from_entity_id: str
    to_entity_id: str
    amount: float
    currency: str
    statedPurpose: str | None = None
    transactionNumber: str | None = None
    evidence: str | None = None
    evidence_count: int
    supporting_evidence_count: int
    status: str | None = None
    flowType: Literal["direct", "inferred"]


class IncompleteTransactionOut(ResponseModel):
    """A Payment edge the ledger could not chart, with what is missing or
    ambiguous; nothing is guessed."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: str
    relationship_id: str
    dateTime: str | None = None
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    from_entity_id: str | None = None
    to_entity_id: str | None = None
    amount: float | None = None
    currency: str | None = None
    statedPurpose: str | None = None
    transactionNumber: str | None = None
    evidence: str | None = None
    evidence_count: int
    supporting_evidence_count: int
    status: str | None = None
    flowType: Literal["direct", "inferred"]
    problems: list[str]


class FinancialLedgerOut(ResponseModel):
    investigation_id: str
    transactions: list[FinancialTransactionOut]
    incomplete: list[IncompleteTransactionOut]
    currencies: list[str]
    flow_type_rule: str
    duplicate_rule: str


# --- Settings, credentials and the security audit ------------------------------------------

class SettingsLimitsOut(ResponseModel):
    max_document_bytes: int
    max_backup_bytes: int
    max_backup_uncompressed_bytes: int
    max_backup_files: int


class OcrRuntimeStatusOut(ResponseModel):
    available: bool
    tessdata: str | None = None
    requested_languages: list[str]
    missing_languages: list[str]
    detail: str | None = None


class DocumentExtractionSettingsOut(ResponseModel):
    pdf_ocr_enabled: bool
    pdf_ocr_language: str
    pdf_ocr_dpi: int
    pdf_ocr_min_native_chars: int
    local_entity_suggestions_enabled: bool
    entity_extraction_owner: Literal["workbench_local", "openaleph_ftm_analyze"]
    ocr_runtime: OcrRuntimeStatusOut


class ApiAccessStatusOut(ResponseModel):
    remote_api_enabled: bool
    mode: Literal["local_only", "shared_bearer", "persisted_users"]
    token_configured: bool
    persisted_identity_count: int
    investigation_scope_configured: bool


class SecurityAuditRecordOut(ResponseModel):
    """One audit line's public fields: request metadata only, never a body."""
    timestamp: str
    event: str
    request_id: str
    method: str
    path: str
    status_code: int
    local_request: bool
    client_host: str | None = Field(default=None, exclude_if=_absent_when_none)


class SecurityRemoteHostOut(ResponseModel):
    client_host: str
    count: int


class SecurityAlertsOut(ResponseModel):
    """Denial events in a recent window, counted for an operator's glance."""
    window_hours: float
    since: str
    total_denials: int
    by_event: dict[str, int]
    remote_hosts: list[SecurityRemoteHostOut]
    recent: list[SecurityAuditRecordOut]
    attention_threshold: int
    needs_attention: bool
    records_scanned: int
    malformed_lines: int
    read_error: bool


class AiLimitsOut(ResponseModel):
    runs_per_minute_per_actor: int
    max_concurrent_runs: int
    request_timeout_seconds: float
    max_output_tokens: int


class AiModuleStatusOut(ResponseModel):
    spec_file: str
    available: bool
    vendored_tas: bool


class AiControlFlagOut(ResponseModel):
    default: str
    allowed: list[str]


class AiControlSurfaceOut(ResponseModel):
    spec_file: str
    available: bool
    flags: dict[str, AiControlFlagOut]


class AiTasSpecOut(ResponseModel):
    present: bool
    version: str | None
    modules: dict[str, AiModuleStatusOut]
    control_surface: AiControlSurfaceOut


class AiReasoningStatusOut(ResponseModel):
    """Whether the AI reasoning endpoints can be called, and what they would
    run on. Never carries key material. Every key is always sent (null when
    unknown), so the nullable ones have no default: the generated type then
    matches the AI panel's own status type (lib/api-types.ts)."""
    enabled: bool
    provider: str | None
    provider_key_configured: bool
    endpoints_callable: bool
    model: str | None
    runs_on_this_computer: bool | None
    remote_endpoint_allowed: bool
    limits: AiLimitsOut
    tas_spec: AiTasSpecOut


class ConnectorCredentialStatusOut(ResponseModel):
    """Whether a connector has a credential and where it comes from; the secret itself is never sent."""
    configured: bool
    source: str  # local_store | environment | none
    local_store_present: bool
    permissions_restricted: bool
    storage_protection: str


class SettingsStatusOut(ResponseModel):
    """The server configuration the page reads on load. A remote caller
    without admin rights gets the same keys with the server-wide values blanked."""
    environment: str
    database: str
    document_storage_dir: str
    limits: SettingsLimitsOut
    restore_api_enabled: bool
    document_extraction: DocumentExtractionSettingsOut
    access: ApiAccessStatusOut
    cors_allowed_origins: list[str]
    security: SecurityAlertsOut
    ai: AiReasoningStatusOut
    connectors: dict[str, ConnectorCredentialStatusOut]


class ConnectorCredentialSavedOut(ConnectorCredentialStatusOut):
    provider: str


class ConnectorCredentialRemovedOut(ConnectorCredentialSavedOut):
    removed: bool


class OrphanFileOut(ResponseModel):
    relative_path: str
    size_bytes: int
    modified_at: float
    action: str


class UnsafeDocumentReferenceOut(ResponseModel):
    document_id: str
    storage_path: str
    error: str


class OrphanStoragePreviewOut(ResponseModel):
    """Files under document storage no document refers to. Read-only: they are kept until a reporter decides."""
    storage_root: str
    orphan_files: list[OrphanFileOut]
    orphan_file_count: int
    orphan_bytes: int
    unsafe_document_references: list[UnsafeDocumentReferenceOut]
    cleanup_available: bool
    policy: str


class SecurityAuditViewOut(ResponseModel):
    """One page of the audit log, newest first. `read_error` is sent only when the file could not be read."""
    records: list[SecurityAuditRecordOut]
    returned: int
    total_matched: int
    offset: int
    has_more: bool
    next_offset: int | None = None
    malformed_lines: int
    file_bytes: int
    read_error: bool | None = Field(default=None, exclude_if=_absent_when_none)


class SecurityAuditSummaryOut(ResponseModel):
    total_records: int
    malformed_lines: int
    local_records: int
    remote_records: int
    file_bytes: int
    by_event: dict[str, int]
    by_method: dict[str, int]
    by_status: dict[str, int]
    read_error: bool | None = Field(default=None, exclude_if=_absent_when_none)


class SecurityAuditRetentionPreviewOut(ResponseModel):
    """What a retention run would keep and remove; malformed lines are always kept."""
    keep_days: int
    max_records: int
    total_lines: int
    valid_records: int
    malformed_lines: int
    would_keep: int
    would_remove: int
    file_bytes: int


class SecurityAuditRetentionResultOut(SecurityAuditRetentionPreviewOut):
    removed: int
    applied: bool
