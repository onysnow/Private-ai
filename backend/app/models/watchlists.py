"""Watched names and what they turned up (ADR-0006, Wave C: "a watchlist of
names re-checked as documents arrive; new hits become leads").

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class WatchlistEntry(Base):
    """A name (or a search) the reporter wants to know about whenever it
    appears in a newly read document of the investigation."""
    __tablename__ = "watchlist_entries"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    query: Mapped[str] = mapped_column(String(512))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    # The last check: when, and whether OpenAleph could be asked.
    checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    check_detail: Mapped[str | None] = mapped_column(Text, nullable=True)


class WatchlistHit(Base):
    """A document in which a watched name was found, once per document. The
    reporter makes it a lead or dismisses it; ``status`` says which."""
    __tablename__ = "watchlist_hits"
    __table_args__ = (UniqueConstraint("entry_id", "document_key", name="uq_watchlist_hit_entry_document"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entry_id: Mapped[str] = mapped_column(ForeignKey("watchlist_entries.id"), index=True)
    # OpenAleph's id of the document (a matching page stands for its document).
    document_key: Mapped[str] = mapped_column(String(512))
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    highlights: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="new", index=True)   # new | lead | dismissed
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    found_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
