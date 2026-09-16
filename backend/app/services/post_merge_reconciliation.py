from __future__ import annotations

import re
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity, Statement, RelationshipEdge, PostMergeReconciliationDecision
from app.services.relationships import serialize_relationship


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _pair(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((a, b)))


def _latest_decisions(db: Session, investigation_id: str, entity_id: str) -> dict[tuple[str, str, str], PostMergeReconciliationDecision]:
    rows = db.scalars(
        select(PostMergeReconciliationDecision)
        .where(
            PostMergeReconciliationDecision.investigation_id == investigation_id,
            PostMergeReconciliationDecision.entity_id == entity_id,
        )
        .order_by(PostMergeReconciliationDecision.created_at.desc())
    ).all()
    latest: dict[tuple[str, str, str], PostMergeReconciliationDecision] = {}
    for row in rows:
        a, b = _pair(row.record_a_id, row.record_b_id)
        latest.setdefault((row.record_type, a, b), row)
    return latest


def _statement_row(row: Statement) -> dict:
    return {
        "id": row.id,
        "prop": row.prop,
        "value": row.value,
        "dataset": row.dataset,
        "origin": row.origin,
        "original_value": row.original_value,
        "first_seen": row.first_seen,
        "last_seen": row.last_seen,
    }


def detect_post_merge_reconciliation(db: Session, entity: Entity) -> dict:
    if entity.merged_into_entity_id:
        raise ValueError("Reconciliation must be opened on the active canonical entity")
    latest = _latest_decisions(db, entity.investigation_id, entity.id)

    statement_groups: dict[tuple[str, str], list[Statement]] = defaultdict(list)
    statements = db.scalars(select(Statement).where(Statement.entity_id == entity.id).order_by(Statement.prop, Statement.value, Statement.id)).all()
    for stmt in statements:
        statement_groups[(_norm(stmt.prop), _norm(stmt.value))].append(stmt)
    statement_pairs = []
    for rows in statement_groups.values():
        if len(rows) < 2:
            continue
        for i, a in enumerate(rows):
            for b in rows[i + 1:]:
                x, y = _pair(a.id, b.id)
                decision = latest.get(("statement", x, y))
                statement_pairs.append({
                    "record_type": "statement",
                    "record_a": _statement_row(a),
                    "record_b": _statement_row(b),
                    "same_assertion": True,
                    "provenance_differs": (a.dataset, a.origin, a.original_value) != (b.dataset, b.origin, b.original_value),
                    "latest_decision": decision,
                })

    rel_groups: dict[tuple[str, str, str, str, str], list[RelationshipEdge]] = defaultdict(list)
    edges = db.scalars(
        select(RelationshipEdge).where(
            RelationshipEdge.investigation_id == entity.investigation_id,
            ((RelationshipEdge.source_entity_id == entity.id) | (RelationshipEdge.target_entity_id == entity.id)),
        ).order_by(RelationshipEdge.created_at, RelationshipEdge.id)
    ).all()
    for edge in edges:
        key = (
            _norm(edge.schema), edge.source_entity_id, edge.target_entity_id,
            _norm(edge.source_prop), _norm(edge.target_prop),
        )
        rel_groups[key].append(edge)
    relationship_pairs = []
    for rows in rel_groups.values():
        if len(rows) < 2:
            continue
        for i, a in enumerate(rows):
            for b in rows[i + 1:]:
                x, y = _pair(a.id, b.id)
                decision = latest.get(("relationship", x, y))
                serialized_a = serialize_relationship(db, a)
                serialized_b = serialize_relationship(db, b)
                evidence_a = {
                    item.get("evidence", {}).get("id")
                    for item in (serialized_a.get("provenance", {}).get("evidence_attachments") or [])
                    if item.get("evidence", {}).get("id")
                }
                evidence_b = {
                    item.get("evidence", {}).get("id")
                    for item in (serialized_b.get("provenance", {}).get("evidence_attachments") or [])
                    if item.get("evidence", {}).get("id")
                }
                statement_sources_a = set(serialized_a.get("provenance", {}).get("sources") or [])
                statement_sources_b = set(serialized_b.get("provenance", {}).get("sources") or [])
                relationship_pairs.append({
                    "record_type": "relationship",
                    "record_a": serialized_a,
                    "record_b": serialized_b,
                    "same_assertion": True,
                    # Compare the complete first-class provenance inventory.  The legacy
                    # RelationshipEdge.evidence_id compatibility pointer is deliberately
                    # excluded so reconciliation remains correct once that column is removed.
                    "provenance_differs": (
                        evidence_a != evidence_b
                        or statement_sources_a != statement_sources_b
                        or a.relationship_entity_id != b.relationship_entity_id
                    ),
                    "latest_decision": decision,
                })

    unresolved = sum(1 for row in statement_pairs + relationship_pairs if row["latest_decision"] is None or row["latest_decision"].decision == "unsure")
    return {
        "entity_id": entity.id,
        "statement_duplicates": statement_pairs,
        "relationship_duplicates": relationship_pairs,
        "summary": {
            "statement_pairs": len(statement_pairs),
            "relationship_pairs": len(relationship_pairs),
            "unresolved_pairs": unresolved,
        },
    }


