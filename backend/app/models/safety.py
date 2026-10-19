"""Safety & data (mockup KEEP-safety-and-data, research Keep §7, §8, §13, §14).

- outbound_log: one row per request that left this computer for an outside service, with the value sent word for
  word (research §14 "an append only table ... the exact value sent"). Rows are only ever added.
- service_modes: per case and per outside service, Off / Ask first / Automatic (research §7, "the planned switch").
- safety_answers: the reporter's answers to the "Only you can say" questions (research §13): private, not in backups.
- backup_events: each backup made from Safety & data, so "Last backup 3 days ago" is a stored fact (research §8 "Needs"),
  and whether it was protected with a passphrase (ADR-0015).
- kept_stray_files: stray files (under document storage, no document points to them) the reporter chose to Keep, so
  Housekeeping does not offer them again (research Keep §12). Per computer, not per case: storage is shared.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class OutboundRequest(Base):
    __tablename__ = "outbound_log"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    # The outside service: a connector provider (aleph, opensanctions, firecrawl) or outside_ai.
    service: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # lookup / ai
    value_sent: Mapped[str] = mapped_column(Text)  # word for word
    value_kind: Mapped[str] = mapped_column(String(64))  # search text / entity / case passages ...
    reason: Mapped[str] = mapped_column(String(255))
    started_by: Mapped[str] = mapped_column(String(16))  # person / automatic
    actor_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    documents_sent: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)


class ServiceMode(Base):
    __tablename__ = "service_modes"
    __table_args__ = (UniqueConstraint("investigation_id", "service", name="uq_service_mode_investigation_service"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    service: Mapped[str] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(16))  # OFF / ASK / AUTOMATIC
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class SafetyAnswer(Base):
    __tablename__ = "safety_answers"
    __table_args__ = (UniqueConstraint("investigation_id", "question", name="uq_safety_answer_investigation_question"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    question: Mapped[str] = mapped_column(String(32))
    answer: Mapped[str] = mapped_column(String(16))  # YES / NO / NOT_SURE
    answered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class BackupEvent(Base):
    __tablename__ = "backup_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    made_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    record_total: Mapped[int] = mapped_column(Integer, default=0)
    document_files: Mapped[int] = mapped_column(Integer, default=0)
    encrypted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class KeptStrayFile(Base):
    __tablename__ = "kept_stray_files"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    # The path relative to the document storage folder, as Housekeeping lists it.
    relative_path: Mapped[str] = mapped_column(String(1024), unique=True)
    kept_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
