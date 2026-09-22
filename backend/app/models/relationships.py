"""Relationship edges between canonical entities and their evidence attachments/reviews.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


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
