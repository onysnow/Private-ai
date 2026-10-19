"""What the app does on its own and what leaves the computer (docs/project-notes/PLATFORM_NEEDS_PLAN.md): every
request sent outside, saved questions an AI run can be repeated from, notifications already delivered outside the
app, and the phones a reporter registered for push.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class OutboundRequest(Base):
    """One request that left this computer: to an outside source, a remote AI model, a mail or push service, or a
    public download. ``sent`` says in words what went (the search words, "the party's name and details", "the kind
    of alert only"), never more than was sent."""
    __tablename__ = "outbound_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # lookup | ai | mail | push | key_check | source_check | download
    service: Mapped[str] = mapped_column(String(64))           # opensanctions, anthropic, mail, ntfy, …
    destination: Mapped[str] = mapped_column(String(255))      # the host it went to
    sent: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(String(16), default="sent")  # sent | refused | failed
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)


class SavedQuestion(Base):
    """A question an AI run can be asked again: by a person (Run now), or by the app when new material arrives in a
    case whose research mode is Without approval."""
    __tablename__ = "saved_questions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    module: Mapped[str] = mapped_column(String(64))
    question: Mapped[str] = mapped_column(Text)
    working_theory: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    last_run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The import batch that last started it, so one batch never starts it twice.
    last_batch_id: Mapped[str | None] = mapped_column(String, nullable=True)


class NotificationDelivery(Base):
    """A notification sent outside the app (email, phone), so the same row is never sent twice on one channel."""
    __tablename__ = "notification_deliveries"
    __table_args__ = (UniqueConstraint("person", "channel", "row_key", name="uq_notification_delivery"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    person: Mapped[str] = mapped_column(String(255), index=True)
    channel: Mapped[str] = mapped_column(String(16))  # email | phone | webpush
    row_key: Mapped[str] = mapped_column(String(255))
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    outcome: Mapped[str] = mapped_column(String(16), default="sent")


class PushSubscription(Base):
    """A browser or phone a person registered for Web Push: its endpoint at the browser maker's push service and the
    keys its messages are encrypted with (RFC 8291)."""
    __tablename__ = "push_subscriptions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    person: Mapped[str] = mapped_column(String(255), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    keys: Mapped[dict] = mapped_column(JSON, default=dict)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    failures: Mapped[int] = mapped_column(Integer, default=0)
