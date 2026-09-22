"""Review-gated output of the TAS reasoning layer.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


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
    # What the reporter asked (question, working_theory, retrieval options). A reviewer
    # can't judge a synthesis without the question it answers, and payload is model
    # output only, so the request is kept beside it. Nullable: rows predate this column.
    request: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
