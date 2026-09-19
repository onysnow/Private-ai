from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authorization import AuthorizationScope
from app.models.domain import (
    Claim, ConnectorFinding, ConnectorRun, Document, Evidence, Investigation,
    Lead, ReportingTask, Source,
)
from app.schemas.api import InvestigationCreate
from app.services.documents import serialize_document
from app.services.leads import LEAD_STATUSES, list_leads_serialized, serialize_tasks_batch


def create_investigation(db: Session, body: InvestigationCreate) -> Investigation:
    row = Investigation(name=body.name, description=body.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_investigations(db: Session, scope: AuthorizationScope) -> list[Investigation]:
    rows = db.scalars(select(Investigation).order_by(Investigation.created_at.desc())).all()
    if scope.unrestricted:
        return rows
    return [row for row in rows if scope.allows(row.id)]


def list_investigation_documents(db: Session, investigation_id: str, *, limit: int | None = None, offset: int = 0) -> list[dict]:
    """List an investigation's documents, newest first.

    limit/offset apply at the SQL level (STRUCT-0018) so a large investigation
    doesn't force a full-table scan-and-serialize on every list call. Both
    default to "no limit" to preserve existing callers' behavior unchanged;
    wiring a default page size plus frontend pagination controls is tracked
    separately since it changes what an unpaginated caller sees.
    """
    stmt = select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at.desc())
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = db.scalars(stmt).all()
    return [serialize_document(db, row) for row in rows]


def list_investigation_evidence(db: Session, investigation_id: str) -> list[dict]:
    sources = db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all()
    source_by_id = {source.id: source for source in sources}
    if not source_by_id:
        return []
    evidence_rows = db.scalars(
        select(Evidence)
        .where(Evidence.source_id.in_(source_by_id.keys()))
        .order_by(Evidence.id)
    ).all()
    return [{"evidence": evidence, "source": source_by_id[evidence.source_id]} for evidence in evidence_rows]


def list_investigation_sources(db: Session, investigation_id: str) -> list[Source]:
    return db.scalars(select(Source).where(Source.investigation_id == investigation_id).order_by(Source.created_at.desc())).all()


def list_investigation_claims(db: Session, investigation_id: str) -> list[Claim]:
    return db.scalars(select(Claim).where(Claim.investigation_id == investigation_id).order_by(Claim.created_at.desc())).all()


def list_investigation_leads(db: Session, investigation_id: str) -> list[dict]:
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    return list_leads_serialized(db, rows)


def lead_queue(
    db: Session, investigation_id: str, *,
    status: list[str] | None, priority: list[str] | None, owner: str | None, unresolved_only: bool,
) -> dict:
    rows = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id).order_by(Lead.created_at.desc())).all()
    items = list_leads_serialized(db, rows)
    requested_status = set(status or [])
    requested_priority = set(priority or [])
    if unresolved_only and not requested_status:
        requested_status = {"unreviewed", "active", "blocked"}
    if requested_status:
        items = [item for item in items if item["status"] in requested_status]
    if requested_priority:
        items = [item for item in items if item["priority"] in requested_priority]
    if owner is not None:
        items = [item for item in items if (item["owner"] or "") == owner]
    priority_rank = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    # Reporter-set priority remains authoritative. Within the same priority bucket,
    # surface leads with explicit contradiction/dispute pressure first.
    items.sort(key=lambda item: (
        priority_rank.get(item["priority"], 9),
        -item.get("triage", {}).get("attention_score", 0),
        item["created_at"],
    ))
    counts = {key: sum(1 for item in items if item["status"] == key) for key in sorted(LEAD_STATUSES)}
    return {"investigation_id": investigation_id, "total": len(items), "counts": counts, "items": items}


def list_investigation_reporting_tasks(db: Session, investigation_id: str) -> list[dict]:
    rows = db.scalars(select(ReportingTask).where(ReportingTask.investigation_id == investigation_id).order_by(ReportingTask.created_at.desc())).all()
    serialized = serialize_tasks_batch(db, rows)
    return [serialized[row.id] for row in rows]


def list_investigation_connector_runs(db: Session, investigation_id: str) -> list[ConnectorRun]:
    return db.scalars(select(ConnectorRun).where(ConnectorRun.investigation_id == investigation_id).order_by(ConnectorRun.started_at.desc())).all()


def list_investigation_connector_findings(db: Session, investigation_id: str, *, limit: int | None = None, offset: int = 0) -> list[ConnectorFinding]:
    """List an investigation's connector findings, newest first.

    See list_investigation_documents above for the limit/offset rationale
    (STRUCT-0018) -- same SQL-level pagination, same no-op default.
    """
    stmt = select(ConnectorFinding).where(ConnectorFinding.investigation_id == investigation_id).order_by(ConnectorFinding.created_at.desc())
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return db.scalars(stmt).all()
