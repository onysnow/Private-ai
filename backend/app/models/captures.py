"""A web page captured from a link (ADR-0016, mockup INTAKE_3).

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class WebCapture(Base):
    """One capture of one web page: what was asked for, what came back, the files kept and their fingerprints.
    Written once; a re-check that finds the page changed is a new row that names the one it follows
    (`supersedes_id`), so the first capture is never altered. `files` lists each kept file as
    {name, role, size, sha256, path} (path as a Document's storage_path is kept); `steps` is the capture lane as it
    ran. `outcome` is saved | link_only (nothing came back: the link is kept, not a copy) | not_seen (a login or
    permission wall; nothing behind it was seen) | failed. `checks` is the re-check history of a saved capture:
    [{at, state}] with state same | changed | gone | unreachable."""

    __tablename__ = "web_captures"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True, index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    supersedes_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str] = mapped_column(String(16), index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    collector: Mapped[dict] = mapped_column(JSON, default=dict)
    request: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    files: Mapped[list] = mapped_column(JSON, default=list)
    page_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    text_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    displayed: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    checks: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
