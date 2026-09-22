"""External connector runs and findings, and every review primitive that gates a finding before it can touch canonical records (resolution, assessment, promotion, enrichment sessions, cross-provider and external-relationship review).

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


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
