"""Sources and the exact evidence quoted from them.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(64), default="web")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    # The Authority System Suite's source tier, A (strongest) to F, set by a person
    # (app/ai/suite_vocab.py); None until assessed. Read by the Done rules.
    source_tier: Mapped[str | None] = mapped_column(String(1), nullable=True)
    issuer_or_author: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    locator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A picture as evidence (before-and-after images): the uploaded picture
    # this record is, and the day, month or year it was taken, as its source
    # states it (YYYY, YYYY-MM or YYYY-MM-DD). The quote is its caption.
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    captured_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # The suite's Evidence record (TAS OUTPUT_SCHEMAS): who issued it, whether it is
    # authentic (kept apart from whether it is true), the record it restates (a copy
    # counts as one source with its original), the dates the Standard keeps apart
    # (made, the event, published, retrieved: YYYY, YYYY-MM or YYYY-MM-DD) and its limits.
    issuer_or_author: Mapped[str | None] = mapped_column(String(512), nullable=True)
    authenticity_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    restates_evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True, index=True)
    created_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    event_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    published_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    retrieved_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    limitations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Where the quote stands in its document's text, kept so it can be found again (ADR-0015,
    # app/services/anchor_text.py): passage, offsets, 32 characters either side, match, lines.
    anchor: Mapped[dict | None] = mapped_column(JSON, nullable=True)
