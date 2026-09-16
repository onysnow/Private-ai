from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Claim, ClaimEvidenceLink, Entity, Evidence, Investigation, Lead, PropertyConflictDecision, RelationshipEdge, Source, Statement, TimelineEvent,
)
from app.services.relationships import serialize_relationship

DATE_PROP_HINTS = {
    "date", "startdate", "enddate", "birthdate", "deathdate", "incorporationdate",
    "dissolutiondate", "publicationdate", "filingdate", "registrationdate", "modifiedat",
    "createdat", "eventdate", "foundingdate", "start_date", "end_date",
}
SOURCE_DATE_KEYS = (
    "published_at", "published_date", "publication_date", "filing_date", "filed_at",
    "event_date", "date", "issued_at", "created_at",
)
ISO_PARTIAL = re.compile(r"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ].*)?$")


def _normalize_date(value: Any) -> tuple[str, str] | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat(), "day"
    text = str(value).strip()
    match = ISO_PARTIAL.match(text)
    if not match:
        return None
    year, month, day = match.groups()
    if day:
        return f"{year}-{month}-{day}", "day"
    if month:
        return f"{year}-{month}", "month"
    return year, "year"


def _sort_key(date_text: str | None, precision: str | None) -> str:
    if not date_text:
        return "9999-99-99"
    if precision == "year":
        return f"{date_text}-01-01"
    if precision == "month":
        return f"{date_text}-01"
    return date_text[:10]


def _timeline_context(db: Session, row: TimelineEvent) -> dict:
    """Build a read-only, current provenance context for a reporter-authored event.

    The event keeps its own verification status; linked claim/evidence state is disclosed
    rather than used to silently promote or demote the event.
    """
    context: dict[str, Any] = {}
    source = db.get(Source, row.source_id) if row.source_id else None
    evidence = db.get(Evidence, row.evidence_id) if row.evidence_id else None
    claim = db.get(Claim, row.claim_id) if row.claim_id else None
    if evidence and source is None:
        source = db.get(Source, evidence.source_id)
    if source:
        context["source"] = {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type}
    if evidence:
        context["evidence"] = {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes, "source_id": evidence.source_id}
    if row.relationship_entity_id:
        edge = db.scalar(select(RelationshipEdge).where(
            RelationshipEdge.investigation_id == row.investigation_id,
            RelationshipEdge.relationship_entity_id == row.relationship_entity_id,
        ))
        if edge is not None:
            context["relationship_advisory"] = serialize_relationship(db, edge).get("advisory")
    if claim:
        claim_context = {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence}
        if evidence:
            links = db.scalars(select(ClaimEvidenceLink).where(
                ClaimEvidenceLink.claim_id == claim.id, ClaimEvidenceLink.evidence_id == evidence.id
            ).order_by(ClaimEvidenceLink.created_at)).all()
            claim_context["evidence_stances"] = [{"stance": link.stance, "note": link.note} for link in links]
        context["claim"] = claim_context
        context["claim_advisory"] = {
            "needs_review": claim.status in {"disputed", "rejected"},
            "status": claim.status,
            "message": "Linked claim is disputed/rejected; timeline event remains preserved for reporter review." if claim.status in {"disputed", "rejected"} else None,
        }
    return context


def _manual_event(db: Session, row: TimelineEvent) -> dict:
    return {
        "id": row.id,
        "kind": "reporter_event",
        "investigation_id": row.investigation_id,
        "title": row.title,
        "description": row.description,
        "date_start": row.date_start,
        "date_end": row.date_end,
        "precision": row.precision,
        "verification_status": row.verification_status,
        "synthetic": False,
        "refs": {
            "entity_id": row.entity_id,
            "relationship_entity_id": row.relationship_entity_id,
            "source_id": row.source_id,
            "evidence_id": row.evidence_id,
            "claim_id": row.claim_id,
            "lead_id": row.lead_id,
        },
        "provenance": {"dataset": row.dataset, "origin": row.origin, "created_at": row.created_at},
        "context": _timeline_context(db, row),
        "sort_key": _sort_key(row.date_start, row.precision),
    }


