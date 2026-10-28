"""When a backup was made (ADR-0015). What left this computer is app/models/outbound.py.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


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
