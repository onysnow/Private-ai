"""OpenAleph reads uploaded documents (ADR-0004, decision 1 and 5).

The upload's background job hands the file to OpenAleph, waits until
OpenAleph has read it (ingest-file: text layers, OCR, office conversion),
and takes OpenAleph's text back as the document's chunks: one chunk per
page for paged documents, one per paragraph for files without pages (plain
text, HTML and similar). The Workbench's own reader is the fallback,
used only when OpenAleph cannot deliver -- see ``OpenAlephUnavailable``.

Checked against OpenAleph 5.3.1 on 2026-10-01: a document entity becomes
readable at GET /api/2/entities/{id} once indexed and carries
``processingStatus`` (``success`` / ``failure``) and ``processingError``;
paged documents (schema Pages) have ``Page`` children with ``index`` and
``bodyText``; plain text keeps ``bodyText`` on the document itself.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import openaleph_http
from app.services.openaleph_corpus import PROVIDER, _first_property

Report = Callable[[int | None, str | None], None]
PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n")
NO_TEXT_ISSUE = "OpenAleph read this file and found no text in it."
logger = logging.getLogger("journalism.openaleph")


class OpenAlephUnavailable(Exception):
    """OpenAleph could not read this document; the plain-language reason
    is the message. The caller reads it with the Workbench's own reader
    when that reader can read the file (app/services/document_formats.py).

    ``kind`` says what went wrong, for a file only OpenAleph can read:
    ``unreachable`` (it could not be reached, or did not take the file:
    retrying when it runs may help), ``failed`` (OpenAleph tried and could
    not read it), ``timeout`` (it had not finished in time) or ``no_text``.
    """

    def __init__(self, message: str, *, kind: str = "unreachable") -> None:
        super().__init__(message)
        self.kind = kind


@dataclass
class OpenAlephText:
    chunks: list[dict[str, Any]]          # locator, page_number, text, provenance
    issues: list[str] = field(default_factory=list)
    collection_id: str = ""
    provider_document_id: str = ""
    schema: str = "Document"              # the FtM schema OpenAleph gave the document


def reading_with_openaleph() -> bool:
    """Whether uploads are read by OpenAleph (DOCUMENT_READER, default auto:
    yes when the OpenAleph integration is enabled)."""
    choice = (settings.document_reader or "auto").strip().lower()
    if choice == "local":
        return False
    if choice == "openaleph":
        return True
    return bool(settings.openaleph_enabled)


def fetch_openaleph_entity(entity_id: str) -> dict | None:
    """One entity from OpenAleph, or None while it is not indexed yet."""
    return openaleph_http.get_entity(entity_id)


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", (text or "").replace("\x00", "")).strip()


def _page_number(row: dict) -> int | None:
    properties = row.get("properties") if isinstance(row.get("properties"), dict) else {}
    raw = _first_property(properties, "index")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def read_with_openaleph(
    db: Session,
    document_id: str,
    report: Report,
    *,
    fetch_entity: Callable[[str], dict | None] | None = None,
    search_pages: Callable[..., list[dict]] | None = None,
    sync: Callable[[Session, str], Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    allow_empty: bool = False,
) -> OpenAlephText:
    """Send the document to OpenAleph, wait for it to be read, return its text.

    Raises OpenAlephUnavailable with the reason when OpenAleph is
    unreachable, rejects the file, fails to read it, does not finish within
    OPENALEPH_READ_TIMEOUT_SECONDS, or returns no text. ``allow_empty``
    (for a file only OpenAleph can read, such as an archive, whose files are
    its children, or a picture without words) returns no chunks and an issue
    instead of raising when OpenAleph read the file and found no text.
    """
    from app.services import openaleph_corpus

    fetch_entity = fetch_entity or fetch_openaleph_entity
    search_pages = search_pages or openaleph_corpus._openaleph_search
    sync = sync or openaleph_corpus.sync_document_to_openaleph
    report(10, "Sending the document to OpenAleph")
    try:
        sync_row = sync(db, document_id)
    except Exception as exc:  # unreachable, refused, misconfigured
        db.rollback()
        logger.warning("sending a document to OpenAleph failed", exc_info=(type(exc), exc, exc.__traceback__))
        raise OpenAlephUnavailable(f"could not send the file to OpenAleph ({type(exc).__name__})") from exc
    if sync_row.status != "synced" or not sync_row.provider_record_id:
        raise OpenAlephUnavailable(f"OpenAleph did not accept the file ({sync_row.error or sync_row.status})")
    record_id = str(sync_row.provider_record_id)
    collection_id = str(sync_row.collection_id)

    report(20, "OpenAleph is reading the document")
    deadline = clock() + max(1.0, settings.openaleph_read_timeout_seconds)
    entity: dict | None = None
    while True:
        try:
            entity = fetch_entity(record_id)
        except httpx.HTTPError as exc:
            raise OpenAlephUnavailable(f"lost contact with OpenAleph while it was reading ({type(exc).__name__})") from exc
        properties = entity.get("properties") if isinstance(entity, dict) and isinstance(entity.get("properties"), dict) else {}
        status = _first_property(properties, "processingStatus")
        if status == "success":
            break
        if status == "failure":
            reason = _first_property(properties, "processingError") or "no reason given"
            raise OpenAlephUnavailable(f"OpenAleph could not read the file: {reason}", kind="failed")
        if clock() >= deadline:
            minutes = max(1, round(settings.openaleph_read_timeout_seconds / 60))
            raise OpenAlephUnavailable(f"OpenAleph had not finished reading after {minutes} minute(s)", kind="timeout")
        sleep(max(0.1, settings.openaleph_read_poll_seconds))

    report(70, "Taking OpenAleph's text")
    base = {"provider": PROVIDER, "collection_id": collection_id, "provider_document_id": record_id,
            "extraction_method": "openaleph_ingest_file"}
    try:
        pages = [row for row in search_pages(collection_id=collection_id, document_record_id=record_id)
                 if str(row.get("schema") or "Page") == "Page"]
    except httpx.HTTPError as exc:
        raise OpenAlephUnavailable(f"could not fetch the pages OpenAleph read ({type(exc).__name__})") from exc

    chunks: list[dict[str, Any]] = []
    issues: list[str] = []
    if pages:
        pages.sort(key=lambda row: (_page_number(row) is None, _page_number(row) or 0))
        blank = 0
        for row in pages:
            properties = row.get("properties") if isinstance(row.get("properties"), dict) else {}
            text = _clean(_first_property(properties, "bodyText", "indexText") or "")
            number = _page_number(row)
            if not text:
                blank += 1
                continue
            chunks.append({
                "locator": f"page {number}" if number is not None else f"page (OpenAleph {row.get('id')})",
                "page_number": number, "text": text,
                "provenance": {**base, "provider_entity_id": str(row.get("id") or ""), "provider_schema": "Page"},
            })
        if blank:
            issues.append(f"{blank} of {len(pages)} page(s) produced no text in OpenAleph (blank, or unreadable even with OCR).")
    else:
        properties = entity.get("properties") if isinstance(entity, dict) and isinstance(entity.get("properties"), dict) else {}
        body = _first_property(properties, "bodyText", "indexText") or ""
        schema = str((entity or {}).get("schema") or "Document")
        for number, paragraph in enumerate((p for p in PARAGRAPH_SPLIT_RE.split(body) if _clean(p)), 1):
            chunks.append({
                "locator": f"paragraph {number}", "page_number": None, "text": _clean(" ".join(paragraph.splitlines())),
                "provenance": {**base, "provider_entity_id": record_id, "provider_schema": schema},
            })
    if not chunks:
        if not allow_empty:
            raise OpenAlephUnavailable("OpenAleph returned no text for this file", kind="no_text")
        issues.append(NO_TEXT_ISSUE)
    return OpenAlephText(chunks=chunks, issues=issues, collection_id=collection_id, provider_document_id=record_id,
                         schema=str((entity or {}).get("schema") or "Document"))
