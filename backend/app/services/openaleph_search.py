"""Searching the investigation's corpus in OpenAleph, and documents like
this one (ADR-0006, Wave A).

Both read OpenAleph's index, scoped to the investigation's collection, and
link each hit back to the Workbench document OpenAleph holds it for:

- ``GET /api/2/search`` with ``highlight=true``, asking for ``Document``
  schemata and ``Page`` (checked on OpenAleph 5.3.1 on 2026-10-02: without
  ``filter:schemata`` only whole documents come back; with ``Page`` too, a
  PDF's matching page comes back with its ``index`` and the ``document`` it
  belongs to). Where a page of a document matched, that page stands for the
  document; the snippet is OpenAleph's highlight, ``<em>`` around each
  match, which openaleph-search builds with the ``html`` encoder.
- ``GET /api/2/entities/{id}/more_like_this`` (openaleph-search's
  ``MoreLikeThisQuery``: Elasticsearch's more_like_this over the text of
  documents and pages), filtered to the same collection.
"""

from __future__ import annotations

import html
import re
from typing import Any, Callable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Document, DocumentCorpusSync, Investigation
from app.services import openaleph_http
from app.services.openaleph_corpus import PROVIDER, _first_property, get_binding, get_document_sync

_MARK_RE = re.compile(r"(</?em>)")
DOCUMENT_SCHEMATA = ["Document", "Page"]

Fetch = Callable[[str, dict[str, Any]], dict[str, Any]]


def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    payload = openaleph_http.get_json(path, params)
    return payload if isinstance(payload, dict) else {}


def highlight_segments(fragment: str) -> list[dict[str, Any]]:
    """An OpenAleph highlight as plain pieces of text, each saying whether
    it is a match: the page shows them without ever reading the markup."""
    pieces: list[dict[str, Any]] = []
    match = False
    for part in _MARK_RE.split(fragment):
        if part == "<em>":
            match = True
        elif part == "</em>":
            match = False
        elif part:
            pieces.append({"text": html.unescape(part), "match": match})
    return pieces


def _highlights(row: dict[str, Any]) -> list[list[dict[str, Any]]]:
    raw = row.get("highlight")
    fragments: list[str] = []
    if isinstance(raw, dict):   # one list of fragments per field that matched
        for values in raw.values():
            if isinstance(values, list):
                fragments.extend(value for value in values if isinstance(value, str))
    elif isinstance(raw, list):
        fragments = [value for value in raw if isinstance(value, str)]
    # Matches first, then context; no fragment twice.
    unique = list(dict.fromkeys(fragments))
    unique.sort(key=lambda fragment: "<em>" not in fragment)
    return [highlight_segments(fragment) for fragment in unique[:3]]


def _held(db: Session, investigation_id: str, entity_ids: list[str]) -> dict[str, Document]:
    if not entity_ids:
        return {}
    rows = db.execute(select(DocumentCorpusSync.provider_record_id, Document).join(
        Document, Document.id == DocumentCorpusSync.document_id,
    ).where(DocumentCorpusSync.investigation_id == investigation_id, DocumentCorpusSync.provider == PROVIDER,
            DocumentCorpusSync.provider_record_id.in_(entity_ids))).tuples().all()
    return {str(entity_id): doc for entity_id, doc in rows}


def _hits(db: Session, investigation_id: str, rows: list[dict[str, Any]], *, exclude: str | None = None) -> list[dict[str, Any]]:
    """Each hit linked to the Workbench document it is (or is a page of);
    a document whose page matched is shown once, by that page."""
    def document_of(row: dict[str, Any]) -> str:
        if row.get("schema") == "Page":
            raw = row.get("properties")
            values = raw.get("document") if isinstance(raw, dict) else None
            for value in values if isinstance(values, list) else []:
                # A search reply nests the referenced entity; others give its id.
                ref = value.get("id") if isinstance(value, dict) else value
                if isinstance(ref, str) and ref:
                    return ref
        return str(row["id"])

    held = _held(db, investigation_id, list({document_of(row) for row in rows}))
    paged = {document_of(row) for row in rows if row.get("schema") == "Page"}
    hits: list[dict[str, Any]] = []
    for row in rows:
        parent = document_of(row)
        if parent == exclude or (row.get("schema") != "Page" and parent in paged):
            continue
        raw = row.get("properties")
        properties: dict[str, Any] = raw if isinstance(raw, dict) else {}
        page = _first_property(properties, "index") if row.get("schema") == "Page" else None
        doc = held.get(parent)
        hits.append({
            "openaleph_entity_id": str(row["id"]), "schema": str(row.get("schema") or "Document"),
            "title": str(row.get("caption") or _first_property(properties, "title", "fileName") or row["id"]),
            "document_id": doc.id if doc else None, "filename": doc.filename if doc else None,
            "page_number": int(page) if page and page.isdigit() else None,
            "highlights": _highlights(row),
            "score": float(row["score"]) if isinstance(row.get("score"), (int, float)) else None,
        })
    return hits


