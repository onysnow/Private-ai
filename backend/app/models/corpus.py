"""What the Workbench has written to its OpenAleph corpus (ADR-0006, Wave B).

Reporter-confirmed entities and relationships are copied into the
investigation's OpenAleph collection so OpenAleph's search, cross-referencing
and diagrams see them. These tables are the Workbench's side of that copy:

- ``OpenAlephEntityLink`` maps one Workbench record to the OpenAleph entity
  holding it, with a hash of what was last sent, so an unchanged record is
  not sent again and a record that is gone can be removed.
- ``CorpusSyncState`` is the per-investigation progress the screen's
  "Corpus sync" line shows: the last push and the last cross-referencing run.

Both are per-deployment state, not investigation content: they describe one
OpenAleph installation, so backups do not carry them (a restored
investigation is simply sent again; OpenAleph overwrites entities by id).
Part of the STRUCT-0024 model split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class OpenAlephEntityLink(Base):
    """One Workbench record held as an entity in OpenAleph.

    ``record_id`` is the Workbench ``entities`` row that was sent: a canonical
    entity (``record_type`` "entity") or the FollowTheMoney relationship
    entity behind a relationship edge (``record_type`` "relationship"). The
    same id, unsigned, is the entity id the Workbench sends; OpenAleph signs
    it with the collection's namespace (followthemoney/namespace.py), and
    ``openaleph_entity_id`` is that signed id.
    """
    __tablename__ = "openaleph_entity_links"
    __table_args__ = (UniqueConstraint("record_type", "record_id", name="uq_openaleph_entity_link_record"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(32), index=True)  # entity | relationship
    record_id: Mapped[str] = mapped_column(String, index=True)
    collection_id: Mapped[str] = mapped_column(String(512), index=True)
    openaleph_entity_id: Mapped[str] = mapped_column(String(512), index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    pushed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class CorpusSyncState(Base):
    """How one investigation's corpus copy stands: the last push and the last
    cross-referencing run, in the words and numbers the screen shows."""
    __tablename__ = "openaleph_corpus_sync_states"
    __table_args__ = (UniqueConstraint("investigation_id", name="uq_openaleph_corpus_sync_state_investigation"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    # never | running | succeeded | waiting | failed
    push_status: Mapped[str] = mapped_column(String(32), default="never")
    push_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    push_finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    push_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    push_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # sent, removed, unchanged, removals_waiting, skipped (see corpus_push.PushResult)
    push_counts: Mapped[dict] = mapped_column(JSON, default=dict)
    # Failed corpus jobs in a row; sets the wait before the next try.
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    # When a push last changed what the collection holds. Cross-referencing
    # is out of date while this is later than xref_finished_at.
    changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # never | waiting | running | succeeded | failed
    xref_status: Mapped[str] = mapped_column(String(32), default="never")
    xref_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    xref_finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    xref_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    xref_counts: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
