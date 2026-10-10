"""Tags, notes and collections: the reporter's own marks on records
(docs/discovery/system-design.md §3.2; app/services/annotations.py)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Collection, Investigation, Note, Tag
from app.schemas.api import (
    CollectionCreate, CollectionItemCreate, CollectionUpdate, NoteCreate, NoteUpdate, RecordTagCreate, RecordType, TagCreate,
    TagUpdate,
)
from app.schemas.responses import (
    CollectionOut, CollectionsOut, LeadOut, NoteOut, NotesOut, PeekOut, RecordMarksOut, TaggedRecordsOut, TagsOut,
)
from app.services import annotations as svc
from app.services.leads import serialize_lead

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _investigation(db: Session, investigation_id: str) -> None:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")


def _get(db: Session, model: type[Any], row_id: str, what: str) -> Any:
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(404, f"{what} not found")
    return row


def _tags(db: Session, investigation_id: str) -> dict[str, Any]:
    return {"investigation_id": investigation_id, "colours": list(svc.TAG_COLOURS), "tags": svc.list_tags(db, investigation_id)}


# --- tags --------------------------------------------------------------------

@router.get("/investigations/{investigation_id}/tags", response_model=TagsOut)
def get_tags(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The investigation's tags, each with how many records carry it, and the swatches a tag may use."""
    _investigation(db, investigation_id)
    return _tags(db, investigation_id)


@router.post("/investigations/{investigation_id}/tags", response_model=TagsOut)
def add_tag(investigation_id: str, body: TagCreate, db: Session = Depends(get_db)) -> Any:
    _investigation(db, investigation_id)
    try:
        svc.create_tag(db, investigation_id, name=body.name, colour=body.colour)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _tags(db, investigation_id)


@router.patch("/tags/{tag_id}", response_model=TagsOut)
def edit_tag(tag_id: str, body: TagUpdate, db: Session = Depends(get_db)) -> Any:
    tag = _get(db, Tag, tag_id, "Tag")
    try:
        svc.update_tag(db, tag, name=body.name, colour=body.colour)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _tags(db, tag.investigation_id)


@router.delete("/tags/{tag_id}", response_model=TagsOut)
def remove_tag(tag_id: str, db: Session = Depends(get_db)) -> Any:
    """Take the tag off every record, then delete it. The records stay."""
    tag = _get(db, Tag, tag_id, "Tag")
    investigation_id = tag.investigation_id
    svc.delete_tag(db, tag)
    return _tags(db, investigation_id)


@router.get("/tags/{tag_id}/records", response_model=TaggedRecordsOut)
def get_tagged_records(tag_id: str, db: Session = Depends(get_db)) -> Any:
    tag = _get(db, Tag, tag_id, "Tag")
    summary = next(t for t in svc.list_tags(db, tag.investigation_id) if t["id"] == tag.id)
    return {"tag": summary, "records": svc.tagged_records(db, tag)}


