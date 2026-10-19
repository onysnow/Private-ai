"""Reporter-authored long-form write-ups (the actual story/brief a reporter
drafts inside an investigation), distinct from `Document` (an uploaded file
that gets extracted into chunks/candidates -- see app/models/documents.py).

A Writeup's `content_json` is a TipTap/ProseMirror document. Citation nodes
embedded in it (type "citation", attrs {recordType, recordId}) are the same
record_type/record_id shape used everywhere else in this app (search hits,
AI reasoning citations, provenance trace) -- see
app/services/writeups.py:extract_cited_refs for how they're pulled back out.
`content_text` and `cited_record_refs` are denormalized caches, recomputed
on every save, so list views and "cited in N write-ups" lookups never have
to walk the ProseMirror tree themselves.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid

WRITEUP_STATUSES = {"draft", "final"}


class Writeup(Base):
    __tablename__ = "writeups"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    # TipTap/ProseMirror JSON document. {"type":"doc","content":[...]} shape;
    # stored as JSON rather than a markdown string so inline citation nodes
    # keep their exact record_type/record_id attrs instead of being
    # flattened into unparseable prose.
    content_json: Mapped[dict] = mapped_column(JSON, default=dict)
    # Plain-text rendering of content_json, recomputed on every save --
    # keeps investigation_search and the export flow from needing their own
    # ProseMirror walker.
    content_text: Mapped[str] = mapped_column(Text, default="")
    # [{"record_type": "...", "record_id": "..."}, ...] recomputed on every
    # save by walking content_json for citation nodes. Denormalized so
    # "what does this write-up cite" and (later) "which write-ups cite this
    # evidence" never require re-parsing content_json.
    cited_record_refs: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    # Set when a write-up is created by promoting a reviewed AIAnalysisCandidate
    # (see app/services/presentation.py) -- None for a reporter-started write-up.
    source_ai_candidate_id: Mapped[str | None] = mapped_column(ForeignKey("ai_analysis_candidates.id"), nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


WRITEUP_VERSION_KINDS = {"named", "auto", "before_restore"}


class WriteupVersion(Base):
    """A snapshot of a write-up's text (research Act §8, mockup ACT_2 'version "before legal read"'): named by a
    person, taken on its own while they write (at most one every few minutes), or taken just before an older
    version is restored, so a restore can itself be undone. Read-only once taken."""
    __tablename__ = "writeup_versions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    writeup_id: Mapped[str] = mapped_column(ForeignKey("writeups.id"), index=True)
    # A person's name for it ("Before legal read"); None for an automatic one.
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="auto")
    content_json: Mapped[dict] = mapped_column(JSON, default=dict)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
