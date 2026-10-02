import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import Entity, RelationshipEdge, CanonicalResolutionDecision
from app.services.entity_aliases import resolve_active_entity

def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()

def candidate_entities(db: Session, investigation_id: str, caption: str, schema: str | None) -> list[dict]:
    needle = set(_norm(caption).split())
    relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
    rows = db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None), ~Entity.id.in_(relationship_ids))).all()
    scored: list[dict[str, Any]] = []
    for row in rows:
        hay = set(_norm(row.caption).split())
        overlap = len(needle & hay) / max(1, len(needle | hay))
        exact = 1.0 if _norm(row.caption) == _norm(caption) and caption else 0.0
        schema_bonus = 0.15 if schema and row.schema == schema else 0.0
        score = min(1.0, max(overlap, exact) + schema_bonus)
        if score > 0:
            scored.append({"entity_id": row.id, "caption": row.caption, "schema": row.schema, "score": round(score, 4)})
    return sorted(scored, key=lambda x: x["score"], reverse=True)[:10]


FOUND_BY_NAME = "name_overlap"
FOUND_BY_XREF = "openaleph_xref"


def _with_cross_reference_matches(db: Session, entity: Entity, candidates: list[dict]) -> list[dict]:
    """Add OpenAleph's cross-referencing matches between this record and the
    investigation's other confirmed records (ADR-0006, Wave B): they are
    possible duplicates for this same review and merge flow, not a second
    one. A record both ways keeps the higher score; ``found_by`` says which."""
    from app.services.cross_references import duplicate_matches

    by_id = {row["entity_id"]: {**row, "found_by": [FOUND_BY_NAME]} for row in candidates}
    for match in duplicate_matches(db, entity.id):
        other_id = match.other_entity_id if match.entity_id == entity.id else match.entity_id
        other = db.get(Entity, other_id) if other_id else None
        if other is None or other.merged_into_entity_id or other.id == entity.id:
            continue
        row = by_id.get(other.id)
        if row is None:
            by_id[other.id] = {"entity_id": other.id, "caption": other.caption, "schema": other.schema,
                               "score": round(match.score, 4), "found_by": [FOUND_BY_XREF]}
        else:
            row["score"] = max(row["score"], round(match.score, 4))
            row["found_by"] = [FOUND_BY_NAME, FOUND_BY_XREF]
    return sorted(by_id.values(), key=lambda row: row["score"], reverse=True)


def canonical_duplicate_candidates(db: Session, entity: Entity) -> list[dict]:
    resolved_entity, _ = resolve_active_entity(db, entity)
    if resolved_entity is None:
        return []
    candidates = candidate_entities(db, resolved_entity.investigation_id, resolved_entity.caption, resolved_entity.schema)
    candidates = _with_cross_reference_matches(db, resolved_entity, candidates)
    latest: dict[str, CanonicalResolutionDecision] = {}
    rows = db.scalars(select(CanonicalResolutionDecision).where(
        CanonicalResolutionDecision.investigation_id == resolved_entity.investigation_id,
        ((CanonicalResolutionDecision.entity_a_id == resolved_entity.id) | (CanonicalResolutionDecision.entity_b_id == resolved_entity.id)),
    ).order_by(CanonicalResolutionDecision.created_at.desc())).all()
    for row in rows:
        other = row.entity_b_id if row.entity_a_id == resolved_entity.id else row.entity_a_id
        latest.setdefault(other, row)
    out = []
    for candidate in candidates:
        if candidate["entity_id"] == resolved_entity.id:
            continue
        decision = latest.get(candidate["entity_id"])
        out.append({**candidate, "latest_decision": None if decision is None else {
            "id": decision.id, "decision": decision.decision, "confidence": decision.confidence,
            "rationale": decision.rationale, "created_at": decision.created_at.isoformat(),
        }})
    return out


def record_canonical_resolution(db: Session, entity: Entity, other: Entity, *, decision: str, confidence: float, rationale: str | None, commit: bool = True) -> Any:
    if entity.id == other.id:
        raise ValueError("An entity cannot be resolved against itself")
    if entity.investigation_id != other.investigation_id:
        raise ValueError("Both entities must belong to the same investigation")
    a, b = sorted((entity.id, other.id))
    row = CanonicalResolutionDecision(
        investigation_id=entity.investigation_id, entity_a_id=a, entity_b_id=b,
        decision=decision, confidence=confidence, rationale=rationale,
    )
    db.add(row)
    if commit:
        db.commit(); db.refresh(row)
    else:
        db.flush()
    return row
