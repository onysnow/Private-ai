"""Canonical FollowTheMoney entities, their statements, and the identity/merge/conflict review decisions made about them.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


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