def record_post_merge_reconciliation(
    db: Session,
    entity: Entity,
    *,
    record_type: str,
    record_a_id: str,
    record_b_id: str,
    decision: str,
    rationale: str | None = None,
    preferred_record_id: str | None = None,
) -> PostMergeReconciliationDecision:
    if record_type not in {"statement", "relationship"}:
        raise ValueError("Record type must be statement or relationship")
    if decision not in {"duplicate", "keep_separate", "unsure"}:
        raise ValueError("Decision must be duplicate, keep_separate, or unsure")
    if record_a_id == record_b_id:
        raise ValueError("Reconciliation records must be different")
    if entity.merged_into_entity_id:
        raise ValueError("Reconciliation decisions must be recorded on the active canonical entity")
    if preferred_record_id is not None:
        if decision != "duplicate":
            raise ValueError("A preferred record can only be selected for a duplicate decision")
        if preferred_record_id not in {record_a_id, record_b_id}:
            raise ValueError("Preferred record must be one of the duplicate pair")

    if record_type == "statement":
        a, b = db.get(Statement, record_a_id), db.get(Statement, record_b_id)
        if a is None or b is None or a.entity_id != entity.id or b.entity_id != entity.id:
            raise ValueError("Both statements must belong to the active canonical entity")
        if (_norm(a.prop), _norm(a.value)) != (_norm(b.prop), _norm(b.value)):
            raise ValueError("Statements are not a detected duplicate assertion")
    else:
        a, b = db.get(RelationshipEdge, record_a_id), db.get(RelationshipEdge, record_b_id)
        if a is None or b is None or a.investigation_id != entity.investigation_id or b.investigation_id != entity.investigation_id:
            raise ValueError("Both relationships must belong to the same investigation")
        for edge in (a, b):
            if entity.id not in {edge.source_entity_id, edge.target_entity_id}:
                raise ValueError("Both relationships must involve the active canonical entity")
        key_a = (_norm(a.schema), a.source_entity_id, a.target_entity_id, _norm(a.source_prop), _norm(a.target_prop))
        key_b = (_norm(b.schema), b.source_entity_id, b.target_entity_id, _norm(b.source_prop), _norm(b.target_prop))
        if key_a != key_b:
            raise ValueError("Relationships are not a detected duplicate edge")

    x, y = _pair(record_a_id, record_b_id)
    row = PostMergeReconciliationDecision(
        investigation_id=entity.investigation_id,
        entity_id=entity.id,
        record_type=record_type,
        record_a_id=x,
        record_b_id=y,
        decision=decision,
        rationale=rationale,
        preferred_record_id=preferred_record_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def reconciliation_preference_map(db: Session, investigation_id: str, record_type: str) -> dict[str, dict]:
    """Map duplicate records to their preferred/suppressed reconciliation state using immutable latest decisions."""
    rows = db.scalars(select(PostMergeReconciliationDecision).where(
        PostMergeReconciliationDecision.investigation_id == investigation_id,
        PostMergeReconciliationDecision.record_type == record_type,
    ).order_by(PostMergeReconciliationDecision.created_at.desc())).all()
    seen = set(); out = {}
    for row in rows:
        pair = (row.record_type, * _pair(row.record_a_id, row.record_b_id))
        if pair in seen:
            continue
        seen.add(pair)
        if row.decision != "duplicate" or not row.preferred_record_id:
            continue
        secondary = row.record_b_id if row.preferred_record_id == row.record_a_id else row.record_a_id
        payload = {"decision_id": row.id, "decision": row.decision, "preferred_record_id": row.preferred_record_id, "secondary_record_id": secondary, "rationale": row.rationale}
        out[row.preferred_record_id] = {**payload, "is_preferred": True, "suppressed_duplicate": False}
        out[secondary] = {**payload, "is_preferred": False, "suppressed_duplicate": True}
    return out