def _unavailable(reply: dict[str, Any], state: str, detail: str) -> dict[str, Any]:
    return {**reply, "state": state, "detail": detail}


def search_corpus(db: Session, investigation_id: str, q: str, *, limit: int = 20, offset: int = 0,
                  fetch: Fetch | None = None) -> dict[str, Any]:
    """Raises ValueError for an unknown investigation. ``fetch`` replaces the
    call to OpenAleph (tests)."""
    fetch = fetch or _get
    if db.get(Investigation, investigation_id) is None:
        raise ValueError("Investigation not found")
    reply: dict[str, Any] = {"investigation_id": investigation_id, "query": q, "state": "ok", "detail": None,
                             "total": 0, "results": []}
    if not settings.openaleph_enabled:
        return _unavailable(reply, "not_configured", "OpenAleph is not switched on for this deployment")
    binding = get_binding(db, investigation_id)
    if binding is None:
        return _unavailable(reply, "no_collection", "No document of this investigation has been sent to OpenAleph yet")
    try:
        found = fetch("/api/2/search", {"q": q, "filter:collection_id": binding.collection_id, "filter:schemata": DOCUMENT_SCHEMATA,
                                        "highlight": "true", "limit": limit, "offset": offset})
    except httpx.HTTPStatusError as exc:
        return _unavailable(reply, "unreachable", f"OpenAleph answered {exc.response.status_code} to the search")
    except (httpx.HTTPError, ValueError) as exc:
        return _unavailable(reply, "unreachable", f"OpenAleph did not answer ({type(exc).__name__})")
    rows = [row for row in found.get("results") or [] if isinstance(row, dict) and row.get("id")]
    total = found.get("total")
    return {**reply, "total": total if isinstance(total, int) else len(rows), "results": _hits(db, investigation_id, rows)}


def similar_documents(db: Session, document_id: str, *, limit: int = 10, fetch: Fetch = _get) -> dict[str, Any]:
    """Raises ValueError for an unknown document."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    reply: dict[str, Any] = {"document_id": doc.id, "state": "ok", "detail": None, "results": []}
    if not settings.openaleph_enabled:
        return _unavailable(reply, "not_configured", "OpenAleph is not switched on for this deployment")
    sync = get_document_sync(db, doc.id)
    if sync is None or sync.status != "synced" or not sync.provider_record_id:
        return _unavailable(reply, "no_collection", "This document is not in OpenAleph, so OpenAleph cannot compare it")
    entity_id = str(sync.provider_record_id)
    try:
        found = fetch(f"/api/2/entities/{entity_id}/more_like_this",
                      {"filter:collection_id": sync.collection_id, "limit": limit})
    except httpx.HTTPStatusError as exc:
        return _unavailable(reply, "unreachable", f"OpenAleph answered {exc.response.status_code} when asked for similar documents")
    except (httpx.HTTPError, ValueError) as exc:
        return _unavailable(reply, "unreachable", f"OpenAleph did not answer ({type(exc).__name__})")
    rows = [row for row in found.get("results") or [] if isinstance(row, dict) and row.get("id")]
    hits = _hits(db, doc.investigation_id, rows, exclude=entity_id)
    # One row per document: its best-scoring hit (OpenAleph sorts by score).
    seen: set[str] = set()
    unique = []
    for hit in hits:
        key = hit["document_id"] or hit["openaleph_entity_id"]
        if key not in seen:
            seen.add(key)
            unique.append({key: value for key, value in hit.items() if key != "highlights"})
    return {**reply, "results": unique}
