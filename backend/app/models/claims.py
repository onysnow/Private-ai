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
    # The suite's Claim record (app/ai/suite_vocab.py): which of the eight kinds of
    # statement it is, the likelihood word carried across systems (never a bare
    # number), why it is that sure, why the evidence bears on it, what it assumes,
    # its limits, and Module 02's verdict with wording that does not exceed the evidence.
    classification: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence_term: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String(8), nullable=True)
    confidence_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    warrant: Mapped[str | None] = mapped_column(Text, nullable=True)
    assumptions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    limitations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    verification_verdict: Mapped[str | None] = mapped_column(String(48), nullable=True)
    corrected_wording: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ClaimEvidenceLink(Base):
    __tablename__ = "claim_evidence_links"
    __table_args__ = (UniqueConstraint("claim_id", "evidence_id", "stance", name="uq_claim_evidence_stance"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    stance: Mapped[str] = mapped_column(String(32), index=True)  # supports/contradicts/context
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who linked it, as signed in when they did (app/db/decided_by.py); None before this was kept.
    decided_by_id: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    # Superseded (TAS §7.3's document state, read for one link): a newer record replaces what this one says for the
    # claim (a judgment replaces an indictment's figure; a corrected filing). The link stays, with its stance, and is
    # shown struck; it no longer counts for or against the claim. When it was marked, the record that replaces it (none
    # when that record is not in the case), the reason, and who marked it (app/db/decided_by.py). Undo clears all five.
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    superseded_by_evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True)
    superseded_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    superseded_decided_by_id: Mapped[str | None] = mapped_column(String, nullable=True)
    superseded_decided_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @property
    def counts_toward_claim(self) -> bool:
        """Whether the link counts toward the claim: every link does until it is marked superseded."""
        return self.superseded_at is None


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
    # Who reviewed (the suite's reviewer_type): a person, legal counsel, an AI-assisted
    # step or the app itself. A review from the API is a person's unless it says otherwise.
    reviewer_type: Mapped[str] = mapped_column(String(16), default="HUMAN")
    # Which person, as signed in when they reviewed (app/db/decided_by.py); None before this was kept.
    decided_by_id: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Suite fields a review changed: {field: [from, to]}.
    suite_changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
