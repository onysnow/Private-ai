"""What left this computer and when a backup was made (mockup KEEP-safety-and-data, ADR-0015).

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class OutboundRequest(Base):
    """One request that carried case data to an outside service, as it was sent (ADR-0015). Append-only: written
    once, never changed. `value_sent` is the exact text of the search, or the entity's details, that went out;
    for an AI call it is the question and a count of what went with it, and the exact text stays in that run's
    record (`run_id`). `local` is true when the destination is this computer (a local model, a local OpenAleph):
    those are kept so the log is complete, but they are not counted as leaving."""

    __tablename__ = "outbound_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    # Null for what is not about one case: a mail or push notice, a source-update check, a public download.
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    # lookup | ai | mail | push | key_check | source_check | download
    kind: Mapped[str] = mapped_column(String(32), default="lookup", index=True)
    service: Mapped[str] = mapped_column(String(64), index=True)  # opensanctions | aleph | firecrawl | ai
    destination: Mapped[str] = mapped_column(String(255))  # the host, or "<provider> <model>" for an AI call
    local: Mapped[bool] = mapped_column(Boolean, default=False)
    value_sent: Mapped[str] = mapped_column(Text)
    value_kind: Mapped[str] = mapped_column(String(64), default="")  # "search words", "name and details", "question and case records"
    reason: Mapped[str] = mapped_column(String(64), default="")  # "lookup" | "enrich" | "matched all services" | "AI run"
    actor: Mapped[str] = mapped_column(String(255), default="you clicked")  # "you clicked" | "automatic check" | a person
    status: Mapped[str] = mapped_column(String(16), default="sent")  # sent | failed | not_sent
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # the connector run or AI run this belongs to
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class BackupEvent(Base):
    """A backup file made from this case (ADR-0015): when, how big, and its SHA-256, so the case can say "last backup
    3 days ago". The file itself is not kept here; it goes to the person who asked for it. Not part of a backup."""

    __tablename__ = "backup_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    with_documents: Mapped[bool] = mapped_column(Boolean, default=True)
    record_total: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
