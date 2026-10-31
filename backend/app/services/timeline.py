from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Claim, ClaimEvidenceLink, Entity, Evidence, Investigation, Lead, PropertyConflictDecision, RelationshipEdge, Source, Statement, TimelineEvent,
)
from app.services.relationships import copied, serialize_relationship, serialize_relationships
from app.schemas.api import TimelineEventCreate

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


def _empty_context() -> dict[str, Any]:
    """Every part of an event's context is present, None when the event does
    not link to that record, so one reply shape covers every event kind
    (app/schemas/responses.py: TimelineContextOut)."""
    return {"source": None, "evidence": None, "claim": None, "claim_advisory": None, "relationship_advisory": None}


AdvisoryOf = Callable[[RelationshipEdge], Any]


def _advisories(db: Session, investigation_id: str) -> AdvisoryOf:
    """A link's relationship advisory, as serialize_relationship gives it. The first ask serializes every link of the
    investigation in one batch (a few queries, not several per event); each answer is its own copy."""
    found: dict[str, Any] | None = None

    def advisory_of(edge: RelationshipEdge) -> Any:
        nonlocal found
        if found is None:
            edges = db.scalars(select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id)).all()
            found = {e.id: row.get("advisory") for e, row in zip(edges, serialize_relationships(db, edges))}
        if edge.id not in found:
            return serialize_relationship(db, edge).get("advisory")
        return copied(found[edge.id])

    return advisory_of


def _timeline_context(db: Session, row: TimelineEvent, advisory_of: AdvisoryOf) -> dict:
    """Build a read-only, current provenance context for a reporter-authored event.

    The event keeps its own verification status; linked claim/evidence state is disclosed
    rather than used to silently promote or demote the event.
    """
    context = _empty_context()
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
            context["relationship_advisory"] = advisory_of(edge)
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


def _prop_label(schema: str | None, prop: str) -> str:
    """A property in words, from the FollowTheMoney model ("incorporationDate" → "incorporation date")."""
    try:
        from followthemoney import model

        found = model.get(schema) if schema else None
        if found is not None and prop in found.properties:
            return str(found.properties[prop].label).lower()
    except Exception:  # an unknown schema or model: fall back to the name, spaced out
        pass
    return re.sub(r"(?<!^)(?=[A-Z])", " ", prop).lower()


def _first(statements: list[Statement], *props: str) -> str | None:
    for prop in props:
        for stmt in statements:
            if stmt.prop == prop and str(stmt.value).strip():
                return str(stmt.value).strip()
    return None


def _relationship_event(db: Session, investigation_id: str, edge: RelationshipEdge, statements: list[Statement],
                        entity_map: dict[str, Entity], advisory_of: AdvisoryOf) -> dict | None:
    start_raw = _first(statements, "date", "startDate")
    end_raw = _first(statements, "endDate")
    start = _normalize_date(start_raw) if start_raw else None
    end = _normalize_date(end_raw) if end_raw else None
    if start is None and end is None:
        return None
    source, target = entity_map.get(edge.source_entity_id), entity_map.get(edge.target_entity_id)
    a, b = (source.caption if source else "Someone"), (target.caption if target else "someone")
    amount, currency = _first(statements, "amount"), _first(statements, "currency")
    money = f"{amount} {currency}".strip() if amount else ""
    if edge.schema == "Payment":
        title = f"{a} paid {b}{f' {money}' if money else ''}"
    else:
        from app.services.relationships import relationship_schema_info

        try:
            label = relationship_schema_info(edge.schema)["label"]
        except ValueError:
            label = edge.schema
        role = _first(statements, "role")
        title = f"{a} — {role or label} → {b}"
    # Known only by when it ended: drawn at that date, said as "by" it.
    first = start or end
    assert first is not None
    date_start, precision = first
    statement = next((st for st in statements if st.prop in ("date", "startDate", "endDate")), statements[0])
    words = [w for w in (money if edge.schema != "Payment" else "", _first(statements, "purpose"), _first(statements, "summary")) if w]
    return {
        "id": f"relationship:{edge.relationship_entity_id}",
        "kind": "relationship_date",
        "investigation_id": investigation_id,
        "title": title if start else f"{title} (by this date)",
        "description": " · ".join(words) or None,
        "date_start": date_start, "date_end": end[0] if (start and end and end[0] != start[0]) else None, "precision": precision,
        "verification_status": "asserted",
        "synthetic": True,
        "refs": {"entity_id": edge.relationship_entity_id, "statement_id": statement.id,
                 "relationship_entity_id": edge.relationship_entity_id},
        "provenance": {"dataset": statement.dataset, "origin": statement.origin, "original_value": statement.original_value,
                       "first_seen": statement.first_seen, "last_seen": statement.last_seen},
        "context": {**_empty_context(), "relationship_advisory": advisory_of(edge)},
        "sort_key": _sort_key(date_start, precision),
    }


