from pydantic import BaseModel, Field

class InvestigationCreate(BaseModel):
    name: str
    description: str | None = None

class EntityCreate(BaseModel):
    investigation_id: str
    schema: str
    caption: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    dataset: str = "reporter"
    origin: str | None = None

class SourceCreate(BaseModel):
    investigation_id: str
    title: str
    url: str | None = None
    source_type: str = "web"
    metadata_json: dict = Field(default_factory=dict)

class EvidenceCreate(BaseModel):
    source_id: str
    quote: str | None = None
    locator: str | None = None
    notes: str | None = None

class ClaimEvidenceLinkCreate(BaseModel):
    evidence_id: str
    stance: str
    note: str | None = None

class ClaimCreate(BaseModel):
    investigation_id: str
    text: str
    status: str = "lead"
    confidence: float = 0.0

class ClaimUpdate(BaseModel):
    text: str | None = None
    status: str | None = None
    confidence: float | None = None

class LeadCreate(BaseModel):
    investigation_id: str
    title: str
    detail: str | None = None
    provider: str | None = None
    provider_record_id: str | None = None
    relationship_id: str | None = None
    status: str = "unreviewed"


class LeadUpdate(BaseModel):
    title: str | None = None
    detail: str | None = None
    status: str | None = None
    priority: str | None = None
    owner: str | None = None
    next_action: str | None = None
    note: str | None = None


class LeadLinkCreate(BaseModel):
    entity_id: str | None = None
    source_id: str | None = None
    claim_id: str | None = None
    evidence_id: str | None = None
    relationship_id: str | None = None
    note: str | None = None


class LeadConvertRequest(BaseModel):
    kind: str
    title: str | None = None
    text: str | None = None
    detail: str | None = None
    priority: str | None = None
    owner: str | None = None
    due_date: str | None = None


class ReportingTaskCreate(BaseModel):
    investigation_id: str
    title: str
    detail: str | None = None
    status: str = "todo"
    priority: str = "normal"
    owner: str | None = None
    due_date: str | None = None
    lead_id: str | None = None


class ReportingTaskUpdate(BaseModel):
    title: str | None = None
    detail: str | None = None
    status: str | None = None
    priority: str | None = None
    owner: str | None = None
    due_date: str | None = None
    workflow_note: str | None = None


class TimelineEventCreate(BaseModel):
    investigation_id: str
    title: str
    description: str | None = None
    date_start: str
    date_end: str | None = None
    precision: str = "day"
    verification_status: str = "asserted"
    entity_id: str | None = None
    relationship_entity_id: str | None = None
    source_id: str | None = None
    evidence_id: str | None = None
    claim_id: str | None = None
    lead_id: str | None = None
    dataset: str = "reporter"
    origin: str | None = None

class AlephSearchRequest(BaseModel):
    investigation_id: str
    query: str

class ConnectorSearchRequest(BaseModel):
    investigation_id: str
    query: str

class InvestigationQuestionContextRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    max_results: int = Field(default=30, ge=1, le=100)
    include_external_leads: bool = True
    include_reconciled_duplicates: bool = False

class FindingReviewRequest(BaseModel):
    status: str

class ResolutionRequest(BaseModel):
    entity_id: str | None = None
    decision: str
    confidence: float = 0.0
    rationale: str | None = None

class CanonicalResolutionRequest(BaseModel):
    other_entity_id: str
    decision: str
    confidence: float = 0.0
    rationale: str | None = None

class CanonicalMergeExecuteRequest(BaseModel):
    target_entity_id: str
    preview_digest: str
    rationale: str | None = None

class PostMergeReconciliationRequest(BaseModel):
    record_type: str
    record_a_id: str
    record_b_id: str
    decision: str
    rationale: str | None = None
    preferred_record_id: str | None = None

class PropertyTemporalInterval(BaseModel):
    value: str
    date_start: str | None = None
    date_end: str | None = None
    precision: str = "day"
    evidence_id: str | None = None

class PropertyConflictDecisionRequest(BaseModel):
    decision: str
    values: list[str]
    preferred_value: str | None = None
    rationale: str | None = None
    temporal_intervals: list[PropertyTemporalInterval] = Field(default_factory=list)

class StatementAssessmentRequest(BaseModel):
    entity_id: str | None = None
    prop: str
    value: str
    status: str
    note: str | None = None


class StatementPromotionRequest(BaseModel):
    note: str | None = None


class MultiEnrichmentRequest(BaseModel):
    providers: list[str] = Field(default_factory=list)


class CrossProviderDecisionRequest(BaseModel):
    finding_ids: list[str] = Field(default_factory=list)
    decision: str
    confidence: float = 0.0
    rationale: str | None = None


class RelationshipCreate(BaseModel):
    investigation_id: str
    schema: str
    source_entity_id: str
    target_entity_id: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    dataset: str = "reporter"
    origin: str | None = None
    evidence_id: str | None = None


class RelationshipEvidenceAttachRequest(BaseModel):
    evidence_id: str
    note: str | None = None


class RelationshipEvidenceReviewRequest(BaseModel):
    stance: str
    rationale: str


class ExtractedRelationshipProposalCreate(BaseModel):
    schema: str
    source_entity_id: str
    target_entity_id: str
    properties: dict[str, list[str]] = Field(default_factory=dict)
    evidence_id: str | None = None
    note: str | None = None


class ExternalRelationshipReviewRequest(BaseModel):
    source_entity_id: str | None = None
    target_entity_id: str | None = None
    decision: str
    note: str | None = None


class ExtractionCandidateReviewRequest(BaseModel):
    decision: str
    note: str | None = None
    entity_schema: str | None = None
    caption: str | None = None
    claim_status: str = "lead"
    confidence: float | None = None
    matched_entity_id: str | None = None
    entity_identity_decision: str | None = None

class AppUserCreate(BaseModel):
    display_name: str
    global_role: str = "member"


class AppUserUpdate(BaseModel):
    display_name: str | None = None
    global_role: str | None = None
    disabled: bool | None = None


class InvestigationMembershipPut(BaseModel):
    role: str = "viewer"

class ClaimReviewRequest(BaseModel):
    status: str
    confidence: float
    rationale: str
