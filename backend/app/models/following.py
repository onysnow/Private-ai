"""Following (ADR-0021): sources the app watches for a case, what each poll found, and every version of a watched page.
The app watches; a person captures (EGS rule 8): an item here is a link to a possible capture, never a kept page."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Monitor(Base):
    """One address watched on a schedule. `kind` is feed (RSS or Atom), sitemap, page, podcast or youtube (a channel's
    feed). `route` is direct or tor (a Tor the reporter runs). `health` is waiting (never polled), ok, moved (the
    address now redirects), broken (an error, with `health_reason`), blocked (the site's robots.txt asks robots not to
    fetch it, or it answered 401/403) or paused. `etag` and `last_modified` make the next poll a conditional GET."""

    __tablename__ = "monitors"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    interval_minutes: Mapped[int] = mapped_column(Integer, default=30)
    route: Mapped[str] = mapped_column(String(8), default="direct")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    health: Mapped[str] = mapped_column(String(16), default="waiting")
    health_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    etag: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_modified: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Where the address now points, when it answered with a redirect that was followed (the reporter decides to move it).
    moved_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    robots_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # The last poll in words and numbers: {items_seen, items_new, bytes, seconds, not_modified}.
    last_poll: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class MonitorItem(Base):
    """Something a monitor found that nobody has captured: a feed entry, a sitemap address, a page whose text changed.
    `state` is new, captured, skipped or recorded (a person recorded that a captured page was removed). `flags` say why it is at risk: edited (its entry changed after first seen),
    changed (a page's text changed since the last version), gone (a captured address now answers 404 or 410)."""

    __tablename__ = "monitor_items"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id"), index=True)
    key: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    # What the site said about the entry, as displayed and not verified: published date, summary, author, enclosure.
    displayed: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    edits: Mapped[int] = mapped_column(Integer, default=0)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    state: Mapped[str] = mapped_column(String(12), default="new", index=True)
    decided_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    capture_id: Mapped[str | None] = mapped_column(ForeignKey("captures.id"), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    # The same story seen earlier, from this or another source (a wire copy, a syndicated text): this item then copies
    # it, waits outside the queue and is not offered for capture. `similarity` is the share of their wording in common.
    copy_of: Mapped[str | None] = mapped_column(ForeignKey("monitor_items.id"), nullable=True, index=True)
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    # When a captured item's address was last asked whether it is still there (once a day; a 404 or 410 makes a "gone" item).
    rechecked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class MonitorVersion(Base):
    """One version of a watched page's main text, kept every time it changes. `text` is what the app's own reader kept
    of the page (not the page); the page itself is kept only by a capture. `lines_changed` counts lines added and
    removed against the version before."""

    __tablename__ = "monitor_versions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    text_sha256: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    lines_added: Mapped[int] = mapped_column(Integer, default=0)
    lines_removed: Mapped[int] = mapped_column(Integer, default=0)
    seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    capture_id: Mapped[str | None] = mapped_column(ForeignKey("captures.id"), nullable=True)