@router.post("/investigations/{investigation_id}/record-tags", response_model=RecordMarksOut)
def tag_a_record(investigation_id: str, body: RecordTagCreate, db: Session = Depends(get_db)) -> Any:
    """Put a tag on a record. Tagging a record twice with the same tag changes nothing."""
    _investigation(db, investigation_id)
    tag = _get(db, Tag, body.tag_id, "Tag")
    if tag.investigation_id != investigation_id:
        raise HTTPException(404, "Tag not found")
    try:
        svc.tag_record(db, tag, body.record_type, body.record_id)
        return svc.record_marks(db, investigation_id, body.record_type, body.record_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/investigations/{investigation_id}/record-tags", response_model=RecordMarksOut)
def untag_a_record(investigation_id: str, tag_id: str, record_type: RecordType, record_id: str, db: Session = Depends(get_db)) -> Any:
    _investigation(db, investigation_id)
    tag = _get(db, Tag, tag_id, "Tag")
    if tag.investigation_id != investigation_id:
        raise HTTPException(404, "Tag not found")
    try:
        svc.untag_record(db, tag, record_type, record_id)
        return svc.record_marks(db, investigation_id, record_type, record_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/investigations/{investigation_id}/marks", response_model=RecordMarksOut)
def get_record_marks(investigation_id: str, record_type: RecordType, record_id: str, db: Session = Depends(get_db)) -> Any:
    """One record's tags, notes and the collections it is in."""
    _investigation(db, investigation_id)
    try:
        return svc.record_marks(db, investigation_id, record_type, record_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/investigations/{investigation_id}/peek", response_model=PeekOut)
def peek_at_record(investigation_id: str, record_type: RecordType, record_id: str, db: Session = Depends(get_db)) -> Any:
    """A search result on hover: the parties it links to, its evidence by stance, its latest event."""
    from app.services.search_view import peek

    _investigation(db, investigation_id)
    try:
        return peek(db, investigation_id, record_type, record_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


# --- notes ---------------------------------------------------------------------

@router.get("/investigations/{investigation_id}/notes", response_model=NotesOut)
def get_notes(investigation_id: str, record_type: RecordType | None = None, record_id: str | None = None,
              db: Session = Depends(get_db)) -> Any:
    """Notes, newest first: all of them, or those on one record."""
    _investigation(db, investigation_id)
    return {"investigation_id": investigation_id, "notes": svc.list_notes(db, investigation_id, record_type, record_id)}


@router.post("/investigations/{investigation_id}/notes", response_model=NoteOut)
def add_note(investigation_id: str, body: NoteCreate, db: Session = Depends(get_db)) -> Any:
    """A note on a record, on a chart mark, or (with neither) on the investigation."""
    _investigation(db, investigation_id)
    try:
        note = svc.create_note(db, investigation_id, text=body.text, record_type=body.record_type,
                               record_id=body.record_id, chart_ref=body.chart_ref)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return svc.serialize_note(db, note)


@router.patch("/notes/{note_id}", response_model=NoteOut)
def edit_note(note_id: str, body: NoteUpdate, db: Session = Depends(get_db)) -> Any:
    note = _get(db, Note, note_id, "Note")
    try:
        svc.update_note(db, note, text=body.text)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return svc.serialize_note(db, note)


@router.delete("/notes/{note_id}", response_model=NotesOut)
def remove_note(note_id: str, db: Session = Depends(get_db)) -> Any:
    """Delete the note. A lead made from it stays."""
    note = _get(db, Note, note_id, "Note")
    investigation_id, record_type, record_id = note.investigation_id, note.record_type, note.record_id
    svc.delete_note(db, note)
    return {"investigation_id": investigation_id, "notes": svc.list_notes(db, investigation_id, record_type, record_id)}


@router.post("/notes/{note_id}/lead", response_model=LeadOut)
def make_lead_from_note(note_id: str, db: Session = Depends(get_db)) -> Any:
    """Make the note a lead, linked to the record it was written on."""
    note = _get(db, Note, note_id, "Note")
    try:
        lead = svc.note_to_lead(db, note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_lead(db, lead)


# --- collections -----------------------------------------------------------------

@router.get("/investigations/{investigation_id}/collections", response_model=CollectionsOut)
def get_collections(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    _investigation(db, investigation_id)
    return {"investigation_id": investigation_id, "collections": svc.list_collections(db, investigation_id)}


@router.post("/investigations/{investigation_id}/collections", response_model=CollectionOut)
def add_collection(investigation_id: str, body: CollectionCreate, db: Session = Depends(get_db)) -> Any:
    _investigation(db, investigation_id)
    try:
        row = svc.create_collection(db, investigation_id, name=body.name, description=body.description)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return svc.serialize_collection(db, row)


@router.get("/collections/{collection_id}", response_model=CollectionOut)
def get_collection(collection_id: str, db: Session = Depends(get_db)) -> Any:
    return svc.serialize_collection(db, _get(db, Collection, collection_id, "Collection"))


@router.patch("/collections/{collection_id}", response_model=CollectionOut)
def edit_collection(collection_id: str, body: CollectionUpdate, db: Session = Depends(get_db)) -> Any:
    row = _get(db, Collection, collection_id, "Collection")
    try:
        svc.update_collection(db, row, name=body.name, description=body.description)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return svc.serialize_collection(db, row)


@router.delete("/collections/{collection_id}", response_model=CollectionsOut)
def remove_collection(collection_id: str, db: Session = Depends(get_db)) -> Any:
    """Delete the collection. The records in it stay."""
    row = _get(db, Collection, collection_id, "Collection")
    investigation_id = row.investigation_id
    svc.delete_collection(db, row)
    return {"investigation_id": investigation_id, "collections": svc.list_collections(db, investigation_id)}


@router.post("/collections/{collection_id}/items", response_model=CollectionOut)
def add_collection_item(collection_id: str, body: CollectionItemCreate, db: Session = Depends(get_db)) -> Any:
    """Add a record to the collection, or move it when it is already there."""
    row = _get(db, Collection, collection_id, "Collection")
    try:
        svc.add_to_collection(db, row, body.record_type, body.record_id, body.position)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return svc.serialize_collection(db, row)


@router.delete("/collections/{collection_id}/items", response_model=CollectionOut)
def remove_collection_item(collection_id: str, record_type: RecordType, record_id: str, db: Session = Depends(get_db)) -> Any:
    row = _get(db, Collection, collection_id, "Collection")
    svc.remove_from_collection(db, row, record_type, record_id)
    return svc.serialize_collection(db, row)
