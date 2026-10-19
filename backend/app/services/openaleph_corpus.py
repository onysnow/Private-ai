from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Callable

import httpx

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import (
    Document,
    DocumentCorpusSync,
    Investigation,
    InvestigationCorpusBinding,
    OpenAlephOperationFailure,
)

PROVIDER = "openaleph"

logger = logging.getLogger("journalism.openaleph")

# A document's pages are listed this many at a time, up to OpenAleph's search
# window (offset + limit <= 9,999; openaleph_search/settings.py MAX_PAGE).
PAGE_FETCH_SIZE = 500
PAGE_FETCH_WINDOW = 9999


# Single-user session tokens, by OpenAleph base URL: (token, fetched_at).
_single_user_tokens: dict[str, tuple[str, float]] = {}
_TOKEN_REUSE_SECONDS = 3600.0  # OpenAleph's single-user sessions last ~9 days


def _single_user_token(transport: httpx.BaseTransport | None = None) -> str | None:
    """The session token OpenAleph hands out in single-user mode.

    The Docker stack runs OpenAleph with ALEPH_SINGLE_USER=true: no accounts,
    and GET /api/2/metadata returns a token for the one local user. Requests
    without it are anonymous and may not create collections or upload
    (checked against OpenAleph 5.3.1 on 2026-10-01).
    """
    base = settings.openaleph_base_url.rstrip("/")
    cached = _single_user_tokens.get(base)
    if cached and time.monotonic() - cached[1] < _TOKEN_REUSE_SECONDS:
        return cached[0]
    try:
        with httpx.Client(timeout=max(settings.openaleph_probe_timeout_seconds, 5.0), transport=transport) as client:
            response = client.get(f"{base}/api/2/metadata")
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    token = payload.get("token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        return None
    _single_user_tokens[base] = (token, time.monotonic())
    return token


def openaleph_auth_headers(transport: httpx.BaseTransport | None = None) -> dict[str, str]:
    """Authorization for OpenAleph: the configured API key, else the
    single-user session token, else nothing (anonymous)."""
    if settings.openaleph_api_key:
        return {"Authorization": f"ApiKey {settings.openaleph_api_key}"}
    token = _single_user_token(transport)
    return {"Authorization": f"Token {token}"} if token else {}


def _client_factory() -> Any:
    try:
        from openaleph_client.api import AlephAPI
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("openaleph-client is not installed") from exc
    client = AlephAPI(host=settings.openaleph_base_url, api_key=settings.openaleph_api_key or None)
    if not settings.openaleph_api_key:
        client.session.headers.update(openaleph_auth_headers())
    return client


def _foreign_id(investigation_id: str) -> str:
    return f"journalism-workbench:{investigation_id}"


def serialize_binding(binding: InvestigationCorpusBinding | None) -> dict | None:
    if binding is None:
        return None
    return {
        "id": binding.id,
        "investigation_id": binding.investigation_id,
        "provider": binding.provider,
        "collection_id": binding.collection_id,
        "foreign_id": binding.foreign_id,
        "collection_label": binding.collection_label,
        "status": binding.status,
        "created_at": binding.created_at,
        "updated_at": binding.updated_at,
    }


def serialize_sync(row: DocumentCorpusSync | None) -> dict | None:
    if row is None:
        return None
    return {
        "id": row.id,
        "document_id": row.document_id,
        "investigation_id": row.investigation_id,
        "provider": row.provider,
        "collection_id": row.collection_id,
        "provider_record_id": row.provider_record_id,
        "status": row.status,
        "error": row.error,
        "response_json": row.response_json or {},
        "synced_at": row.synced_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_operation_failure(row: OpenAlephOperationFailure) -> dict:
    return {
        "id": row.id,
        "investigation_id": row.investigation_id,
        "document_id": row.document_id,
        "operation": row.operation,
        "error": row.error,
        "created_at": row.created_at,
    }


def record_openaleph_operation_failure(
    db: Session, *, investigation_id: str, document_id: str | None, operation: str, error: str,
) -> OpenAlephOperationFailure:
    """Persist a server-side trace of a failed OpenAleph pipeline operation (STRUCT-0027).

    Callers rolls back the session first if the failed operation may have left
    uncommitted writes pending, so this insert always starts from a clean
    transaction. Failures here are diagnostic only -- if this write itself
    fails, callers should not let that mask the original error.
    """
    row = OpenAlephOperationFailure(
        investigation_id=investigation_id, document_id=document_id, operation=operation, error=error,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_openaleph_operation_failures(db: Session, investigation_id: str) -> list[dict]:
    rows = db.scalars(
        select(OpenAlephOperationFailure)
        .where(OpenAlephOperationFailure.investigation_id == investigation_id)
        .order_by(OpenAlephOperationFailure.created_at.desc())
    ).all()
    return [serialize_operation_failure(row) for row in rows]


def get_binding(db: Session, investigation_id: str) -> InvestigationCorpusBinding | None:
    return db.scalar(
        select(InvestigationCorpusBinding).where(
            InvestigationCorpusBinding.investigation_id == investigation_id,
            InvestigationCorpusBinding.provider == PROVIDER,
        )
    )


def ensure_openaleph_collection(
    db: Session,
    investigation_id: str,
    *,
    client_factory: Callable[[], Any] = _client_factory,
) -> InvestigationCorpusBinding:
    investigation = db.get(Investigation, investigation_id)
    if investigation is None:
        raise ValueError("Investigation not found")
    existing = get_binding(db, investigation_id)
    if existing is not None:
        return existing
    if not settings.openaleph_enabled:
        raise RuntimeError("OpenAleph integration is disabled")

    client = client_factory()
    # OpenAleph 5.3.1 answers 400 to a new collection that names its own
    # foreign_id (checked 2026-10-01), so it picks one; the binding row is how
    # the Workbench finds the collection again. A casefile is a private
    # working collection, which is what an investigation's corpus is.
    label = investigation.name if len(investigation.name or "") >= 2 else f"Investigation {investigation.name or investigation_id}"
    collection = client.create_collection({
        "label": label[:500],
        "summary": investigation.description or "Journalism Workbench investigation corpus",
        "casefile": True,
    })
    collection_id = str(collection.get("id") or collection.get("collection_id") or "").strip()
    if not collection_id:
        raise RuntimeError("OpenAleph did not return a collection ID")
    row = InvestigationCorpusBinding(
        investigation_id=investigation_id,
        provider=PROVIDER,
        collection_id=collection_id,
        foreign_id=str(collection.get("foreign_id") or _foreign_id(investigation_id)),
        collection_label=str(collection.get("label") or label),
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_document_sync(db: Session, document_id: str) -> DocumentCorpusSync | None:
    return db.scalar(
        select(DocumentCorpusSync).where(
            DocumentCorpusSync.document_id == document_id,
            DocumentCorpusSync.provider == PROVIDER,
        )
    )


def sync_document_to_openaleph(
    db: Session,
    document_id: str,
    *,
    client_factory: Callable[[], Any] = _client_factory,
) -> DocumentCorpusSync:
    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    binding = ensure_openaleph_collection(db, doc.investigation_id, client_factory=client_factory)
    row = get_document_sync(db, document_id)
    if row is None:
        row = DocumentCorpusSync(
            document_id=doc.id,
            investigation_id=doc.investigation_id,
            provider=PROVIDER,
            collection_id=binding.collection_id,
            status="pending",
        )
        db.add(row)
        db.flush()
    if row.status == "synced":
        db.commit()
        db.refresh(row)
        return row

    path = Path(doc.storage_path)
    if not path.exists():
        row.status = "failed"
        row.error = "Stored document file is missing"
        db.commit(); db.refresh(row)
        return row

    row.status = "syncing"
    row.error = None
    db.commit(); db.refresh(row)
    try:
        client = client_factory()
        response = client.ingest_upload(
            collection_id=binding.collection_id,
            file_path=path,
            metadata={
                "foreign_id": f"journalism-workbench-document:{doc.id}",
                "workbench_document_id": doc.id,
                "sha256": doc.sha256,
            },
            sync=False,
            index=True,
        ) or {}
        provider_record_id = response.get("id") or response.get("entity_id") or response.get("foreign_id")
        row.status = "synced"
        row.provider_record_id = str(provider_record_id) if provider_record_id else None
        row.response_json = response if isinstance(response, dict) else {"result": str(response)}
        row.synced_at = utcnow_naive()
        row.error = None
    except Exception:
        logger.warning("OpenAleph upload of document %s failed", document_id, exc_info=True)
        row.status = "failed"
        row.error = "OpenAleph did not accept the file; the server log has the reason"
    db.commit(); db.refresh(row)
    return row


def _first_property(properties: dict | None, *keys: str) -> str | None:
    props = properties or {}
    for key in keys:
        value = props.get(key)
        if isinstance(value, list):
            for item in value:
                text = str(item).strip()
                if text:
                    return text
        elif value is not None:
            text = str(value).strip()
            if text:
                return text
    return None


def get_openaleph_review_status(db: Session, document_id: str) -> dict:
    """Summarize the OpenAleph -> Workbench review boundary for one document.

    The provider corpus is intentionally separate from canonical/evidentiary truth.
    This status only reports synchronization and reporter-review state; it never
    upgrades a provider extraction into Evidence or a canonical Entity.
    """
    from app.models.domain import ExtractionCandidate

    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    binding = get_binding(db, doc.investigation_id)
    sync = get_document_sync(db, doc.id)
    candidates = db.scalars(
        select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id)
    ).all()

    provider_candidates = []
    for candidate in candidates:
        payload = candidate.payload if isinstance(candidate.payload, dict) else {}
        raw_provenance = payload.get("provenance")
        provenance = raw_provenance if isinstance(raw_provenance, dict) else {}
        if provenance.get("provider") == PROVIDER:
            provider_candidates.append(candidate)

    counts: dict[str, dict[str, int]] = {}
    for candidate in provider_candidates:
        by_status = counts.setdefault(candidate.candidate_type, {})
        by_status[candidate.review_status] = by_status.get(candidate.review_status, 0) + 1

    return {
        "document_id": doc.id,
        "investigation_id": doc.investigation_id,
        "provider": PROVIDER,
        "document_extraction_status": doc.extraction_status,
        "binding": serialize_binding(binding),
        "sync": serialize_sync(sync),
        "ready_for_import": bool(sync and sync.status == "synced" and sync.provider_record_id),
        "candidate_counts": counts,
        "provider_candidate_total": len(provider_candidates),
        "provider_candidate_pending_review": sum(1 for row in provider_candidates if row.review_status == "proposed"),
        "provider_candidate_accepted": sum(1 for row in provider_candidates if row.review_status == "accepted"),
        "provider_candidate_rejected": sum(1 for row in provider_candidates if row.review_status == "rejected"),
    }


def refresh_openaleph_review_candidates(
    db: Session,
    document_id: str,
    *,
    evidence_searcher: Callable[..., list[dict]] | None = None,
    entity_fetcher: Callable[[str], dict | None] | None = None,
) -> dict:
    """Refresh both provider extraction queues for one synchronized document.

    The page-text and name imports remain independently idempotent.
    They intentionally create only review candidates.  If one provider query
    fails after the other succeeds, the successfully staged candidates are kept
    and the caller receives a normal error for retry; re-running is safe.
    """
    status = get_openaleph_review_status(db, document_id)
    if not status["ready_for_import"]:
        raise RuntimeError("Document must be successfully synchronized to OpenAleph before importing extraction results")

    evidence_kwargs = {} if evidence_searcher is None else {"searcher": evidence_searcher}
    evidence_result = import_openaleph_evidence_candidates(db, document_id, **evidence_kwargs)
    entity_result = import_openaleph_entity_candidates(db, document_id, fetch_entity=entity_fetcher)
    return {
        "document_id": document_id,
        "provider": PROVIDER,
        "evidence": evidence_result,
        "entities": entity_result,
        "status": get_openaleph_review_status(db, document_id),
    }


def _openaleph_search(
    *,
    collection_id: str,
    document_record_id: str,
    transport: httpx.BaseTransport | None = None,
) -> list[dict]:
    """Fetch every page entity belonging to one ingested document.

    OpenAleph stores paginated document text on FollowTheMoney ``Page`` entities.
    We use exact API filters for the collection and parent document so another
    document in the same investigation can never leak into this review queue.

    One search answers at most ``PAGE_FETCH_SIZE`` pages, so the search is
    paged by offset until OpenAleph's ``total`` is reached (a single call used
    to drop every page after the 500th). Rows are kept by id, so a page is
    never counted twice. OpenAleph's search refuses offset + limit beyond
    9,999 (openaleph_search/settings.py MAX_PAGE); a longer document is read
    up to that point and the shortfall is logged.
    """
    from app.services import openaleph_http

    rows: dict[str, dict] = {}
    offset = 0
    total: int | None = None
    while offset < PAGE_FETCH_WINDOW:
        params: dict[str, str | int] = {
            "q": "*",
            "filter:collection_id": collection_id,
            "filter:schema": "Page",
            "filter:properties.document": document_record_id,
            "limit": min(PAGE_FETCH_SIZE, PAGE_FETCH_WINDOW - offset),
            "offset": offset,
        }
        payload = openaleph_http.get_json("/api/2/search", params, transport=transport)
        results = payload.get("results") if isinstance(payload, dict) else None
        page = [row for row in results or [] if isinstance(row, dict)]
        for index, row in enumerate(page):
            rows.setdefault(str(row.get("id") or f"offset-{offset + index}"), row)
        offset += len(page)
        reported = payload.get("total") if isinstance(payload, dict) else None
        total = reported if isinstance(reported, int) else None
        if not page or total is None or offset >= total:
            break
    if total is not None and len(rows) < total:
        logger.warning("OpenAleph holds more pages than its search can list", extra={
            "document_record_id": document_record_id, "pages_listed": len(rows), "pages_total": total})
    return list(rows.values())


def import_openaleph_evidence_candidates(
    db: Session,
    document_id: str,
    *,
    searcher: Callable[..., list[dict]] = _openaleph_search,
) -> dict:
    """Stage OpenAleph-extracted page text for explicit reporter review.

    This deliberately does *not* create Evidence records. OpenAleph/ingest-file
    output is treated as an extraction proposal until a reporter accepts it via
    the existing extraction-candidate review workflow.
    """
    from app.models.domain import DocumentChunk, ExtractionCandidate

    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    sync = get_document_sync(db, document_id)
    if sync is None or sync.status != "synced":
        raise RuntimeError("Document must be successfully synchronized to OpenAleph before importing extraction results")
    if not sync.provider_record_id:
        raise RuntimeError("OpenAleph synchronization did not return a document record ID")

    rows = searcher(collection_id=sync.collection_id, document_record_id=sync.provider_record_id)
    created_chunks = 0
    created_candidates = 0
    skipped = 0

    for position, row in enumerate(rows, 1):
        schema = str(row.get("schema") or "")
        if schema and schema != "Page":
            skipped += 1
            continue
        provider_entity_id = str(row.get("id") or "").strip()
        if not provider_entity_id:
            skipped += 1
            continue
        properties = row.get("properties") if isinstance(row.get("properties"), dict) else {}
        text = _first_property(properties, "bodyText", "indexText", "rawText")
        if not text:
            skipped += 1
            continue
        index_raw = _first_property(properties, "index")
        try:
            page_number = int(index_raw) if index_raw is not None else None
        except (TypeError, ValueError):
            page_number = None
        locator = f"openaleph:page:{provider_entity_id}"
        chunk = db.scalar(
            select(DocumentChunk).where(
                DocumentChunk.document_id == doc.id,
                DocumentChunk.locator == locator,
            )
        )
        if chunk is None:
            chunk = DocumentChunk(
                document_id=doc.id,
                locator=locator,
                page_number=page_number,
                ordinal=100000 + position,
                text=text,
            )
            db.add(chunk)
            db.flush()
            created_chunks += 1

        existing = db.scalar(
            select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == doc.id,
                ExtractionCandidate.chunk_id == chunk.id,
                ExtractionCandidate.candidate_type == "evidence",
            )
        )
        if existing is not None:
            skipped += 1
            continue
        provenance = {
            "provider": PROVIDER,
            "collection_id": sync.collection_id,
            "provider_document_id": sync.provider_record_id,
            "provider_entity_id": provider_entity_id,
            "provider_schema": "Page",
            "extraction_method": "openaleph_ingest_file",
        }
        db.add(
            ExtractionCandidate(
                investigation_id=doc.investigation_id,
                document_id=doc.id,
                chunk_id=chunk.id,
                candidate_type="evidence",
                payload={"quote": text, "locator": locator, "provenance": provenance},
                confidence=1.0,
                review_status="proposed",
            )
        )
        created_candidates += 1

    db.commit()
    return {
        "document_id": doc.id,
        "collection_id": sync.collection_id,
        "provider_document_id": sync.provider_record_id,
        "provider": PROVIDER,
        "retrieved": len(rows),
        "created_chunks": created_chunks,
        "created_candidates": created_candidates,
        "skipped": skipped,
        "review_required": True,
    }


def import_openaleph_entity_candidates(
    db: Session,
    document_id: str,
    *,
    fetch_entity: Callable[[str], dict | None] | None = None,
) -> dict:
    """Stage what OpenAleph's analysis left on the document -- names, IBANs,
    email addresses and phone numbers -- for reporter review (ADR-0006).

    OpenAleph 5.3 writes ftm-analyze's results as ``*Mentioned`` properties on
    the document entity and creates no ``Mention`` entities unless juditha is
    configured, so they are read from the document itself
    (app/services/openaleph_analysis.py). This reads what is there now; it
    neither waits nor asks for a new analysis ("Find names again" does both).
    Nothing is merged, created or canonicalized automatically.
    """
    from app.services import openaleph_http
    from app.services.openaleph_analysis import analysis_from_entity, import_analysis_proposals

    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    sync = get_document_sync(db, document_id)
    if sync is None or sync.status != "synced":
        raise RuntimeError(
            "Document must be successfully synchronized to OpenAleph before importing extraction results"
        )
    if not sync.provider_record_id:
        raise RuntimeError("OpenAleph synchronization did not return a document record ID")

    entity = (fetch_entity or openaleph_http.get_entity)(sync.provider_record_id)
    analysis = analysis_from_entity(sync.collection_id, sync.provider_record_id, entity)
    counts = import_analysis_proposals(db, doc.id, analysis)
    return {
        "document_id": doc.id,
        "collection_id": sync.collection_id,
        "provider_document_id": sync.provider_record_id,
        "provider": PROVIDER,
        "retrieved": counts["retrieved"],
        "created_candidates": counts["entities"] + counts["identifiers"],
        "skipped": counts["skipped"],
        "review_required": True,
        "automatic_resolution": False,
    }
