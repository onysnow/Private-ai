"""Claims, their evidence links, and the claim review trail.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import JSON, String, Text, DateTime, ForeignKey, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(64), default="lead")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    # The confidence grade on the IPCC AR5 grid (ADR-0005, line 5): how much
    # evidence there is (limited / medium / robust) and how far it agrees
    # (low / medium / high), each the reporter's judgement, set in a review.
    # None until a review grades the claim.
    evidence_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    agreement_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ClaimEvidenceLink(Base):
    __tablename__ = "claim_evidence_links"
    __table_args__ = (UniqueConstraint("claim_id", "evidence_id", "stance", name="uq_claim_evidence_stance"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    stance: Mapped[str] = mapped_column(String(32), index=True)  # supports/contradicts/context
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    from_evidence_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    to_evidence_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    from_agreement_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    to_agreement_grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    rationale: Mapped[str] = mapped_column(Text)
    # A review to Supported/Confirmed with a Done rule not met (app/services/claim_done.py):
    # the reporter's written reason, and which rules were not met at the time.
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    unmet_rules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
