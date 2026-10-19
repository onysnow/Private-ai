"""Keep each quote's anchor in its document (ADR-0015; the matching itself is app/services/anchor_text.py).

A quote is anchored when it is saved (app/db/decided_by.py stamps new and changed Evidence before each flush) and
again when its document is read, so a quote saved before the read, or a document read again, has its place kept.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.documents import Document, DocumentChunk
from app.models.sources import Evidence, Source
from app.services.anchor_text import find_anchor


def chunk_dicts(db: Session, document_id: str) -> list[dict[str, Any]]:
    return [{"id": c.id, "locator": c.locator, "page_number": c.page_number, "text": c.text}
            for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document_id).order_by(DocumentChunk.ordinal))]


def evidence_document_id(db: Session, evidence: Evidence) -> str | None:
    """The document a quote is from: its own picture document, or its source's file."""
    if evidence.document_id:
        return evidence.document_id
    source = db.get(Source, evidence.source_id) if evidence.source_id else None
    if source is None or source.source_type != "document":
        return None
    return db.scalar(select(Document.id).where(Document.source_id == source.id).order_by(Document.created_at).limit(1))


def anchor_evidence(db: Session, evidence: Evidence, passages: dict[str, list[dict[str, Any]]] | None = None) -> None:
    """Store where the quote stands now; nothing when it has no document or the document has no text yet.
    ``passages`` keeps each document's passages between calls (accepting many proposals reads them once)."""
    document_id = evidence_document_id(db, evidence)
    if document_id is None or not evidence.quote:
        return
    passages = {} if passages is None else passages
    if document_id not in passages:
        passages[document_id] = chunk_dicts(db, document_id)
    found = find_anchor(passages[document_id], evidence.quote, locator=evidence.locator)
    evidence.anchor = {**found, "document_id": document_id, "anchored_at": utcnow_naive().isoformat()} if found else None


def anchor_document_quotes(db: Session, document: Document, *, only_missing: bool = False) -> int:
    """After a read: anchor every quote from this document again (a read replaces its passages), or with
    ``only_missing`` only those with no anchor yet. Returns how many are anchored."""
    chunks = chunk_dicts(db, document.id)
    query = select(Evidence).where(Evidence.quote.is_not(None), or_(Evidence.document_id == document.id, Evidence.source_id == document.source_id)
                                   if document.source_id else Evidence.document_id == document.id)
    anchored = 0
    for evidence in db.scalars(query):
        if (only_missing and evidence.anchor) or evidence_document_id(db, evidence) != document.id:
            continue
        old = evidence.anchor or {}
        # The stored place first (same passage, same characters), then the text either side, then anywhere: a
        # document read again unchanged keeps each quote where it was, even when the words appear twice.
        held = (f"{old['locator']}@chars:{old['start']}-{old['end']}"
                if old.get("locator") and isinstance(old.get("start"), int) and isinstance(old.get("end"), int) else None)
        found = find_anchor(chunks, evidence.quote, prefix=old.get("prefix") or "", suffix=old.get("suffix") or "",
                            locator=held or evidence.locator)
        now = utcnow_naive().isoformat()
        # A quote the new reading no longer holds keeps its old place, marked lost, so it can be checked by a person.
        evidence.anchor = ({**found, "document_id": document.id, "anchored_at": now} if found
                           else {**old, "lost_at": now} if old else None)
        anchored += found is not None
    return anchored
