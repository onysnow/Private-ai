"""Following (ADR-0022, source intake Phase 3): the sources a case watches, what they turn up, and what changed.

The app watches; a person captures. A monitor never keeps anything by itself: it puts what it finds in a queue, and a
person captures it (through the ordinary web capture, ADR-0018) or skips it. Capturing several at once needs a reason,
kept on each item. No account logins anywhere: open feeds, sitemaps, single pages, podcasts and open-protocol public
accounts only; a closed platform is a row with no monitor (link capture or files the reporter supplies).
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Monitor(Base):
    """One source a case follows. `kind`: feed (RSS or Atom, a YouTube channel feed too), sitemap, page (one page's main
    text), podcast (a feed with audio), account (an open-protocol public account: Bluesky or Mastodon) or closed (a
    closed platform: no monitor, link capture only). `every_minutes` is 15, 30, 60 or 1440; `route` is "direct" or
    "tor" (a Tor the reporter runs on this computer). `health` is "works" (the last check read the source), "broken"
    (`health_detail` says why; a moved address waits in `moved_to` until a person accepts it, and nothing is asked
    meanwhile), "paused" or "unchecked". `checks` are the last check's lines for the screen: [{state, text}].
    `etag` and `last_modified` make each check a conditional GET."""

    __tablename__ = "monitors"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    platform: Mapped[str | None] = mapped_column(String(32), nullable=True)
    url: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(500))
    every_minutes: Mapped[int] = mapped_column(Integer, default=30)
    route: Mapped[str] = mapped_column(String(16), default="direct")
    health: Mapped[str] = mapped_column(String(16), default="unchecked")
    health_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    moved_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    checks: Mapped[list] = mapped_column(JSON, default=list)
    etag: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(100), nullable=True)
    robots_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # How many of the account's latest posts it deleted, out of how many seen (an account monitor's risk signal).
    deleted_recent: Mapped[int] = mapped_column(Integer, default=0)
    window: Mapped[int] = mapped_column(Integer, default=0)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class MonitorItem(Base):
    """One thing a monitor turned up: a feed entry, a sitemap address, an account's post, a podcast episode, or a new
    version of a followed page. `key` is how the source names it (guid, id or address). `state`: waiting (in the
    queue), capturing, captured, skipped, copy (a later copy of a wire story: only the earliest is offered), gone (a
    captured item whose address now answers 404 or 410: "Record removal") or removal_recorded. `versions` holds each
    version of its text as first seen and as edited: [{at, sha256, title}]. `cluster` names its wire-copy group (the id
    of the group's earliest item) and `similarity` how close it is to that one. `decision` keeps who captured or
    skipped it, when, and a bulk capture's reason."""

    __tablename__ = "monitor_items"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id"), index=True)
    key: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    # Set when the source stopped listing it while still listing older items: deleted at the source.
    vanished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    versions: Mapped[list] = mapped_column(JSON, default=list)
    # What else the source says about it: audio file and its size, a transcript the publisher offers, the page version.
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(24), default="waiting", index=True)
    cluster: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    capture_id: Mapped[str | None] = mapped_column(String, nullable=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    link_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    gone_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decision: Mapped[dict] = mapped_column(JSON, default=dict)


class PageVersion(Base):
    """One version of a followed page's main text. A check that finds the same text keeps no new version, and says
    whether only the layout changed. `lines_changed` and `diff` compare it with the version before; `captured` says
    whether a person captured this version (and `capture_id` which capture)."""

    __tablename__ = "page_versions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    text_sha256: Mapped[str] = mapped_column(String(64))
    layout_sha256: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    lines_changed: Mapped[int] = mapped_column(Integer, default=0)
    diff: Mapped[list] = mapped_column(JSON, default=list)
    # Checks since this version that saw a different layout around the same text: "Layout changed, text the same".
    layout_changes: Mapped[list] = mapped_column(JSON, default=list)
    captured: Mapped[bool] = mapped_column(Boolean, default=False)
    capture_id: Mapped[str | None] = mapped_column(String, nullable=True)
