"""Red Flags: one row per occurrence of a pattern rule in an investigation
(docs/discovery/system-design.md §3.3; app/patterns/).

A flag keeps its identity across recomputes through ``fingerprint`` (the
rule and the sorted parties and links it saw), so a dismissed flag stays
dismissed while it keeps firing on the same records, and a flag that stops
firing is kept with ``gone_at`` set.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class PatternFlag(Base):
    __tablename__ = "pattern_flags"
    __table_args__ = (UniqueConstraint("investigation_id", "fingerprint", name="uq_pattern_flag_fingerprint"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    indicator_id: Mapped[str] = mapped_column(String(16), index=True)
    rule_version: Mapped[int] = mapped_column(Integer, default=1)
    fingerprint: Mapped[str] = mapped_column(String(64))
    level: Mapped[str] = mapped_column(String(16))  # faint | strong | textbook
    parties: Mapped[list] = mapped_column(JSON, default=list)
    links: Mapped[list] = mapped_column(JSON, default=list)
    facts: Mapped[dict] = mapped_column(JSON, default=dict)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    weight_parts: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | dismissed | made_lead
    dismissed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    gone_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CheckItem(Base):
    """Something a person checks ("To check", docs/discovery/detection-design.md):
    a passage in a document that may show an indicator, or a checklist item
    (what a Faint flag's records cannot show, or an indicator only a person can
    confirm). Kept across recomputes by ``fingerprint`` like a flag, so a
    decision stays with the item."""

    __tablename__ = "check_items"
    __table_args__ = (UniqueConstraint("investigation_id", "fingerprint", name="uq_check_item_fingerprint"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    indicator_id: Mapped[str] = mapped_column(String(16), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # passage | checklist
    fingerprint: Mapped[str] = mapped_column(String(64))
    question: Mapped[str] = mapped_column(Text)
    parties: Mapped[list] = mapped_column(JSON, default=list)
    flag_id: Mapped[str | None] = mapped_column(ForeignKey("pattern_flags.id"), nullable=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    locator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | shows | does_not | unclear
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    gone_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
