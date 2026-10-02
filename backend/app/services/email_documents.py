"""An email document's headers and its thread (ADR-0006, Wave A).

The headers are the ones OpenAleph read (ingest-file's email support fills
``from``, ``to``, ``cc``, ``bcc``, ``date``, ``subject``, ``messageId`` and
``inReplyTo`` on the ``Email`` entity); the read job keeps them on the
document's Source (jobs/handlers.py), so they show while OpenAleph is down.
The thread comes from OpenAleph's ``GET /api/2/entities/{id}/thread``
(``aleph/views/entities_api.py``: it walks up to the first message and down
every branch, sorted by date, within the email's own collection), and each
message the Workbench also holds is linked to its document.
"""

from __future__ import annotations

from typing import Any, Callable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, DocumentCorpusSync, Source
from app.services import openaleph_http
from app.services.openaleph_corpus import PROVIDER, _first_property, get_document_sync
from app.services.openaleph_reader import email_headers


class NotAnEmail(ValueError):
    """The document is not an email OpenAleph read."""


def _thread(entity_id: str) -> dict[str, Any]:
    payload = openaleph_http.get_json(f"/api/2/entities/{entity_id}/thread")
    return payload if isinstance(payload, dict) else {}


def _headers_out(headers: dict[str, list[str]]) -> dict[str, Any]:
    def first(name: str) -> str | None:
        values = headers.get(name) or []
        return values[0] if values else None

    return {"from": headers.get("from", []), "to": headers.get("to", []), "cc": headers.get("cc", []),
            "bcc": headers.get("bcc", []), "date": first("date"), "subject": first("subject"),
            "message_id": first("message_id"), "in_reply_to": headers.get("in_reply_to", [])}


def document_email(
    db: Session, document_id: str, *,
    fetch_entity: Callable[[str], dict[str, Any] | None] = openaleph_http.get_entity,
    fetch_thread: Callable[[str], dict[str, Any]] = _thread,
) -> dict[str, Any]:
    """Raises ValueError for an unknown document, NotAnEmail for another kind."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    sync = get_document_sync(db, doc.id)
    entity_id = str(sync.provider_record_id) if sync is not None and sync.status == "synced" and sync.provider_record_id else None
    source = db.get(Source, doc.source_id)
    stored = (source.metadata_json or {}).get("email") if source is not None else None
    headers: dict[str, list[str]] = stored if isinstance(stored, dict) else {}
    note: str | None = None
    if not headers and entity_id:
        # Read before the headers were kept: ask OpenAleph for them.
        try:
            entity = fetch_entity(entity_id)
        except httpx.HTTPError as exc:
            entity = None
            note = f"OpenAleph did not answer ({type(exc).__name__})"
        if isinstance(entity, dict) and entity.get("schema") == "Email":
            headers = email_headers(entity)
    schema = (sync.response_json or {}).get("schema") if sync is not None else None
    if not headers and schema != "Email":
        if note:
            raise NotAnEmail(f"Could not tell whether this document is an email: {note}")
        raise NotAnEmail("This document is not an email")

    thread: list[dict[str, Any]] = []
    if entity_id is None:
        note = "This email is not in OpenAleph, so its thread cannot be shown"
    else:
        try:
            reply = fetch_thread(entity_id)
        except (httpx.HTTPError, ValueError) as exc:
            reply = {}
            note = f"OpenAleph did not answer ({type(exc).__name__}); the thread shows when it is running"
        rows = [row for row in reply.get("results") or [] if isinstance(row, dict) and row.get("id")]
        held = dict(db.execute(select(DocumentCorpusSync.provider_record_id, DocumentCorpusSync.document_id).where(
            DocumentCorpusSync.investigation_id == doc.investigation_id, DocumentCorpusSync.provider == PROVIDER,
            DocumentCorpusSync.provider_record_id.in_([str(row["id"]) for row in rows]),
        )).tuples().all()) if rows else {}
        for row in rows:
            raw = row.get("properties")
            properties: dict[str, Any] = raw if isinstance(raw, dict) else {}
            thread.append({
                "openaleph_entity_id": str(row["id"]),
                "subject": _first_property(properties, "subject") or (str(row["caption"]) if row.get("caption") else None),
                "sender": _first_property(properties, "from"),
                "date": _first_property(properties, "date"),
                "document_id": held.get(str(row["id"])),
                "current": str(row["id"]) == entity_id,
            })
        if reply.get("total_type") == "gte":
            note = "The thread is longer than OpenAleph returns at once; these are its first messages"
        elif not rows and note is None:
            # OpenAleph 5.3.1 answers an empty thread for a message nothing replies to.
            note = "OpenAleph found no other message in this email's thread"
    return {"document_id": doc.id, "headers": _headers_out(headers), "thread": thread, "thread_note": note}
