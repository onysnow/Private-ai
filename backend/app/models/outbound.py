"""What left this computer, word for word (ADR-0015, mockup KNOWLEDGE_KEEP_2's outbound log).

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class OutboundRequest(Base):
    """One request that carried case data to a service, written by the code that sent it (app/services/outbound.py).
    Append-only: a row is written before the request goes, and only `outcome` is ever changed after (to "failed"). `service` is the connector's name ("opensanctions") or
    "ai:<provider>"; `kind` says what sort of thing `value` is (a search text, a name, case text); `value` is exactly what
    was sent, or for a model call a plain description of the packet (the full text stays on the run's trace);
    `actor` is "you" (a person pressed the button) or "automatic" (the app did it); `leaves_computer` is false for a
    model that runs here, so the totals never count it; `outcome` is sent / failed (the request went and an error
    came back) / blocked (the app stopped it before it left)."""

    __tablename__ = "outbound_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    # Null for what is not about one case: a mail or push notice, a key or source-update check, a public download.
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    service: Mapped[str] = mapped_column(String(128), index=True)
    kind: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(16), default="you")
    leaves_computer: Mapped[bool] = mapped_column(Boolean, default=True)
    outcome: Mapped[str] = mapped_column(String(16), default="sent")
    # How many of the case's documents travelled with it (the files themselves, not words from them).
    documents: Mapped[int] = mapped_column(Integer, default=0)
    # Where it came from, so the log can point back: {"connector_run_id": ..., "run_id": ..., "entity_id": ...}.
    source: Mapped[dict | None] = mapped_column(JSON, nullable=True)
