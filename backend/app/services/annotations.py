"""Tags, notes and collections: the reporter's own marks on records
(docs/discovery/system-design.md §3.1–3.2; models in app/models/annotations.py).

Every mark points at a record by ``record_type`` + ``record_id``. There is no
database foreign key for that pair, so this service checks that the record
exists and belongs to the same investigation before a mark is made. These rows
stay on this machine: nothing here is sent to an outside source.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import (
    Claim, Collection, CollectionItem, ConnectorFinding, Document, Entity, Evidence, Lead, Note, RecordTag,
    RelationshipEdge, ReportingTask, Source, Tag, TimelineEvent,
)

# The eight tag swatches (docs/discovery/README.md, Colour roles): deepBlue,
# forest, and six further palette swatches. A tag's colour is one of these.
TAG_COLOURS = ("#314d65", "#3a5c52", "#8d692b", "#663306", "#89352a", "#61503e", "#3e6181", "#966926")


def _short(text: str | None, limit: int = 120) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _edge_caption(db: Session, edge: RelationshipEdge) -> str:
    names = {e.id: e.caption for e in db.scalars(select(Entity).where(Entity.id.in_([edge.source_entity_id, edge.target_entity_id])))}
    return f"{names.get(edge.source_entity_id, '?')} → {names.get(edge.target_entity_id, '?')} ({edge.schema})"


def _evidence_investigation(db: Session, row: Evidence) -> str | None:
    source = db.get(Source, row.source_id)
    return source.investigation_id if source is not None else None


@dataclass(frozen=True)
class RecordKind:
    model: type[Any]
    caption: Callable[[Session, Any], str]
    investigation: Callable[[Session, Any], str | None] = lambda db, row: row.investigation_id


# The kinds of record a tag, note or collection item can point at. The keys
# are the record types the search and trace features already use.
RECORD_KINDS: dict[str, RecordKind] = {
    "entity": RecordKind(Entity, lambda db, r: r.caption or r.schema),
    "relationship": RecordKind(RelationshipEdge, _edge_caption),
    "evidence": RecordKind(Evidence, lambda db, r: _short(r.quote) or r.locator or "Evidence", _evidence_investigation),
    "source": RecordKind(Source, lambda db, r: r.title or r.url or "Source"),
    "claim": RecordKind(Claim, lambda db, r: _short(r.text)),
    "event": RecordKind(TimelineEvent, lambda db, r: r.title),
    "document": RecordKind(Document, lambda db, r: r.filename),
    "lead": RecordKind(Lead, lambda db, r: r.title),
    "task": RecordKind(ReportingTask, lambda db, r: r.title),
    "finding": RecordKind(ConnectorFinding, lambda db, r: r.caption or r.provider_record_id),
}


def find_record(db: Session, investigation_id: str, record_type: str, record_id: str) -> Any:
    """The record, or ValueError when the type is unknown or the record is not
    in this investigation."""
    kind = RECORD_KINDS.get(record_type)
    if kind is None:
        raise ValueError(f"Unknown record type: {record_type}")
    row = db.get(kind.model, record_id)
    if row is None or kind.investigation(db, row) != investigation_id:
        raise ValueError("That record is not in this investigation")
    return row


def caption_for(db: Session, record_type: str, record_id: str) -> str | None:
    """The record's name as the app shows it, or None when it no longer exists."""
    kind = RECORD_KINDS.get(record_type)
    row = db.get(kind.model, record_id) if kind else None
    return kind.caption(db, row) if kind and row is not None else None


# --- tags --------------------------------------------------------------------

def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ValueError("A tag needs a name")
    return name


def _check_colour(colour: str) -> str:
    colour = colour.lower()
    if colour not in TAG_COLOURS:
        raise ValueError(f"A tag's colour is one of the eight tag swatches: {', '.join(TAG_COLOURS)}")
    return colour


def _name_taken(db: Session, investigation_id: str, name: str, except_id: str | None = None) -> bool:
    stmt = select(Tag.id).where(Tag.investigation_id == investigation_id, func.lower(Tag.name) == name.lower())
    found = db.scalars(stmt).first()
    return found is not None and found != except_id