def _manual_event(db: Session, row: TimelineEvent, advisory_of: AdvisoryOf) -> dict:
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
        "grade": row.grade,
        "placeholder": bool(row.placeholder),
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
        "context": _timeline_context(db, row, advisory_of),
        "sort_key": _sort_key(row.date_start, row.precision),
    }


def investigation_timeline(
    db: Session,
    investigation_id: str,
    *,
    kinds: set[str] | None = None,
    verification_statuses: set[str] | None = None,
    include_record_activity: bool = False,
    include_source_dates: bool = False,
    limit: int | None = None,
    offset: int = 0,
) -> dict:
    if db.get(Investigation, investigation_id) is None:
        raise ValueError("Investigation not found")

    events: list[dict] = []
    advisory_of = _advisories(db, investigation_id)

    # Reporter-authored events are the authoritative place to record disputed, approximate,
    # ranged or explicitly verified event dates and can point back to claims/evidence/sources.
    manual = db.scalars(
        select(TimelineEvent).where(TimelineEvent.investigation_id == investigation_id)
    ).all()
    events.extend(_manual_event(db, row, advisory_of) for row in manual)

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
            # The `if not start and not end: continue` above guarantees at least one of
            # them is set, but mypy can't see that across the two independent locals --
            # resolve to a single non-None tuple once and assert it for the narrowing.
            resolved = start or end
            assert resolved is not None
            date_start = resolved[0]
            precision = interval.get("precision") or resolved[1]
            events.append({
                "id": f"property-review:{review.id}:{index}", "kind": "property_temporal_interval",
                "investigation_id": investigation_id,
                "title": f"{entity.caption if entity else 'Entity'} — {review.prop}: {interval.get('value')}",
                "description": review.rationale, "date_start": date_start, "date_end": end[0] if end else None,
                "precision": precision, "verification_status": "reporter_reviewed", "synthetic": True,
                "refs": {"entity_id": review.entity_id, "evidence_id": evidence.id if evidence else None, "source_id": source.id if source else None, "property_conflict_decision_id": review.id},
                "provenance": {"decision": review.decision, "reviewed_values": review.values_json, "source_url": source.url if source else None, "locator": evidence.locator if evidence else None},
                "context": {**_empty_context(), "evidence": {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "source_id": evidence.source_id} if evidence else None, "source": {"id": source.id, "title": source.title, "url": source.url} if source else None},
                "sort_key": _sort_key(date_start, precision),
            })

    edges = {edge.relationship_entity_id: edge for edge in db.scalars(
        select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id))}
    entities = db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)).all()
    entity_map = {row.id: row for row in entities}
    # A date a person already put on the timeline for a record (or a link's party) is not drawn again from the
    # record's own properties.
    recorded = {(ref, row.date_start) for row in manual for ref in (row.entity_id, row.relationship_entity_id) if ref}

    # Normalize FollowTheMoney date properties at statement level so the dataset/origin remains visible.
    statements = db.scalars(
        select(Statement).where(Statement.entity_id.in_(list(entity_map) or ["__none__"]))
    ).all()
    by_relationship: dict[str, list[Statement]] = {}
    seen_statement_events: set[tuple[str, str, str]] = set()
    for stmt in statements:
        prop_key = stmt.prop.lower().replace("-", "").replace(" ", "")
        if stmt.entity_id in edges:
            by_relationship.setdefault(stmt.entity_id, []).append(stmt)
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
        if stmt.entity_id in edges:
            continue  # a link's dates make one event for the link, below
        normalized = _normalize_date(stmt.value)
        if normalized is None:
            continue
        date_text, precision = normalized
        dedupe = (stmt.entity_id, stmt.prop, date_text)
        if dedupe in seen_statement_events or (stmt.entity_id, date_text) in recorded:
            continue
        seen_statement_events.add(dedupe)
        entity = entity_map.get(stmt.entity_id)
        events.append({
            "id": f"statement:{stmt.id}",
            "kind": "entity_date",
            "investigation_id": investigation_id,
            "title": f"{entity.caption if entity else 'Entity'}: {_prop_label(entity.schema if entity else None, stmt.prop)}",
            "description": None,
            "date_start": date_text, "date_end": None, "precision": precision,
            "verification_status": "asserted",
            "synthetic": True,
            "refs": {"entity_id": stmt.entity_id, "statement_id": stmt.id, "relationship_entity_id": None},
            "provenance": {"dataset": stmt.dataset, "origin": stmt.origin, "original_value": stmt.original_value,
                           "first_seen": stmt.first_seen, "last_seen": stmt.last_seen},
            "context": _empty_context(),
            "sort_key": _sort_key(date_text, precision),
        })

    # A link's dates (a payment's date, an ownership's start and end) make one event for the link, in words, with its
    # amount; not one event per date property.
    for rel_id, rel_statements in by_relationship.items():
        edge = edges[rel_id]
        event = _relationship_event(db, investigation_id, edge, rel_statements, entity_map, advisory_of)
        if event is None:
            continue
        if {(ref, event["date_start"]) for ref in (rel_id, edge.source_entity_id, edge.target_entity_id)} & recorded:
            continue
        events.append(event)

    # Source publication/filing dates are read from metadata rather than inferred from source creation time. They
    # say when a document was made, not what happened, so they are left off unless asked for (by the switch, or by
    # naming the kind).
    want_sources = include_source_dates or bool(kinds and "source_date" in kinds)
    sources = db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all() if want_sources else []
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
        # Only reporter-authored events point at records; every event still
        # carries the key, so one reply shape covers every kind.
        event.setdefault("context", None)
        # Only a reporter's event can be graded (Bellingcat's scale); the key is on every event.
        event.setdefault("grade", None)
        event.setdefault("placeholder", False)
        counts[event["kind"]] = counts.get(event["kind"], 0) + 1
        status_counts[event["verification_status"]] = status_counts.get(event["verification_status"], 0) + 1
    total = len(events)
    # STRUCT-0018 cycle 4: the timeline is assembled from several tables and
    # sorted by a computed key, so (like leads/queue) limit/offset are a slice
    # of the finished list, not a SQL page. counts/total describe the whole
    # timeline; only `events` is the page.
    if offset:
        events = events[offset:]
    if limit is not None:
        events = events[:limit]
    return {
        "investigation_id": investigation_id,
        "events": events,
        "counts": counts,
        "verification_counts": status_counts,
        "total": total,
        "returned": len(events),
        "offset": offset,
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


# The suite's date_precision values (app/ai/suite_vocab.py DATE_PRECISIONS) plus the app's "year".
TIMELINE_EVENT_PRECISIONS = {"exact", "day", "month", "year", "range", "before", "after", "estimated", "unknown"}
TIMELINE_EVENT_VERIFICATION_STATUSES = {"asserted", "verified", "approximate", "disputed", "unresolved"}

# How well an event is substantiated: Bellingcat's incident grading scale
# (ADR-0005, line 5; Bellingcat, "Yemen Project: Collection protocol",
# https://yemen.bellingcat.com/methodology/collection-protocol), its words
# kept, its airstrike-specific level ("cause of explosion as other") left
# out. A grade is the reporter's; the verification status is about the
# event's date, the grade about the event itself.
EVENT_GRADES: dict[str, str] = {
    "confirmed": "enough evidence, from several verification techniques and at least three sources cross-referenced",
    "likely": "several sources report it and most of the information can be verified, with minor contradictions",
    "weak": "a single source says it happened",
    "unsubstantiated": "no conclusion can be reached for lack of evidence",
    "unknown": "what happened cannot be identified",
}


def validate_event_grade(grade: str | None) -> None:
    if grade is not None and grade not in EVENT_GRADES:
        raise ValueError(f"Grade must be one of: {', '.join(EVENT_GRADES)}")


def grade_timeline_event(db: Session, row: TimelineEvent, grade: str | None) -> TimelineEvent:
    """Set (or, with None, clear) a reporter's event's grade."""
    validate_event_grade(grade)
    row.grade = grade
    db.commit()
    db.refresh(row)
    return row


def create_timeline_event(db: Session, body: TimelineEventCreate) -> TimelineEvent:
    """Validate and persist a new TimelineEvent from a request body.

    Raises ValueError for any validation failure (bad precision/status
    enum, unparseable date, or a dangling reference caught by
    validate_timeline_refs) -- the caller maps that to a 400. The
    caller is responsible for confirming body.investigation_id exists
    (a 404 concern, not a validation one).
    """
    if body.precision not in TIMELINE_EVENT_PRECISIONS:
        raise ValueError(f"Precision must be one of: {', '.join(sorted(TIMELINE_EVENT_PRECISIONS))}")
    if body.verification_status not in TIMELINE_EVENT_VERIFICATION_STATUSES:
        raise ValueError(f"Verification status must be one of: {', '.join(sorted(TIMELINE_EVENT_VERIFICATION_STATUSES))}")
    validate_event_grade(body.grade)
    if _normalize_date(body.date_start) is None:
        raise ValueError("date_start must be ISO year, month, or date (YYYY, YYYY-MM, YYYY-MM-DD)")
    if body.date_end and _normalize_date(body.date_end) is None:
        raise ValueError("date_end must be ISO year, month, or date")
    row = TimelineEvent(**body.model_dump())
    validate_timeline_refs(db, row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
