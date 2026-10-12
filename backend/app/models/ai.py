"""Review-gated output of the TAS reasoning layer.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import Boolean, Integer, UniqueConstraint, String, Text, DateTime, ForeignKey, JSON, Float
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
    # Exactly what the model saw: system prompt, user prompt (the retrieval packet
    # included) and the provider response metadata. Without it a reviewer cannot
    # reconstruct why a synthesis said what it said. Nullable: rows predate it.
    trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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


class AIRunEvent(Base):
    """One step of an AI run, as it happened (mockup AI_1 "Watch the run", ADR-0012). Append-only: a row is
    written once and never changed. `n` orders a run's events from 1; `parent` is the `n` of the event this one
    follows from, so any thought can be traced from the question to the answer. `status` is the node colour the app
    works out from `verdict` (never chosen by the model); `self_reported` is true when the event came from model
    output rather than an app check (the suite's FABRICATION_CONTROLS: self-reports stay alleged)."""

    __tablename__ = "ai_run_events"
    __table_args__ = (UniqueConstraint("run_id", "n", name="uq_ai_run_events_run_n"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    run_id: Mapped[str] = mapped_column(String(64), index=True)  # the BackgroundJob id the run was queued as
    n: Mapped[int] = mapped_column(Integer)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    kind: Mapped[str] = mapped_column(String(16))  # TURN, SETTING, ROUTE, LOAD, CHECK, RULE, FLAG, BLOCK, WRITE
    node: Mapped[str] = mapped_column(String(64))  # router, model, gate:citation, tas/08, tas/class, review, ...
    system: Mapped[str] = mapped_column(String(16))  # app, tas, las, ..., umbrella
    rule: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # good, partial, bad, neutral
    verdict: Mapped[str | None] = mapped_column(String(64), nullable=True)
    text: Mapped[str] = mapped_column(Text, default="")
    refs: Mapped[list] = mapped_column(JSON, default=list)
    parent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    self_reported: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
