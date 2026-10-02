"""Reporter-confirmed records go to the investigation's OpenAleph collection
(ADR-0006, Wave B: "Accepted entities and relationships are written to the
investigation's collection (and updated or removed when they change), so
OpenAleph's search, cross-referencing and diagrams see them").

What is sent: every canonical entity of the investigation that has not been
merged into another, and the FollowTheMoney relationship entity behind every
relationship edge. Each goes under its Workbench ``entities`` id: unique per
record (OpenAleph's store keeps one record per id and overwrites it on a
second write, so two Workbench records must never share one) and stable when
the record's caption or properties change. OpenAleph signs that id with the
collection's namespace on arrival (followthemoney/namespace.py).

``OpenAlephEntityLink`` keeps, per record, the signed id and a hash of what
was sent, so a push sends only what changed and removes what is gone. The
Workbench never deletes a single entity; a record "goes" when it is merged
into another (entity_merge.py), which moves its relationships to the record
that stays, so the push re-sends those relationships and removes the
merged-away record. Removal waits until OpenAleph's search shows no record we
keep still pointing at the one going: OpenAleph deletes through its search
index and then prunes, recursively, every entity in the collection that the
index shows pointing at a deleted one (aleph/logic/entities.py delete_entity /
prune_entity, openaleph_search iter_adjacent). Waiting for the indexing jobs to
finish is not enough on its own -- Elasticsearch shows an update only after its
next refresh (index_refresh_interval, 1 s) -- and on the live stack on
2026-10-02 a removal made in that gap took the re-pointed relationship with it.

Nothing here decides anything: the collection receives only what reporters
have already confirmed.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from followthemoney import model
from followthemoney.namespace import Namespace
from followthemoney.types import registry
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import (
    CorpusSyncState,
    Entity,
    Investigation,
    InvestigationCorpusBinding,
    OpenAlephEntityLink,
    OpenAlephOperationFailure,
    RelationshipEdge,
)
from app.services.openaleph_corpus import (
    ensure_openaleph_collection,
    get_binding,
    serialize_operation_failure,
)
from app.services.openaleph_gateway import CorpusGateway

RECORD_ENTITY = "entity"
RECORD_RELATIONSHIP = "relationship"


@dataclass(frozen=True)
class CorpusRecord:
    """One record as it should stand in OpenAleph."""
    record_type: str
    record_id: str                 # the Workbench entities.id, also the unsigned OpenAleph id
    payload: dict[str, Any]        # the FollowTheMoney entity sent to OpenAleph
    content_hash: str


@dataclass
class PushResult:
    collection_id: str = ""
    sent: int = 0
    removed: int = 0
    unchanged: int = 0
    removals_waiting: int = 0
    skipped: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.sent or self.removed)

    def counts(self) -> dict[str, Any]:
        return {"sent": self.sent, "removed": self.removed, "unchanged": self.unchanged,
                "removals_waiting": self.removals_waiting, "skipped": list(self.skipped)}

    def message(self) -> str:
        """The push in plain words, for the "Corpus sync" line."""
        parts = []
        if self.sent:
            parts.append(f"sent {self.sent} record(s)")
        if self.removed:
            parts.append(f"removed {self.removed}")
        if self.removals_waiting:
            parts.append(f"{self.removals_waiting} removal(s) wait for OpenAleph to finish indexing")
        if self.skipped:
            parts.append(f"{len(self.skipped)} record(s) cannot be sent")
        if not parts:
            return "Nothing changed since the last push"
        text = "; ".join(parts)
        return text[0].upper() + text[1:]


def _content_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _proxy(schema_name: str, record_id: str, properties: dict[str, Any]) -> Any:
    """A FollowTheMoney entity built and cleaned by followthemoney itself:
    properties the schema lacks and values its types reject are dropped
    (EntityProxy.add with quiet=True), as OpenAleph would drop them on arrival
    (_bulk cleans by default, views/collections_api.py). Entity references are
    dropped too: the Workbench links records only through relationship edges,
    and a reference value on an entity names no Workbench record."""
    proxy = model.make_entity(schema_name)
    proxy.id = record_id
    for prop_name, values in (properties or {}).items():
        prop = proxy.schema.get(prop_name)
        if prop is None or prop.type == registry.entity:
            continue
        for value in values if isinstance(values, list) else [values]:
            if isinstance(value, (str, int, float)):
                proxy.add(prop_name, str(value), quiet=True)
    return proxy


def _record(record_type: str, proxy: Any) -> CorpusRecord:
    payload = proxy.to_dict()
    return CorpusRecord(record_type=record_type, record_id=str(proxy.id), payload=payload, content_hash=_content_hash(payload))


def build_corpus_records(db: Session, investigation_id: str) -> tuple[dict[str, CorpusRecord], list[str]]:
    """Every record this investigation should hold in OpenAleph, by Workbench
    id, and a plain reason for each one that cannot be sent."""
    entities = list(db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)).all())
    by_id = {row.id: row for row in entities}
    edges = {edge.relationship_entity_id: edge for edge in db.scalars(
        select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id))}
    records: dict[str, CorpusRecord] = {}
    skipped: list[str] = []
    for row in entities:
        if row.merged_into_entity_id:
            continue
        schema = model.get(row.schema)
        if schema is None:
            skipped.append(f"{row.caption}: FollowTheMoney has no schema {row.schema!r}")
            continue
        if schema.abstract:
            # OpenAleph accepts it (_bulk answers 204) but never indexes it, so it
            # would be invisible there (checked on OpenAleph 5.3.1, 2026-10-02).
            skipped.append(f"{row.caption}: {row.schema} is an abstract FollowTheMoney type; choose a concrete type to send it")
            continue
        if (row.id is None) or registry.entity.clean(row.id) != row.id:
            skipped.append(f"{row.caption}: its id cannot be a FollowTheMoney entity id")
            continue
        edge = edges.get(row.id)
        if edge is None:
            records[row.id] = _record(RECORD_ENTITY, _proxy(row.schema, row.id, row.properties or {}))
            continue
        # A relationship points at the records its edge names now (a merge
        # moves edges to the record that stays), not at the FtM ids stored on
        # it when it was made.
        source, target = by_id.get(edge.source_entity_id), by_id.get(edge.target_entity_id)
        if source is None or target is None or source.merged_into_entity_id or target.merged_into_entity_id:
            skipped.append(f"{row.caption}: one end of this relationship is no longer an active record")
            continue
        proxy = _proxy(row.schema, row.id, row.properties or {})
        proxy.set(edge.source_prop, source.id, quiet=True)
        proxy.set(edge.target_prop, target.id, quiet=True)
        records[row.id] = _record(RECORD_RELATIONSHIP, proxy)
    # A relationship whose end cannot be sent cannot be sent either: OpenAleph
    # would hold a reference to nothing.
    changed = True
    while changed:
        changed = False
        for record_id, record in list(records.items()):
            if record.record_type != RECORD_RELATIONSHIP:
                continue
            ends = [edges[record_id].source_entity_id, edges[record_id].target_entity_id]
            if any(end not in records for end in ends):
                del records[record_id]
                skipped.append(f"{by_id[record_id].caption}: one end of this relationship cannot be sent")
                changed = True
    return records, skipped


@dataclass(frozen=True)
class _LinkSnapshot:
    record_type: str
    record_id: str
    collection_id: str
    openaleph_entity_id: str
    content_hash: str


def _links(db: Session, investigation_id: str) -> dict[str, _LinkSnapshot]:
    rows = db.scalars(select(OpenAlephEntityLink).where(OpenAlephEntityLink.investigation_id == investigation_id))
    return {row.record_id: _LinkSnapshot(row.record_type, row.record_id, row.collection_id, row.openaleph_entity_id, row.content_hash)
            for row in rows}


def pending_changes(db: Session, investigation_id: str) -> dict[str, Any]:
    """What the next push would send and remove, counted without asking OpenAleph."""
    records, skipped = build_corpus_records(db, investigation_id)
    links = _links(db, investigation_id)
    binding = get_binding(db, investigation_id)
    collection_id = binding.collection_id if binding else None
    to_send = sum(1 for record in records.values() if _needs_send(record, links.get(record.record_id), collection_id))
    to_remove = sum(1 for record_id in links if record_id not in records)
    return {"to_send": to_send, "to_remove": to_remove, "pushed": len(links), "cannot_send": skipped}


def _needs_send(record: CorpusRecord, link: _LinkSnapshot | None, collection_id: str | None) -> bool:
    return link is None or link.content_hash != record.content_hash or link.collection_id != collection_id


def _sync_binding(db: Session, binding: InvestigationCorpusBinding, collection: dict[str, Any]) -> str:
    """The collection's foreign id as OpenAleph holds it (the namespace its
    entity ids are signed with), kept on the binding with the label."""
    foreign_id = str(collection.get("foreign_id") or "").strip()
    if not foreign_id:
        raise RuntimeError(f"OpenAleph did not say which namespace collection {binding.collection_id} signs ids with")
    label = str(collection.get("label") or "").strip() or binding.collection_label
    if binding.foreign_id != foreign_id or binding.collection_label != label:
        binding.foreign_id = foreign_id
        binding.collection_label = label
        db.commit()
    return foreign_id


def push_confirmed_records(db: Session, investigation_id: str, *, gateway: CorpusGateway) -> PushResult:
    """Send what changed, then remove what is gone, for one investigation.

    Raises when OpenAleph cannot be reached or refuses a write; what was
    already recorded as sent stays recorded, and a later push carries on from
    there (sending a record again only overwrites it).
    """
    investigation = db.get(Investigation, investigation_id)
    if investigation is None:
        raise LookupError("Investigation not found")
    result = PushResult()
    if investigation.is_demo:
        # The demo is sample data: it must never be cross-referenced against
        # real investigations, so it never reaches the corpus.
        result.skipped.append("The demo investigation is never sent to OpenAleph")
        return result

    binding = ensure_openaleph_collection(db, investigation_id, client_factory=gateway.client_factory)
    collection_id = binding.collection_id
    result.collection_id = collection_id
    namespace = Namespace(_sync_binding(db, binding, gateway.get_collection(collection_id)))

    records, result.skipped = build_corpus_records(db, investigation_id)
    links = _links(db, investigation_id)
    to_send = [record for record in records.values() if _needs_send(record, links.get(record.record_id), collection_id)]
    to_remove = [link for record_id, link in links.items() if record_id not in records]
    result.unchanged = len(records) - len(to_send)
    db.rollback()  # end the read before talking to OpenAleph; nothing is pending

    if to_send:
        gateway.write_entities(collection_id, [record.payload for record in to_send])
        _record_sent(db, investigation_id, collection_id, namespace, to_send)
        result.sent = len(to_send)

    if to_remove:
        # Indexing still running: what the index shows may be about to change
        # (and an entity written but not yet indexed cannot be deleted at all).
        if gateway.index_busy(collection_id):
            result.removals_waiting = len(to_remove)
            return result
        kept = {namespace.sign(record_id) for record_id in records}
        # Relationships first, so removing an entity never has OpenAleph
        # prune a relationship that is also being removed.
        for link in sorted(to_remove, key=lambda item: item.record_type != RECORD_RELATIONSHIP):
            if kept.intersection(gateway.referencing_entities(collection_id, link.openaleph_entity_id)):
                result.removals_waiting += 1  # the index does not show the re-pointed records yet
                continue
            gateway.delete_entity(link.openaleph_entity_id)  # False: already gone
            # Through the ORM, so the flush-time guard (app/db/mutation_guard.py)
            # coordinates this write with the investigation like any other.
            row = db.scalar(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == link.record_id))
            if row is not None:
                db.delete(row)
            db.commit()
            result.removed += 1
    return result


def _record_sent(db: Session, investigation_id: str, collection_id: str, namespace: Namespace, records: list[CorpusRecord]) -> None:
    now = utcnow_naive()
    existing = {row.record_id: row for row in db.scalars(select(OpenAlephEntityLink).where(
        OpenAlephEntityLink.record_id.in_([record.record_id for record in records])))}
    for record in records:
        signed = namespace.sign(record.record_id)
        if signed is None:  # pragma: no cover - build_corpus_records only keeps valid ids
            continue
        row = existing.get(record.record_id)
        if row is None:
            row = OpenAlephEntityLink(investigation_id=investigation_id, record_type=record.record_type, record_id=record.record_id)
            db.add(row)
        row.record_type = record.record_type
        row.collection_id = collection_id
        row.openaleph_entity_id = signed
        row.content_hash = record.content_hash
        row.pushed_at = now
    db.commit()


CORPUS_OPERATIONS_PREFIX = "corpus_"
DEMO_NOT_SENT = "The demo investigation is never sent to OpenAleph"


def corpus_sync_status(db: Session, investigation_id: str, *, background: bool) -> dict[str, Any]:
    """The "Corpus sync" line: is the corpus in step with what reporters
    confirmed? The last push, what is still to send or remove, and recent
    failures. ``background`` says whether a worker sends changes by itself
    (otherwise only "Sync now" does)."""
    investigation = db.get(Investigation, investigation_id)
    if investigation is None:
        raise LookupError("Investigation not found")
    binding = get_binding(db, investigation_id)
    state = db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == investigation_id))
    if investigation.is_demo:
        pending: dict[str, Any] = {"to_send": 0, "to_remove": 0, "pushed": 0, "cannot_send": [DEMO_NOT_SENT]}
    else:
        pending = pending_changes(db, investigation_id)
    counts = (state.push_counts if state is not None else None) or {}
    failures = db.scalars(
        select(OpenAlephOperationFailure)
        .where(OpenAlephOperationFailure.investigation_id == investigation_id,
               OpenAlephOperationFailure.operation.startswith(CORPUS_OPERATIONS_PREFIX))
        .order_by(OpenAlephOperationFailure.created_at.desc())
        .limit(5)
    ).all()
    return {
        "investigation_id": investigation_id,
        "enabled": bool(settings.openaleph_enabled) and not investigation.is_demo,
        "background": background,
        "collection_id": binding.collection_id if binding else None,
        "collection_label": binding.collection_label if binding else None,
        "pushed_records": int(pending["pushed"]),
        "pending": {"to_send": int(pending["to_send"]), "to_remove": int(pending["to_remove"]),
                    "cannot_send": list(pending["cannot_send"])},
        "push": {
            "status": state.push_status if state is not None else "never",
            "started_at": state.push_started_at if state is not None else None,
            "finished_at": state.push_finished_at if state is not None else None,
            "message": state.push_message if state is not None else None,
            "error": state.push_error if state is not None else None,
            "sent": int(counts.get("sent") or 0),
            "removed": int(counts.get("removed") or 0),
            "unchanged": int(counts.get("unchanged") or 0),
            "removals_waiting": int(counts.get("removals_waiting") or 0),
        },
        "consecutive_failures": int(state.consecutive_failures or 0) if state is not None else 0,
        "failures": [serialize_operation_failure(row) for row in failures],
    }
