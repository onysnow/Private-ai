from __future__ import annotations
from typing import Any

import hashlib
import json
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Entity, Statement, LeadLink, TimelineEvent, ResolutionDecision, StatementAssessment,
    StatementPromotion, EnrichmentSession, CrossProviderDecision, RelationshipEdge,
    ExternalRelationshipReview, CanonicalResolutionDecision, CanonicalEntityMergeAudit,
)

REFERENCE_SPECS = (
    ("statements", Statement, "entity_id"),
    ("lead_links", LeadLink, "entity_id"),
    ("timeline_entity", TimelineEvent, "entity_id"),
    ("timeline_relationship_entity", TimelineEvent, "relationship_entity_id"),
    ("resolution_decisions", ResolutionDecision, "entity_id"),
    ("statement_assessments", StatementAssessment, "entity_id"),
    ("statement_promotions", StatementPromotion, "entity_id"),
    ("enrichment_sessions", EnrichmentSession, "entity_id"),
    ("cross_provider_decisions", CrossProviderDecision, "entity_id"),
    ("relationship_sources", RelationshipEdge, "source_entity_id"),
    ("relationship_targets", RelationshipEdge, "target_entity_id"),
    ("external_relationship_sources", ExternalRelationshipReview, "source_entity_id"),
    ("external_relationship_targets", ExternalRelationshipReview, "target_entity_id"),
)


def _latest_same_decision(db: Session, source: Entity, target: Entity) -> Any:
    a, b = sorted((source.id, target.id))
    return db.scalars(select(CanonicalResolutionDecision).where(
        CanonicalResolutionDecision.investigation_id == source.investigation_id,
        CanonicalResolutionDecision.entity_a_id == a,
        CanonicalResolutionDecision.entity_b_id == b,
    ).order_by(CanonicalResolutionDecision.created_at.desc())).first()


def _ensure_pair(source: Entity | None, target: Entity | None) -> None:
    if source is None or target is None:
        raise ValueError("Entity not found")
    if source.id == target.id:
        raise ValueError("Source and target entities must be different")
    if source.investigation_id != target.investigation_id:
        raise ValueError("Both entities must belong to the same investigation")
    if source.merged_into_entity_id:
        raise ValueError("Source entity has already been merged")
    if target.merged_into_entity_id:
        raise ValueError("Target entity is itself a merged alias")


def preview_entity_merge(db: Session, source: Entity, target: Entity) -> dict:
    _ensure_pair(source, target)
    decision = _latest_same_decision(db, source, target)
    refs = {}
    digest_rows = []
    for name, model, field_name in REFERENCE_SPECS:
        field = getattr(model, field_name)
        rows = list(db.scalars(select(model).where(field == source.id)).all())
        # REFERENCE_SPECS mixes several unrelated model classes in one tuple, so mypy
        # widens `model` (and thus `rows`) to the shared declarative Base, which has no
        # `id` attribute of its own -- every concrete model here does declare one.
        ids = sorted(row.id for row in rows)  # type: ignore[attr-defined]
        refs[name] = {"count": len(ids), "record_ids": ids[:100]}
        digest_rows.append((name, ids))

    blockers = []
    rel_pair = list(db.scalars(select(RelationshipEdge).where(
        RelationshipEdge.investigation_id == source.investigation_id,
        (((RelationshipEdge.source_entity_id == source.id) & (RelationshipEdge.target_entity_id == target.id)) |
         ((RelationshipEdge.source_entity_id == target.id) & (RelationshipEdge.target_entity_id == source.id)))
    )).all())
    if rel_pair:
        blockers.append({"code": "relationship_self_loop", "record_ids": sorted(x.id for x in rel_pair), "message": "Merge would collapse an existing canonical relationship into a self-loop."})
    review_pair = list(db.scalars(select(ExternalRelationshipReview).where(
        ExternalRelationshipReview.investigation_id == source.investigation_id,
        (((ExternalRelationshipReview.source_entity_id == source.id) & (ExternalRelationshipReview.target_entity_id == target.id)) |
         ((ExternalRelationshipReview.source_entity_id == target.id) & (ExternalRelationshipReview.target_entity_id == source.id)))
    )).all())
    if review_pair:
        blockers.append({"code": "external_review_self_loop", "record_ids": sorted(x.id for x in review_pair), "message": "Merge would collapse an external relationship review into a self-loop."})

    digest_payload = {
        "source_entity_id": source.id,
        "target_entity_id": target.id,
        "refs": digest_rows,
        "blockers": blockers,
        "resolution_decision_id": decision.id if decision else None,
        "resolution_decision": decision.decision if decision else None,
    }
    digest = hashlib.sha256(json.dumps(digest_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "source": {"id": source.id, "caption": source.caption, "schema": source.schema},
        "target": {"id": target.id, "caption": target.caption, "schema": target.schema},
        "resolution": None if decision is None else {"id": decision.id, "decision": decision.decision, "confidence": decision.confidence, "rationale": decision.rationale},
        "references": refs,
        "total_references": sum(v["count"] for v in refs.values()),
        "blockers": blockers,
        "can_execute": bool(decision and decision.decision == "same" and not blockers),
        "preview_digest": digest,
    }


def execute_entity_merge(db: Session, source: Entity, target: Entity, *, preview_digest: str, rationale: str | None = None) -> CanonicalEntityMergeAudit:
    preview = preview_entity_merge(db, source, target)
    if preview["preview_digest"] != preview_digest:
        raise ValueError("Merge preview is stale; generate a fresh preview before executing")
    if not preview["resolution"] or preview["resolution"]["decision"] != "same":
        raise ValueError("A latest canonical resolution decision of 'same' is required before merging")
    if preview["blockers"]:
        raise ValueError("Merge has unresolved blockers and cannot be executed")

    moved = {}
    try:
        for name, model, field_name in REFERENCE_SPECS:
            field = getattr(model, field_name)
            rows = list(db.scalars(select(model).where(field == source.id)).all())
            for row in rows:
                setattr(row, field_name, target.id)
            moved[name] = len(rows)
        source.merged_into_entity_id = target.id
        source.canonical_id = target.canonical_id or target.ftm_id
        audit = CanonicalEntityMergeAudit(
            investigation_id=source.investigation_id,
            source_entity_id=source.id,
            target_entity_id=target.id,
            resolution_decision_id=preview["resolution"]["id"],
            preview_digest=preview_digest,
            preview_json=preview,
            moved_counts_json=moved,
            rationale=rationale,
        )
        db.add(audit)
        db.commit()
        db.refresh(audit)
        return audit
    except Exception:
        db.rollback()
        raise
