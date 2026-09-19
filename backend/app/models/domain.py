import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
from app.core.time import utcnow_naive

def uid() -> str:
    return str(uuid.uuid4())

class Investigation(Base):
    __tablename__ = "investigations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class Entity(Base):
    __tablename__ = "entities"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    ftm_id: Mapped[str] = mapped_column(String(512), index=True)
    schema: Mapped[str] = mapped_column(String(128), index=True)
    caption: Mapped[str] = mapped_column(String(512), index=True)
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    canonical_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    merged_into_entity_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class Statement(Base):
    __tablename__ = "statements"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    prop: Mapped[str] = mapped_column(String(255), index=True)
    value: Mapped[str] = mapped_column(Text)
    dataset: Mapped[str] = mapped_column(String(255), index=True)
    origin: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(64), default="web")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    locator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class ClaimEvidenceLink(Base):
    __tablename__ = "claim_evidence_links"
    __table_args__ = (UniqueConstraint("claim_id", "evidence_id", "stance", name="uq_claim_evidence_stance"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    stance: Mapped[str] = mapped_column(String(32), index=True)  # supports/contradicts/context
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(64), default="lead")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="unreviewed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class LeadProfile(Base):
    __tablename__ = "lead_profiles"
    __table_args__ = (UniqueConstraint("lead_id", name="uq_lead_profile_lead"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id"), index=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    owner: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class LeadLink(Base):
    __tablename__ = "lead_links"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id"), index=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True, index=True)
    claim_id: Mapped[str | None] = mapped_column(ForeignKey("claims.id"), nullable=True, index=True)
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True, index=True)
    relationship_id: Mapped[str | None] = mapped_column(ForeignKey("relationship_edges.id"), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class LeadWorkflowEvent(Base):
    __tablename__ = "lead_workflow_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_status: Mapped[str] = mapped_column(String(64), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ReportingTask(Base):
    __tablename__ = "reporting_tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="todo", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    owner: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class ReportingTaskWorkflowEvent(Base):
    __tablename__ = "reporting_task_workflow_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("reporting_tasks.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_provenance_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class TimelineEvent(Base):
    __tablename__ = "timeline_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_start: Mapped[str] = mapped_column(String(32), index=True)
    date_end: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    precision: Mapped[str] = mapped_column(String(32), default="day", index=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="asserted", index=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    relationship_entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True, index=True)
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True, index=True)
    claim_id: Mapped[str | None] = mapped_column(ForeignKey("claims.id"), nullable=True, index=True)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True, index=True)
    dataset: Mapped[str] = mapped_column(String(255), default="reporter", index=True)
    origin: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class ConnectorRun(Base):
    __tablename__ = "connector_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    query: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(64), default="running")
    result_count: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class ConnectorFinding(Base):
    __tablename__ = "connector_findings"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("connector_runs.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    provider_record_id: Mapped[str] = mapped_column(String(512), index=True)
    caption: Mapped[str] = mapped_column(String(512), index=True)
    schema: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    review_status: Mapped[str] = mapped_column(String(64), default="unreviewed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class ResolutionDecision(Base):
    __tablename__ = "resolution_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)  # positive/negative/unsure
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class CanonicalResolutionDecision(Base):
    __tablename__ = "canonical_resolution_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_a_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    entity_b_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)  # same/different/unsure
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class CanonicalEntityMergeAudit(Base):
    __tablename__ = "canonical_entity_merge_audits"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    source_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    target_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    resolution_decision_id: Mapped[str | None] = mapped_column(ForeignKey("canonical_resolution_decisions.id"), nullable=True, index=True)
    preview_digest: Mapped[str] = mapped_column(String(64), index=True)
    preview_json: Mapped[dict] = mapped_column(JSON, default=dict)
    moved_counts_json: Mapped[dict] = mapped_column(JSON, default=dict)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class PostMergeReconciliationDecision(Base):
    __tablename__ = "post_merge_reconciliation_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(32), index=True)  # statement/relationship
    record_a_id: Mapped[str] = mapped_column(String, index=True)
    record_b_id: Mapped[str] = mapped_column(String, index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)  # duplicate/keep_separate/unsure
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_record_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class PropertyConflictDecision(Base):
    __tablename__ = "property_conflict_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    prop: Mapped[str] = mapped_column(String(255), index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)  # preferred/superseded/temporal_change/both_valid/unresolved
    values_json: Mapped[list] = mapped_column(JSON, default=list)
    preferred_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    temporal_intervals_json: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class StatementAssessment(Base):
    __tablename__ = "statement_assessments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    prop: Mapped[str] = mapped_column(String(255), index=True)
    value: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="unresolved", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class StatementPromotion(Base):
    __tablename__ = "statement_promotions"
    __table_args__ = (UniqueConstraint("assessment_id", name="uq_statement_promotion_assessment"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("statement_assessments.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    statement_id: Mapped[str] = mapped_column(ForeignKey("statements.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    dataset: Mapped[str] = mapped_column(String(255), index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_value: Mapped[str] = mapped_column(Text)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class EnrichmentSession(Base):
    __tablename__ = "enrichment_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    status: Mapped[str] = mapped_column(String(64), default="running", index=True)
    providers: Mapped[list] = mapped_column(JSON, default=list)
    total_results: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class EnrichmentSessionRun(Base):
    __tablename__ = "enrichment_session_runs"
    __table_args__ = (UniqueConstraint("session_id", "provider", name="uq_enrichment_session_provider"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("enrichment_sessions.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("connector_runs.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(64), default="pending", index=True)
    result_count: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EnrichmentSessionFinding(Base):
    __tablename__ = "enrichment_session_findings"
    __table_args__ = (UniqueConstraint("session_id", "finding_id", name="uq_enrichment_session_finding"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("enrichment_sessions.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class CrossProviderDecision(Base):
    __tablename__ = "cross_provider_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("enrichment_sessions.id"), nullable=True, index=True)
    cluster_key: Mapped[str] = mapped_column(String(64), index=True)
    finding_ids: Mapped[list] = mapped_column(JSON, default=list)
    decision: Mapped[str] = mapped_column(String(32), index=True)  # positive/negative/unsure
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class RelationshipEdge(Base):
    __tablename__ = "relationship_edges"
    __table_args__ = (UniqueConstraint("relationship_entity_id", name="uq_relationship_edge_entity"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    relationship_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    schema: Mapped[str] = mapped_column(String(128), index=True)
    source_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    target_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    source_prop: Mapped[str] = mapped_column(String(128))
    target_prop: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class RelationshipEvidenceAttachment(Base):
    """First-class, non-destructive evidence attachment for a canonical relationship."""
    __tablename__ = "relationship_evidence_attachments"
    __table_args__ = (UniqueConstraint("relationship_edge_id", "evidence_id", name="uq_relationship_evidence_attachment"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    relationship_edge_id: Mapped[str] = mapped_column(ForeignKey("relationship_edges.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    attached_by: Mapped[str] = mapped_column(String(32), default="reporter", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class RelationshipEvidenceReviewEvent(Base):
    """Immutable reporter assessment of the evidence directly backing a relationship edge."""
    __tablename__ = "relationship_evidence_review_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    relationship_edge_id: Mapped[str] = mapped_column(ForeignKey("relationship_edges.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    stance: Mapped[str] = mapped_column(String(32), index=True)
    rationale: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ExternalRelationshipReview(Base):
    __tablename__ = "external_relationship_reviews"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    schema: Mapped[str] = mapped_column(String(128), index=True)
    source_entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    target_entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    decision: Mapped[str] = mapped_column(String(32), default="unresolved", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class ExternalRelationshipPromotion(Base):
    __tablename__ = "external_relationship_promotions"
    __table_args__ = (UniqueConstraint("review_id", name="uq_external_relationship_promotion_review"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("connector_findings.id"), index=True)
    review_id: Mapped[str] = mapped_column(ForeignKey("external_relationship_reviews.id"), index=True)
    relationship_edge_id: Mapped[str] = mapped_column(ForeignKey("relationship_edges.id"), index=True)
    relationship_entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    storage_path: Mapped[str] = mapped_column(Text)
    extraction_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class InvestigationCorpusBinding(Base):
    __tablename__ = "investigation_corpus_bindings"
    __table_args__ = (UniqueConstraint("investigation_id", "provider", name="uq_investigation_corpus_provider"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), default="openaleph", index=True)
    collection_id: Mapped[str] = mapped_column(String(512), index=True)
    foreign_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    collection_label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class DocumentCorpusSync(Base):
    __tablename__ = "document_corpus_syncs"
    __table_args__ = (UniqueConstraint("document_id", "provider", name="uq_document_corpus_provider"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), default="openaleph", index=True)
    collection_id: Mapped[str] = mapped_column(String(512), index=True)
    provider_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_json: Mapped[dict] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class OpenAlephOperationFailure(Base):
    """Server-side trace of a failed OpenAleph pipeline operation (STRUCT-0027).

    Distinct from DocumentCorpusSync.error (which tracks the document-sync
    operation's own current state) because this covers operations that have
    no single row to attach an error to -- collection setup can fail before
    any InvestigationCorpusBinding exists, and review-refresh/evidence-import/
    entity-import are one-shot actions, not a persistent per-document state
    machine. Rows here are purely diagnostic: nothing reads them to drive
    behavior, so recording a failure is always safe to add without changing
    any existing control flow.
    """
    __tablename__ = "openaleph_operation_failures"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    operation: Mapped[str] = mapped_column(String(64), index=True)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("document_id", "locator", name="uq_document_chunk_locator"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    locator: Mapped[str] = mapped_column(String(255), index=True)
    page_number: Mapped[int | None] = mapped_column(nullable=True, index=True)
    ordinal: Mapped[int] = mapped_column(default=0, index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ExtractionCandidate(Base):
    __tablename__ = "extraction_candidates"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"), nullable=True, index=True)
    candidate_type: Mapped[str] = mapped_column(String(32), index=True)  # entity/claim/evidence
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    review_status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    accepted_record_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class AIAnalysisCandidate(Base):
    """A not-yet-trusted output from a TAS-backed reasoning module.

    Mirrors ExtractionCandidate's review-gate pattern deliberately: an
    LLM call (case synthesis or hypothesis testing) never writes to
    canonical investigation records directly. It produces one of
    these, and only an explicit human review/promotion (reusing the
    same review_status/reviewer_note/accepted_* fields and endpoint
    conventions ExtractionCandidate already uses) lets it affect
    anything else.
    """

    __tablename__ = "ai_analysis_candidates"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    module: Mapped[str] = mapped_column(String(32), index=True)  # case_synthesis/hypothesis_test
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    # The exact citation IDs (from build_question_context()'s citations list) the payload
    # was checked against, preserved so a later reviewer can re-verify without re-running
    # retrieval, and so a stale/rotated context can never be silently assumed still valid.
    checked_citation_ids: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    review_status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    accepted_record_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AppUser(Base):
    __tablename__ = "app_users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    display_name: Mapped[str] = mapped_column(String(255), index=True)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    global_role: Mapped[str] = mapped_column(String(32), default="member", index=True)  # member/admin
    disabled: Mapped[bool] = mapped_column(default=False, index=True)
    token_created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    token_last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_rotated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class InvestigationMembership(Base):
    __tablename__ = "investigation_memberships"
    __table_args__ = (UniqueConstraint("user_id", "investigation_id", name="uq_investigation_membership_user_inv"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer", index=True)  # viewer/reporter/admin
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

class ClaimReviewEvent(Base):
    """Immutable reporter review history for a claim's truth-state assessment."""
    __tablename__ = "claim_review_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    from_status: Mapped[str] = mapped_column(String(64))
    to_status: Mapped[str] = mapped_column(String(64), index=True)
    from_confidence: Mapped[float] = mapped_column(Float)
    to_confidence: Mapped[float] = mapped_column(Float)
    rationale: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
