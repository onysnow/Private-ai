"""Settings kept on the server (Settings › Notifications, Outside lookups, AI and research), and the facts a
person asked to be told about (watches on a claim or a Red Flag).

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Preference(Base):
    """One setting: for a person (``scope="person"``, ``subject`` = who asked, the request's actor id), for the
    whole server (``scope="server"``, ``subject`` = ""), or for one case (``scope="case"``, ``subject`` = its id).
    ``reason`` is the one line a case override or a changed default is saved with."""
    __tablename__ = "app_preferences"
    __table_args__ = (UniqueConstraint("scope", "subject", "key", name="uq_app_preference"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    scope: Mapped[str] = mapped_column(String(16), index=True)
    subject: Mapped[str] = mapped_column(String(255), index=True, default="")
    key: Mapped[str] = mapped_column(String(64))
    # Set on a case's own settings so deleting the case takes them with it (app/services/lifecycle.py walks foreign keys).
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class FactWatch(Base):
    """"Tell me if this changes": a claim's status or a Red Flag's level, watched by one person. ``baseline`` is the
    value when it was last seen; the inbox shows the watch while the current value differs."""
    __tablename__ = "fact_watches"
    __table_args__ = (UniqueConstraint("owner", "record_type", "record_id", name="uq_fact_watch"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    owner: Mapped[str] = mapped_column(String(255), index=True)
    record_type: Mapped[str] = mapped_column(String(16))  # claim | red_flag
    record_id: Mapped[str] = mapped_column(String, index=True)
    baseline: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
