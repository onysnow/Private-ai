"""Files inside an archive, and an email's attachments (ADR-0006, Wave A).

ingest-file reads a container and emits every file in it as an entity of
its own whose ``parent`` property names the container. Checked against
OpenAleph 5.3.1 on 2026-10-02: a zip becomes a ``Package``; a directory in
it a ``Folder``, which has no file of its own; each file a document whose
``parent`` is that folder or the package; an email's attachments have the
``Email`` as their parent. Each file's bytes stay in OpenAleph's archive
(``GET /api/2/archive/resolve``, ``aleph/views/archive_api.py``).

After the Workbench has read an archive or an email, it lists the files
directly in it (``GET /api/2/search`` with ``filter:properties.parent``),
looking through plain folders but keeping their names in each file's path,
copies each file from the archive, and makes it a Workbench document of its
own with ``parent_document_id`` set. Each child is then read from
OpenAleph's text like any upload, as a background job of its own, so a
child that cannot be read can be retried from its row. A file the
Workbench already holds for the same container is not added again.

A workbook's sheets (``Table`` entities under a ``Workbook``) are not
included: OpenAleph keeps no file for a sheet, only its rows.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
from followthemoney import model as ftm_model
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Document, DocumentCorpusSync
from app.services import openaleph_http
from app.services.openaleph_corpus import PROVIDER, _first_property
from app.services.openaleph_status import fetch_collection_status, stages

PAGE_SIZE = 200
# The kinds of document whose files the Workbench adds as documents of their own.
CONTAINER_SCHEMATA = ("Package", "Email")
# A directory inside an archive: looked through, never a document.
FOLDER_SCHEMA = "Folder"
# OpenAleph's queues a file inside a container passes before it can be listed.
READING_QUEUES = ("ingest", "analyze", "openaleph")
# The issues this module adds to a container, so a later look can replace them.
NOT_ADDED = "Not added from inside: "
NOT_LISTED = "The files inside could not be listed"
STILL_READING = "OpenAleph was still reading the files inside"

Report = Callable[[int | None, str | None], None]


def is_container(schema_name: str | None) -> bool:
    schema = ftm_model.get(schema_name or "")
    return schema is not None and any(schema.is_a(name) for name in CONTAINER_SCHEMATA)


@dataclass(frozen=True)
class Child:
    entity_id: str
    schema: str
    path: str                 # its place in the container, e.g. "letters/first.txt"
    mime_type: str | None
    file_size: int | None
    has_file: bool            # OpenAleph's archive keeps its bytes (contentHash)


@dataclass
class ChildrenResult:
    added: list[str] = field(default_factory=list)       # new Workbench document ids
    already: int = 0                                      # held from an earlier look
    not_added: list[str] = field(default_factory=list)   # "path: reason", one per file left out
    error: str | None = None                              # the files could not be listed
    settled: bool = True                                  # OpenAleph had finished reading them

    @property
    def found(self) -> int:
        return len(self.added) + self.already + len(self.not_added)

    def issues(self) -> list[str]:
        found = [f"{NOT_ADDED}{reason}" for reason in self.not_added]
        if self.error:
            found.append(f"{NOT_LISTED}: {self.error}. Use “Look for files inside again” when OpenAleph is running.")
        elif not self.settled:
            minutes = max(1, round(settings.openaleph_read_timeout_seconds / 60))
            found.append(f"{STILL_READING} after {minutes} minute(s); use “Look for files inside again” "
                         "when it has finished.")
        return found


def _search_children(collection_id: str, entity_id: str) -> list[dict[str, Any]]:
    """Every entity whose ``parent`` is this one, page by page."""
    rows: dict[str, dict[str, Any]] = {}
    offset = 0
    while True:
        payload = openaleph_http.get_json("/api/2/search", {
            "filter:collection_id": collection_id, "filter:properties.parent": entity_id,
            "limit": PAGE_SIZE, "offset": offset,
        })
        results = payload.get("results") if isinstance(payload, dict) else None
        page = [row for row in results or [] if isinstance(row, dict) and row.get("id")]
        for row in page:
            rows.setdefault(str(row["id"]), row)
        offset += len(page)
        total = payload.get("total") if isinstance(payload, dict) else None
        if not page or not isinstance(total, int) or offset >= total:
            return list(rows.values())


def list_children(
    collection_id: str, entity_id: str, *,
    search: Callable[[str, str], list[dict[str, Any]]] | None = None, prefix: str = "",
) -> list[Child]:
    """The files directly inside a container, looking through plain folders."""
    search = search or _search_children
    found: list[Child] = []
    for row in search(collection_id, entity_id):
        raw = row.get("properties")
        properties: dict[str, Any] = raw if isinstance(raw, dict) else {}
        name = _first_property(properties, "fileName", "title") or str(row["id"])
        path = f"{prefix}{name}"
        if row.get("schema") == FOLDER_SCHEMA:
            found.extend(list_children(collection_id, str(row["id"]), search=search, prefix=f"{path}/"))
            continue
        size = _first_property(properties, "fileSize")
        found.append(Child(
            entity_id=str(row["id"]), schema=str(row.get("schema") or "Document"), path=path,
            mime_type=_first_property(properties, "mimeType"),
            file_size=int(size) if size and size.isdigit() else None,
            has_file=bool(_first_property(properties, "contentHash")),
        ))
    return sorted(found, key=lambda child: child.path.lower())


def wait_until_read(
    collection_id: str, *, fetch_status: Callable[[str], dict[str, Any]] = fetch_collection_status,
    sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic,
) -> bool:
    """Wait, at most OPENALEPH_READ_TIMEOUT_SECONDS, until OpenAleph has no
    reading, name-finding or indexing work left in the collection: a
    container counts as read before the files in it are (ingest-file queues
    each one as a job of its own). True when it finished in time."""
    deadline = clock() + max(1.0, settings.openaleph_read_timeout_seconds)
    while True:
        if not any(stage.pending or stage.running for stage in stages(fetch_status(collection_id))
                   if stage.queue in READING_QUEUES):
            return True
        if clock() >= deadline:
            return False
        sleep(max(0.1, settings.openaleph_read_poll_seconds))


class ChildTooLarge(Exception):
    """The file is larger than MAX_DOCUMENT_BYTES."""


def fetch_child_file(entity_id: str, *, max_bytes: int) -> bytes | None:
    """A child's original file from OpenAleph's archive, or None when
    OpenAleph keeps no file for it.

    ``/api/2/archive/resolve`` checks read access and, with
    ``redirect=false``, answers a signed URL: a storage URL for S3 or Google
    Cloud Storage, else a link to OpenAleph's own ``/api/2/archive`` built
    on OpenAleph's public address. Such a link is followed on the address
    the Workbench reaches OpenAleph at (inside Docker the public one is not
    reachable); the signed token in it is the authorization.
    """
    response = openaleph_http.get("/api/2/archive/resolve", {"entity": entity_id, "prop": "contentHash", "redirect": "false"})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    url = payload.get("url") if isinstance(payload, dict) else None
    if not isinstance(url, str) or not url:
        return None
    data = openaleph_http.download(url, max_bytes=max_bytes)
    if data is None:
        raise ChildTooLarge()
    return data


def _held(db: Session, parent: Document) -> set[str]:
    """OpenAleph ids of the files already added under this container."""
    rows = db.scalars(select(DocumentCorpusSync.provider_record_id).join(
        Document, Document.id == DocumentCorpusSync.document_id,
    ).where(Document.parent_document_id == parent.id, DocumentCorpusSync.provider == PROVIDER)).all()
    return {str(row) for row in rows if row}


def _megabytes(size: int) -> str:
    megabytes = size / (1024 * 1024)
    return f"{megabytes:.0f} MB" if megabytes >= 1 else f"{size:,} byte"


def add_children(
    db: Session, parent: Document, *, collection_id: str, container_id: str, report: Report,
    search: Callable[[str, str], list[dict[str, Any]]] | None = None,
    fetch_file: Callable[..., bytes | None] = fetch_child_file,
    wait: Callable[[str], bool] | None = None,
) -> ChildrenResult:
    """Make each file inside the container a Workbench document under it.

    Returns what was added; the caller reads each added child. Errors
    listing or copying files become entries of the result, never an
    exception: the container itself has been read either way.
    """
    from app.services.documents import store_document
    from app.services.security import resolve_storage_root

    result = ChildrenResult()
    report(None, "Waiting for OpenAleph to read the files inside")
    try:
        result.settled = (wait or wait_until_read)(collection_id)
        report(None, "Listing the files inside")
        children = list_children(collection_id, container_id, search=search)
    except (httpx.HTTPError, ValueError) as exc:
        result.error = f"OpenAleph did not answer ({type(exc).__name__})"
        return result
    held = _held(db, parent)
    limit = settings.max_document_bytes
    for number, child in enumerate(children, 1):
        report(None, f"Copying the files inside from OpenAleph: {number} of {len(children)}")
        if child.entity_id in held:
            result.already += 1
            continue
        if not child.has_file:
            result.not_added.append(f"{child.path}: OpenAleph keeps no file for it")
            continue
        if child.file_size is not None and child.file_size > limit:
            result.not_added.append(f"{child.path}: larger than the {_megabytes(limit)} upload limit")
            continue
        try:
            data = fetch_file(child.entity_id, max_bytes=limit)
        except ChildTooLarge:
            result.not_added.append(f"{child.path}: larger than the {_megabytes(limit)} upload limit")
            continue
        except (httpx.HTTPError, ValueError) as exc:
            result.not_added.append(f"{child.path}: could not be copied from OpenAleph ({type(exc).__name__})")
            continue
        if not data:
            result.not_added.append(f"{child.path}: OpenAleph keeps no file for it" if data is None
                                    else f"{child.path}: the file is empty")
            continue
        doc = store_document(
            db, investigation_id=parent.investigation_id, title=child.path, filename=child.path,
            mime_type=child.mime_type, data=data, storage_dir=resolve_storage_root(settings.document_storage_dir),
            parent_document_id=parent.id,
            source_metadata={"found_in_document_id": parent.id, "path": child.path,
                             "openaleph_entity_id": child.entity_id},
        )
        db.add(DocumentCorpusSync(
            document_id=doc.id, investigation_id=doc.investigation_id, provider=PROVIDER,
            collection_id=collection_id, provider_record_id=child.entity_id, status="synced",
            synced_at=utcnow_naive(),
            response_json={"found_in": container_id, "path": child.path, "schema": child.schema},
        ))
        db.commit()
        result.added.append(doc.id)
    return result
