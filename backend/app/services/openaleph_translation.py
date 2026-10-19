"""A document's machine translation, as OpenAleph's optional translation
service made it (ADR-0006, Wave C: "the document view shows translatedText
beside the original").

With the compose profile ``translate`` running and OPENALEPH_TRANSLATE_DEFER
set, ftm-analyze hands each document whose detected language differs from
FTM_TRANSLATE_TARGET_LANGUAGE to ftm-translate (Argos, on the machine), which
writes the translation back (ftm_translate/tasks.py, checked on the 5.3.0-argos
image against OpenAleph 5.3.1 on 2026-10-03):

* a paged document's ``Page`` entities get ``translatedText`` and
  ``translatedTextLanguage``;
* any other document gets ``translatedText`` and ``translatedLanguage`` on
  itself.

The Workbench only reads them, page by page beside OpenAleph's original text.
A machine translation is a reading aid: quotes, evidence and claims come from
the original, never from it.
"""

from __future__ import annotations

from typing import Any, Callable

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Document
from app.services.openaleph_corpus import _first_property, get_document_sync

NOT_TRANSLATED = ("OpenAleph has no translation of this document. Translation runs only when the `translate` profile is "
                  "running (see DEPLOYMENT.md), for documents in another language than the target; it may also still be running.")


def _properties(row: Any) -> dict[str, Any]:
    props = row.get("properties") if isinstance(row, dict) else None
    return props if isinstance(props, dict) else {}


def _texts(props: dict[str, Any], name: str) -> str:
    values = props.get(name) or []
    return "\n\n".join(str(v) for v in values if str(v).strip())


def _number(props: dict[str, Any]) -> int | None:
    raw = _first_property(props, "index")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def document_translation(db: Session, doc: Document, *, fetch_entity: Callable[[str], dict | None] | None = None,
                         search_pages: Callable[..., list[dict]] | None = None) -> dict[str, Any]:
    from app.services import openaleph_corpus, openaleph_http

    fetch_entity = fetch_entity or openaleph_http.get_entity
    search_pages = search_pages or openaleph_corpus._openaleph_search
    reply: dict[str, Any] = {"document_id": doc.id, "state": "not_configured", "detail": None,
                             "detected_languages": [], "translated_language": None, "parts": []}
    if not settings.openaleph_enabled:
        return {**reply, "detail": "OpenAleph is not set up here."}
    sync = get_document_sync(db, doc.id)
    if sync is None or not sync.provider_record_id:
        return {**reply, "state": "not_in_openaleph", "detail": "This document was not read by OpenAleph."}
    record_id, collection_id = str(sync.provider_record_id), str(sync.collection_id)
    try:
        entity = fetch_entity(record_id)
        if entity is None:
            return {**reply, "state": "not_in_openaleph", "detail": "OpenAleph has not finished indexing this document."}
        props = _properties(entity)
        reply["detected_languages"] = [str(v) for v in props.get("detectedLanguage") or []]
        pages = [row for row in search_pages(collection_id=collection_id, document_record_id=record_id)
                 if str(row.get("schema") or "Page") == "Page"] if str(entity.get("schema")) == "Pages" else []
    except httpx.HTTPError as exc:
        return {**reply, "state": "unreachable", "detail": f"OpenAleph could not be reached ({type(exc).__name__})."}

    parts = []
    language = None
    if pages:
        for row in sorted(pages, key=lambda r: (_number(_properties(r)) is None, _number(_properties(r)) or 0)):
            page_props = _properties(row)
            number = _number(page_props)
            translated = _texts(page_props, "translatedText")
            language = language or _first_property(page_props, "translatedTextLanguage")
            parts.append({"locator": f"page {number}" if number is not None else "page", "page_number": number,
                          "original": _texts(page_props, "bodyText"), "translated": translated or None})
    else:
        translated = _texts(props, "translatedText")
        language = _first_property(props, "translatedLanguage")
        parts.append({"locator": "document", "page_number": None, "original": _texts(props, "bodyText"),
                      "translated": translated or None})
    reply["parts"] = parts
    reply["translated_language"] = str(language) if language else None
    if not any(part["translated"] for part in parts):
        return {**reply, "state": "not_translated", "detail": NOT_TRANSLATED}
    return {**reply, "state": "translated"}