def create_tag(db: Session, investigation_id: str, *, name: str, colour: str) -> Tag:
    name = _clean_name(name)
    if _name_taken(db, investigation_id, name):
        raise ValueError(f"There is already a tag called “{name}”")
    tag = Tag(investigation_id=investigation_id, name=name, colour=_check_colour(colour))
    db.add(tag)
    db.commit()
    return tag


def update_tag(db: Session, tag: Tag, *, name: str | None = None, colour: str | None = None) -> Tag:
    if name is not None:
        name = _clean_name(name)
        if _name_taken(db, tag.investigation_id, name, except_id=tag.id):
            raise ValueError(f"There is already a tag called “{name}”")
        tag.name = name
    if colour is not None:
        tag.colour = _check_colour(colour)
    db.commit()
    return tag


def delete_tag(db: Session, tag: Tag) -> None:
    """Remove the tag from every record, then the tag."""
    for row in db.scalars(select(RecordTag).where(RecordTag.tag_id == tag.id)):
        db.delete(row)
    db.delete(tag)
    db.commit()


def list_tags(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    counts: dict[str, int] = {tag_id: n for tag_id, n in db.execute(
        select(RecordTag.tag_id, func.count()).where(RecordTag.investigation_id == investigation_id).group_by(RecordTag.tag_id))}
    tags = db.scalars(select(Tag).where(Tag.investigation_id == investigation_id).order_by(func.lower(Tag.name)))
    return [{"id": t.id, "name": t.name, "colour": t.colour, "count": counts.get(t.id, 0)} for t in tags]


def tag_record(db: Session, tag: Tag, record_type: str, record_id: str) -> RecordTag:
    find_record(db, tag.investigation_id, record_type, record_id)
    existing = db.scalars(select(RecordTag).where(
        RecordTag.tag_id == tag.id, RecordTag.record_type == record_type, RecordTag.record_id == record_id)).first()
    if existing is not None:
        return existing
    row = RecordTag(investigation_id=tag.investigation_id, tag_id=tag.id, record_type=record_type, record_id=record_id)
    db.add(row)
    db.commit()
    return row


def untag_record(db: Session, tag: Tag, record_type: str, record_id: str) -> None:
    row = db.scalars(select(RecordTag).where(
        RecordTag.tag_id == tag.id, RecordTag.record_type == record_type, RecordTag.record_id == record_id)).first()
    if row is not None:
        db.delete(row)
        db.commit()


def all_record_tags(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    rows = db.execute(select(RecordTag.tag_id, Tag.name, Tag.colour, RecordTag.record_type, RecordTag.record_id)
                      .join(Tag, Tag.id == RecordTag.tag_id).where(RecordTag.investigation_id == investigation_id)
                      .order_by(func.lower(Tag.name), RecordTag.created_at))
    return [{"tag_id": t, "name": n, "colour": c, "record_type": rt, "record_id": ri} for t, n, c, rt, ri in rows]


def tagged_records(db: Session, tag: Tag) -> list[dict[str, Any]]:
    rows = db.scalars(select(RecordTag).where(RecordTag.tag_id == tag.id).order_by(RecordTag.created_at))
    return [{"record_type": r.record_type, "record_id": r.record_id, "caption": caption_for(db, r.record_type, r.record_id)} for r in rows]


# --- marks on many records at once (search results, chart marks) -------------

def marks_for(db: Session, investigation_id: str, keys: list[tuple[str, str]]) -> dict[tuple[str, str], dict[str, Any]]:
    """For each (record_type, record_id): its tags and how many notes it has, in
    two queries whatever the number of records."""
    out: dict[tuple[str, str], dict[str, Any]] = {k: {"tags": [], "note_count": 0} for k in keys}
    ids = {record_id for _, record_id in keys}
    if not ids:
        return out
    tag_rows = db.execute(
        select(RecordTag.record_type, RecordTag.record_id, Tag.id, Tag.name, Tag.colour)
        .join(Tag, Tag.id == RecordTag.tag_id)
        .where(RecordTag.investigation_id == investigation_id, RecordTag.record_id.in_(ids))
        .order_by(func.lower(Tag.name))).all()
    for record_type, record_id, tag_id, name, colour in tag_rows:
        if (record_type, record_id) in out:
            out[(record_type, record_id)]["tags"].append({"id": tag_id, "name": name, "colour": colour})
    note_rows = db.execute(
        select(Note.record_type, Note.record_id, func.count())
        .where(Note.investigation_id == investigation_id, Note.record_id.in_(ids))
        .group_by(Note.record_type, Note.record_id)).all()
    for record_type, record_id, n in note_rows:
        if (record_type, record_id) in out:
            out[(record_type, record_id)]["note_count"] = n
    return out


def record_marks(db: Session, investigation_id: str, record_type: str, record_id: str) -> dict[str, Any]:
    """One record's tags, notes and the collections it is in."""
    find_record(db, investigation_id, record_type, record_id)
    marks = marks_for(db, investigation_id, [(record_type, record_id)])[(record_type, record_id)]
    notes = db.scalars(select(Note).where(
        Note.investigation_id == investigation_id, Note.record_type == record_type, Note.record_id == record_id)
        .order_by(Note.created_at.desc()))
    collections = db.execute(
        select(Collection.id, Collection.name).join(CollectionItem, CollectionItem.collection_id == Collection.id)
        .where(Collection.investigation_id == investigation_id, CollectionItem.record_type == record_type,
               CollectionItem.record_id == record_id).order_by(func.lower(Collection.name))).all()
    return {
        "record_type": record_type, "record_id": record_id, "caption": caption_for(db, record_type, record_id),
        "tags": marks["tags"], "notes": [serialize_note(db, n) for n in notes],
        "collections": [{"id": cid, "name": name} for cid, name in collections],
    }


# --- notes ---------------------------------------------------------------------

def serialize_note(db: Session, note: Note) -> dict[str, Any]:
    return {
        "id": note.id, "record_type": note.record_type, "record_id": note.record_id,
        "caption": caption_for(db, note.record_type, note.record_id) if note.record_type and note.record_id else None,
        "chart_ref": note.chart_ref, "text": note.text, "lead_id": note.lead_id,
        "created_at": note.created_at, "updated_at": note.updated_at,
    }


def _clean_text(text: str) -> str:
    text = text.strip()
    if not text:
        raise ValueError("A note needs some text")
    return text


def create_note(db: Session, investigation_id: str, *, text: str, record_type: str | None = None,
                record_id: str | None = None, chart_ref: dict[str, Any] | None = None) -> Note:
    if (record_type is None) != (record_id is None):
        raise ValueError("A note on a record needs both its type and its id")
    if record_type is not None and record_id is not None:
        find_record(db, investigation_id, record_type, record_id)
    note = Note(investigation_id=investigation_id, record_type=record_type, record_id=record_id,
                chart_ref=chart_ref, text=_clean_text(text))
    db.add(note)
    db.commit()
    return note


def update_note(db: Session, note: Note, *, text: str) -> Note:
    note.text = _clean_text(text)
    note.updated_at = utcnow_naive()
    db.commit()
    return note


def delete_note(db: Session, note: Note) -> None:
    """The note goes; a lead made from it stays."""
    db.delete(note)
    db.commit()


def list_notes(db: Session, investigation_id: str, record_type: str | None = None, record_id: str | None = None) -> list[dict[str, Any]]:
    stmt = select(Note).where(Note.investigation_id == investigation_id)
    if record_type is not None:
        stmt = stmt.where(Note.record_type == record_type)
    if record_id is not None:
        stmt = stmt.where(Note.record_id == record_id)
    return [serialize_note(db, n) for n in db.scalars(stmt.order_by(Note.created_at.desc()))]


# A note on one of these record types becomes a lead linked to that record
# (lead links hold these five kinds; app/models/leads.py LeadLink).
_LEAD_LINK_FIELD = {"entity": "entity_id", "source": "source_id", "claim": "claim_id",
                    "evidence": "evidence_id", "relationship": "relationship_id"}


def note_to_lead(db: Session, note: Note) -> Lead:
    """Make the note a lead. The lead's title is the note's first line; a note
    on a party, link, source, claim or evidence is linked to it."""
    from app.schemas.api import LeadCreate, LeadLinkCreate
    from app.services.leads import create_lead, create_lead_link

    if note.lead_id is not None:
        raise ValueError("This note is already a lead")
    first_line = note.text.strip().splitlines()[0]
    lead = create_lead(db, LeadCreate(investigation_id=note.investigation_id, title=_short(first_line, 500),
                                      detail=note.text, provider="note", provider_record_id=note.id))
    field = _LEAD_LINK_FIELD.get(note.record_type or "")
    if field and note.record_id:
        create_lead_link(db, lead, LeadLinkCreate(**{field: note.record_id}, note="The record the note was written on"))
    note.lead_id = lead.id
    db.commit()
    return lead


# --- collections -----------------------------------------------------------------

def serialize_collection(db: Session, collection: Collection) -> dict[str, Any]:
    items = db.scalars(select(CollectionItem).where(CollectionItem.collection_id == collection.id)
                       .order_by(CollectionItem.position, CollectionItem.added_at))
    return {
        "id": collection.id, "name": collection.name, "description": collection.description,
        "created_at": collection.created_at, "updated_at": collection.updated_at,
        "items": [{"id": i.id, "record_type": i.record_type, "record_id": i.record_id, "position": i.position,
                   "caption": caption_for(db, i.record_type, i.record_id)} for i in items],
    }


def list_collections(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    counts: dict[str, int] = {cid: n for cid, n in db.execute(
        select(CollectionItem.collection_id, func.count()).where(CollectionItem.investigation_id == investigation_id)
        .group_by(CollectionItem.collection_id))}
    rows = db.scalars(select(Collection).where(Collection.investigation_id == investigation_id).order_by(func.lower(Collection.name)))
    return [{"id": c.id, "name": c.name, "description": c.description, "item_count": counts.get(c.id, 0),
             "created_at": c.created_at, "updated_at": c.updated_at} for c in rows]


def _clean_collection_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ValueError("A collection needs a name")
    return name


def create_collection(db: Session, investigation_id: str, *, name: str, description: str | None = None) -> Collection:
    row = Collection(investigation_id=investigation_id, name=_clean_collection_name(name), description=description)
    db.add(row)
    db.commit()
    return row


def update_collection(db: Session, collection: Collection, *, name: str | None = None, description: str | None = None) -> Collection:
    if name is not None:
        collection.name = _clean_collection_name(name)
    if description is not None:
        collection.description = description or None
    collection.updated_at = utcnow_naive()
    db.commit()
    return collection


def delete_collection(db: Session, collection: Collection) -> None:
    """The collection and its list go; the records in it stay."""
    for item in db.scalars(select(CollectionItem).where(CollectionItem.collection_id == collection.id)):
        db.delete(item)
    db.delete(collection)
    db.commit()


def _renumber(ordered: list[CollectionItem]) -> None:
    for position, item in enumerate(ordered):
        item.position = position


def add_to_collection(db: Session, collection: Collection, record_type: str, record_id: str, position: int | None = None) -> None:
    """Add a record (at the end, or at ``position``). Adding one already there moves it."""
    find_record(db, collection.investigation_id, record_type, record_id)
    items = list(db.scalars(select(CollectionItem).where(CollectionItem.collection_id == collection.id)
                            .order_by(CollectionItem.position, CollectionItem.added_at)))
    item = next((i for i in items if i.record_type == record_type and i.record_id == record_id), None)
    if item is None:
        item = CollectionItem(investigation_id=collection.investigation_id, collection_id=collection.id, record_type=record_type, record_id=record_id)
        db.add(item)
    else:
        items.remove(item)
    at = len(items) if position is None else max(0, min(position, len(items)))
    items.insert(at, item)
    _renumber(items)
    collection.updated_at = utcnow_naive()
    db.commit()


def remove_from_collection(db: Session, collection: Collection, record_type: str, record_id: str) -> None:
    items = list(db.scalars(select(CollectionItem).where(CollectionItem.collection_id == collection.id)
                            .order_by(CollectionItem.position, CollectionItem.added_at)))
    keep = [i for i in items if not (i.record_type == record_type and i.record_id == record_id)]
    for gone in (i for i in items if i not in keep):
        db.delete(gone)
    _renumber(keep)
    collection.updated_at = utcnow_naive()
    db.commit()


def collection_record_ids(db: Session, collection: Collection) -> dict[str, list[str]]:
    """The collection's records by type, in order: what a chart filter reads."""
    out: dict[str, list[str]] = defaultdict(list)
    for item in db.scalars(select(CollectionItem).where(CollectionItem.collection_id == collection.id)
                           .order_by(CollectionItem.position, CollectionItem.added_at)):
        out[item.record_type].append(item.record_id)
    return dict(out)