def investigation_timeline(
    db: Session,
    investigation_id: str,
    *,
    kinds: set[str] | None = None,
    verification_statuses: set[str] | None = None,
    include_record_activity: bool = False,
) -> dict:
    if db.get(Investigation, investigation_id) is None:
        raise ValueError("Investigation not found")

    events: list[dict] = []

    # Reporter-authored events are the authoritative place to record disputed, approximate,
    # ranged or explicitly verified event dates and can point back to claims/evidence/sources.
    manual = db.scalars(
        select(TimelineEvent).where(TimelineEvent.investigation_id == investigation_id)
    ).all()
    events.extend(_manual_event(db, row) for row in manual)

    # Reporter-adjudicated temporal property intervals become timeline material only when
    # the reporter supplied an explicit boundary. Workbench never derives missing dates.
    temporal_reviews = db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.investigation_id == investigation_id,
        PropertyConflictDecision.decision == "temporal_change",
    )).all()
    for review in temporal_reviews:
        entity = db.get(Entity, review.entity_id)
        for index, interval in enumerate(review.temporal_intervals_json or []):
            start = _normalize_date(interval.get("date_start")) if interval.get("date_start") else None
            end = _normalize_date(interval.get("date_end")) if interval.get("date_end") else None
            if not start and not end:
                continue
            evidence = db.get(Evidence, interval.get("evidence_id")) if interval.get("evidence_id") else None
            source = db.get(Source, evidence.source_id) if evidence else None
            date_start = start[0] if start else end[0]
            precision = interval.get("precision") or (start or end)[1]
            events.append({
                "id": f"property-review:{review.id}:{index}", "kind": "property_temporal_interval",
                "investigation_id": investigation_id,
                "title": f"{entity.caption if entity else 'Entity'} — {review.prop}: {interval.get('value')}",
                "description": review.rationale, "date_start": date_start, "date_end": end[0] if end else None,
                "precision": precision, "verification_status": "reporter_reviewed", "synthetic": True,
                "refs": {"entity_id": review.entity_id, "evidence_id": evidence.id if evidence else None, "source_id": source.id if source else None, "property_conflict_decision_id": review.id},
                "provenance": {"decision": review.decision, "reviewed_values": review.values_json, "source_url": source.url if source else None, "locator": evidence.locator if evidence else None},
                "context": {"evidence": {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "source_id": evidence.source_id} if evidence else None, "source": {"id": source.id, "title": source.title, "url": source.url} if source else None},
                "sort_key": _sort_key(date_start, precision),
            })

    relationship_entity_ids = set(db.scalars(
        select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
    ).all())
    entities = db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)).all()
    entity_map = {row.id: row for row in entities}

    # Normalize FollowTheMoney date properties at statement level so the dataset/origin remains visible.
    statements = db.scalars(
        select(Statement).where(Statement.entity_id.in_(list(entity_map) or ["__none__"]))
    ).all()
    seen_statement_events: set[tuple[str, str, str]] = set()
    for stmt in statements:
        prop_key = stmt.prop.lower().replace("-", "").replace(" ", "")
        if prop_key not in DATE_PROP_HINTS and not prop_key.endswith("date"):
            if include_record_activity:
                for field, dt in (("first_seen", stmt.first_seen), ("last_seen", stmt.last_seen)):
                    if dt is None:
                        continue
                    entity = entity_map.get(stmt.entity_id)
                    events.append({
                        "id": f"statement:{stmt.id}:{field}", "kind": "statement_observed",
                        "investigation_id": investigation_id,
                        "title": f"{entity.caption if entity else 'Entity'} statement {field.replace('_', ' ')}",
                        "description": f"{stmt.prop}: {stmt.value}", "date_start": dt.date().isoformat(),
                        "date_end": None, "precision": "day", "verification_status": "system_recorded",
                        "synthetic": True, "refs": {"entity_id": stmt.entity_id, "statement_id": stmt.id},
                        "provenance": {"dataset": stmt.dataset, "origin": stmt.origin, "original_value": stmt.original_value},
                        "sort_key": dt.date().isoformat(),
                    })
            continue
        normalized = _normalize_date(stmt.value)
        if normalized is None:
            continue
        date_text, precision = normalized
        dedupe = (stmt.entity_id, stmt.prop, date_text)
        if dedupe in seen_statement_events:
            continue
        seen_statement_events.add(dedupe)
        entity = entity_map.get(stmt.entity_id)
        is_relationship = stmt.entity_id in relationship_entity_ids
        relationship_advisory = None
        if is_relationship:
            edge = db.scalar(select(RelationshipEdge).where(RelationshipEdge.relationship_entity_id == stmt.entity_id))
            if edge is not None:
                relationship_advisory = serialize_relationship(db, edge).get("advisory")
        events.append({
            "id": f"statement:{stmt.id}",
            "kind": "relationship_date" if is_relationship else "entity_date",
            "investigation_id": investigation_id,
            "title": f"{entity.caption if entity else 'Entity'} — {stmt.prop}",
            "description": stmt.value,
            "date_start": date_text, "date_end": None, "precision": precision,
            "verification_status": "asserted",
            "synthetic": True,
            "refs": {"entity_id": stmt.entity_id, "statement_id": stmt.id,
                     "relationship_entity_id": stmt.entity_id if is_relationship else None},
            "provenance": {"dataset": stmt.dataset, "origin": stmt.origin, "original_value": stmt.original_value,
                           "first_seen": stmt.first_seen, "last_seen": stmt.last_seen},
            "context": {"relationship_advisory": relationship_advisory} if is_relationship else {},
            "sort_key": _sort_key(date_text, precision),
        })

    # Source publication/filing dates are read from metadata rather than inferred from source creation time.
    sources = db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all()
    for source in sources:
        meta = source.metadata_json or {}
        for key in SOURCE_DATE_KEYS:
            if key not in meta:
                continue
            normalized = _normalize_date(meta.get(key))
            if normalized is None:
                continue
            date_text, precision = normalized
            events.append({
                "id": f"source:{source.id}:{key}", "kind": "source_date", "investigation_id": investigation_id,
                "title": source.title, "description": f"Source {key.replace('_', ' ')}",
                "date_start": date_text, "date_end": None, "precision": precision,
                "verification_status": "verified" if bool(meta.get("date_verified")) else "asserted",
                "synthetic": True, "refs": {"source_id": source.id},
                "provenance": {"source_url": source.url, "source_type": source.source_type, "metadata_key": key,
                               "metadata_value": meta.get(key)},
                "sort_key": _sort_key(date_text, precision),
            })
            break

    if include_record_activity:
        for model_name, rows in (
            ("claim_created", db.scalars(select(Claim).where(Claim.investigation_id == investigation_id)).all()),
            ("lead_created", db.scalars(select(Lead).where(Lead.investigation_id == investigation_id)).all()),
        ):
            for row in rows:
                events.append({
                    "id": f"{model_name}:{row.id}", "kind": model_name, "investigation_id": investigation_id,
                    "title": row.text if isinstance(row, Claim) else row.title,
                    "description": None if isinstance(row, Claim) else row.detail,
                    "date_start": row.created_at.date().isoformat(), "date_end": None, "precision": "day",
                    "verification_status": "system_recorded", "synthetic": True,
                    "refs": {"claim_id": row.id} if isinstance(row, Claim) else {"lead_id": row.id},
                    "provenance": {"created_at": row.created_at}, "sort_key": row.created_at.date().isoformat(),
                })

    if kinds:
        events = [event for event in events if event["kind"] in kinds]
    if verification_statuses:
        events = [event for event in events if event["verification_status"] in verification_statuses]

    events.sort(key=lambda event: (event["sort_key"], event["title"].lower(), event["id"]))
    counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for event in events:
        counts[event["kind"]] = counts.get(event["kind"], 0) + 1
        status_counts[event["verification_status"]] = status_counts.get(event["verification_status"], 0) + 1
    return {
        "investigation_id": investigation_id,
        "events": events,
        "counts": counts,
        "verification_counts": status_counts,
        "total": len(events),
    }


def validate_timeline_refs(db: Session, row: TimelineEvent) -> None:
    checks = [
        ("entity_id", Entity),
        ("relationship_entity_id", Entity),
        ("source_id", Source),
        ("evidence_id", Evidence),
        ("claim_id", Claim),
        ("lead_id", Lead),
    ]
    for field, model in checks:
        value = getattr(row, field)
        if value is None:
            continue
        target = db.get(model, value)
        if target is None:
            raise ValueError(f"{field} not found")
        target_investigation_id = getattr(target, "investigation_id", None)
        if isinstance(target, Evidence):
            source = db.get(Source, target.source_id)
            target_investigation_id = source.investigation_id if source else None
        if target_investigation_id != row.investigation_id:
            raise ValueError(f"{field} must belong to the same investigation")
    if row.relationship_entity_id is not None:
        edge = db.scalar(select(RelationshipEdge).where(RelationshipEdge.relationship_entity_id == row.relationship_entity_id))
        if edge is None:
            raise ValueError("relationship_entity_id must reference a canonical relationship entity")
