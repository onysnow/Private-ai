"""A web page captured from a link (ADR-0018, ADR-0019): the page as it was, when, by whom, with what, and the hash of
every file kept. The page's text becomes an ordinary Document; this row keeps the evidentiary files and their custody.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Capture(Base):
    """One visit to one address. `status` is queued / capturing / finished; `outcome`, once finished, is "saved" (the
    page was kept: the suite's OBTAINED), "not_seen" (a login wall or paywall answered, so the page was never shown) or
    "link_only" (the page could not be kept; `reason` says why); both failures are the suite's UNABLE_TO_OBTAIN.
    `files` lists what was kept, [{name, role, bytes, sha256}], stored under
    <document storage>/<investigation>/captures/<id>/ (app/services/web_capture.py). `displayed` is the title, author
    and published date as the page displayed them, never verified."""

    __tablename__ = "captures"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A link-only capture's reason in one word (dead_link, blocked, timed_out, tool_error): read from the reply, and
    # changed by a person when they know better; `reason_kind_by` is that person.
    reason_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reason_kind_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    collector: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tool: Mapped[str | None] = mapped_column(String(255), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # This computer's UTC clock when the screenshot was taken: the time its band shows.
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    files: Mapped[list] = mapped_column(JSON, default=list)
    displayed: Mapped[dict] = mapped_column(JSON, default=dict)
    # The capture lane: [{key, label, state, seconds}] (app/services/web_capture.py STAGES).
    stages: Mapped[list] = mapped_column(JSON, default=list)
    # The request for the page itself and the server's answer, a few headers each, as served and not verified.
    exchange: Mapped[dict] = mapped_column(JSON, default=dict)
    # True when the site's robots.txt asks robots not to fetch this page; a one-off capture notes it and goes ahead.
    robots_disallowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True, index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    case_record_id: Mapped[str | None] = mapped_column(ForeignKey("case_records.id"), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # The video or audio on the page, when the reporter collected it (app/services/media_links.py): status (collecting,
    # collected, failed with a reason), platform, its id there, the account, title, upload date, duration, the route it
    # took and the tool; the recording it became is media_document_id.
    media: Mapped[dict] = mapped_column(JSON, default=dict)
    media_document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
