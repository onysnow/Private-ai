from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.db.locking import lock_investigation_transaction
from app.core.authorization import current_authorization_scope, ensure_scope_can_mutate_ids


def _pending_objects(db: Session) -> list[object]:
    """Return unique ORM objects participating in the next flush."""
    seen: set[int] = set()
    rows: list[object] = []
    for collection in (db.new, db.dirty, db.deleted):
        for obj in collection:
            marker = id(obj)
            if marker in seen:
                continue
            seen.add(marker)
            rows.append(obj)
    return rows


def collect_mutation_investigation_ids(db: Session, objects: Iterable[object] | None = None) -> set[str]:
    """Resolve investigations touched by an ORM flush.

    Most canonical records carry ``investigation_id`` directly. A small set of
    provenance/workflow leaf records only points at a parent (for example a
    Statement points at an Entity and Evidence points at a Source). Those are
    resolved through the parent so a leaf-only edit still coordinates with
    investigation delete/restore.

    The function intentionally derives IDs from the ORM model rather than from
    API routes. This makes the concurrency boundary apply to service code,
    connector promotion, tests, CLI/admin code, and future endpoints as well.
    """
    # Lazy import avoids app.db.session <-> app.models.domain import cycles.
    from app.models.domain import (
        Claim,
        ClaimEvidenceLink,
        Document,
        DocumentChunk,
        EnrichmentSession,
        EnrichmentSessionFinding,
        EnrichmentSessionRun,
        Entity,
        Evidence,
        Investigation,
        Lead,
        LeadLink,
        LeadProfile,
        LeadWorkflowEvent,
        Source,
        Statement,
    )

    rows = list(objects) if objects is not None else _pending_objects(db)
    investigation_ids: set[str] = set()

    # Directly-scoped rows cover the overwhelming majority of reporter writes.
    for obj in rows:
        if isinstance(obj, Investigation):
            if obj.id:
                investigation_ids.add(obj.id)
            continue
        investigation_id = getattr(obj, "investigation_id", None)
        if investigation_id:
            investigation_ids.add(investigation_id)

    # Resolve leaf-only writes that do not expose investigation_id themselves.
    # Batched lookups keep the guard predictable even when a workflow creates
    # many statements/chunks/links in one flush.
    entity_ids = {obj.entity_id for obj in rows if isinstance(obj, Statement) and obj.entity_id}
    source_ids = {obj.source_id for obj in rows if isinstance(obj, Evidence) and obj.source_id}
    claim_ids = {obj.claim_id for obj in rows if isinstance(obj, ClaimEvidenceLink) and obj.claim_id}
    lead_ids = {
        obj.lead_id
        for obj in rows
        if isinstance(obj, (LeadProfile, LeadLink, LeadWorkflowEvent)) and obj.lead_id
    }
    document_ids = {obj.document_id for obj in rows if isinstance(obj, DocumentChunk) and obj.document_id}
    session_ids = {
        obj.session_id
        for obj in rows
        if isinstance(obj, (EnrichmentSessionRun, EnrichmentSessionFinding)) and obj.session_id
    }

    def add_ids(stmt) -> None:
        investigation_ids.update(value for value in db.scalars(stmt).all() if value)

    if entity_ids:
        add_ids(select(Entity.investigation_id).where(Entity.id.in_(entity_ids)))
    if source_ids:
        add_ids(select(Source.investigation_id).where(Source.id.in_(source_ids)))
    if claim_ids:
        add_ids(select(Claim.investigation_id).where(Claim.id.in_(claim_ids)))
    if lead_ids:
        add_ids(select(Lead.investigation_id).where(Lead.id.in_(lead_ids)))
    if document_ids:
        add_ids(select(Document.investigation_id).where(Document.id.in_(document_ids)))
    if session_ids:
        add_ids(select(EnrichmentSession.investigation_id).where(EnrichmentSession.id.in_(session_ids)))

    return investigation_ids


def lock_pending_investigation_mutations(db: Session) -> None:
    """Authorize and coordinate every investigation touched by the pending flush.

    Authorization is cross-dialect so SQLite development behaves like PostgreSQL.
    PostgreSQL additionally acquires deterministic advisory locks for delete/restore
    coordination.
    """
    scope = current_authorization_scope()
    bind = db.get_bind()

    # Preserve the zero-work SQLite path when no request-level restriction exists.
    # Scoped SQLite requests still collect IDs so local/test behavior matches the
    # authorization guarantees of PostgreSQL.
    if bind.dialect.name != "postgresql" and (scope is None or scope.unrestricted):
        return

    investigation_ids = collect_mutation_investigation_ids(db)
    ensure_scope_can_mutate_ids(scope, investigation_ids)

    if bind.dialect.name != "postgresql":
        return
    for investigation_id in sorted(investigation_ids):
        lock_investigation_transaction(db, investigation_id)


@event.listens_for(Session, "before_flush")
def _lock_mutating_investigations_before_flush(db: Session, _flush_context, _instances) -> None:
    lock_pending_investigation_mutations(db)
