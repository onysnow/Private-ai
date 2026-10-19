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

OpenAleph's cross-referencing of the collection comes back as proposals:

- ``CrossReferenceProposal``: one confirmed entity of ours and one entity
  OpenAleph matched it with, with OpenAleph's score and what agreed.
- ``CrossReferenceDecision``: a reporter's decision on one, kept as history
  (the latest stands), and whether it reached OpenAleph as a judgement.

These are review history, so backups carry them (app/services/exports.py).
Part of the STRUCT-0024 model split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
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


class OpenAlephEntitySetLink(Base):
    """A diagram, timeline or list the Workbench made in OpenAleph from the
    investigation's records (ADR-0006, Wave C; app/services/openaleph_entitysets.py).

    ``item_ids`` are the signed entity ids the Workbench put in the set, so
    sending it again adds what is new and takes out only what the Workbench
    itself added and no longer belongs; anything a reporter added in
    OpenAleph stays. Per-deployment state like ``OpenAlephEntityLink``: not
    carried by backups.
    """
    __tablename__ = "openaleph_entity_sets"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)   # diagram | timeline | list
    label: Mapped[str] = mapped_column(String(512))
    collection_id: Mapped[str] = mapped_column(String(512))
    openaleph_entityset_id: Mapped[str] = mapped_column(String(512), index=True)
    item_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class CrossReferenceProposal(Base):
    """OpenAleph's cross-referencing says a confirmed entity of ours may be the
    same as another entity. A proposal until a reporter decides; deciding
    never changes the confirmed record.

    ``match_kind`` "corpus": the other entity is not one of the
    investigation's confirmed records (a cross-reference to review).
    "duplicate": it is one -- ``other_entity_id`` -- and the pair joins the
    dossier's duplicate candidates instead; one row per pair, ``entity_id``
    being the lower of the two ids.

    ``match_investigation_id`` names the Workbench investigation whose
    collection holds the match, when there is one, so the match is shown only
    to someone who may read that investigation. It has no foreign key: the
    proposal belongs to this investigation, not to that one.
    """
    __tablename__ = "cross_reference_proposals"
    __table_args__ = (UniqueConstraint("entity_id", "match_openaleph_id", name="uq_cross_reference_pair"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    openaleph_entity_id: Mapped[str] = mapped_column(String(512))
    match_kind: Mapped[str] = mapped_column(String(16), index=True)  # corpus | duplicate
    other_entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    match_openaleph_id: Mapped[str] = mapped_column(String(512), index=True)
    match_collection_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    match_collection_label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    match_investigation_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    match_schema: Mapped[str] = mapped_column(String(128))
    match_caption: Mapped[str] = mapped_column(String(512))
    match_properties: Mapped[dict] = mapped_column(JSON, default=dict)
    # What agreed, per kind of property: property_type, label, score, ours, theirs.
    matched_properties: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | decided
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class CrossReferenceDecision(Base):
    """A reporter's decision on a cross-reference, and its trip to OpenAleph
    as a pairwise judgement (aleph/views/profiles_api.py pairwise)."""
    __tablename__ = "cross_reference_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("cross_reference_proposals.id"), index=True)
    decision: Mapped[str] = mapped_column(String(16))  # same | different | unsure
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    judgement: Mapped[str] = mapped_column(String(16))  # positive | negative | unsure
    # pending | sent | failed | superseded (a later decision was made before this one was sent)
    judgement_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    judgement_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    judgement_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    openaleph_profile_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # The external-identity record a decision added (ResolutionDecision on the
    # OpenAleph entity's connector finding), when there is one.
    resolution_decision_id: Mapped[str | None] = mapped_column(ForeignKey("resolution_decisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
