from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    ConnectorFinding, Entity, ExternalRelationshipReview, ExternalRelationshipPromotion,
)
from app.services.relationships import RELATIONSHIP_SCHEMAS, create_relationship
from app.services.resolution import candidate_entities
from app.services.promotion import _dataset_name


def is_relationship_finding(finding: ConnectorFinding) -> bool:
    return bool(finding.schema in RELATIONSHIP_SCHEMAS)


def _external_refs(finding: ConnectorFinding) -> tuple[str, str]:
    info = RELATIONSHIP_SCHEMAS.get(finding.schema or "")
    if info is None:
        raise ValueError("Finding is not a supported FollowTheMoney relationship")
    props = finding.properties or {}
    source = props.get(info["source_prop"]) or []
    target = props.get(info["target_prop"]) or []
    if not source or not target:
        raise ValueError("External relationship is missing one or both endpoint references")
    return str(source[0]), str(target[0])


def _endpoint_finding(db: Session, finding: ConnectorFinding, record_id: str) -> ConnectorFinding | None:
    return db.scalar(select(ConnectorFinding).where(
        ConnectorFinding.investigation_id == finding.investigation_id,
        ConnectorFinding.provider == finding.provider,
        ConnectorFinding.provider_record_id == record_id,
    ).order_by(ConnectorFinding.created_at.desc()))


def relationship_endpoint_candidates(db: Session, finding: ConnectorFinding) -> dict:
    source_ref, target_ref = _external_refs(finding)
    result = {
        "schema": finding.schema,
        "source_prop": RELATIONSHIP_SCHEMAS[finding.schema]["source_prop"],
        "target_prop": RELATIONSHIP_SCHEMAS[finding.schema]["target_prop"],
        "source_external_id": source_ref,
        "target_external_id": target_ref,
        "source_candidates": [],
        "target_candidates": [],
    }
    for side, ref in (("source", source_ref), ("target", target_ref)):
        ext = _endpoint_finding(db, finding, ref)
        if ext is None:
            continue
        result[f"{side}_external_finding"] = {
            "id": ext.id, "caption": ext.caption, "schema": ext.schema,
            "provider_record_id": ext.provider_record_id, "source_url": ext.source_url,
        }
        result[f"{side}_candidates"] = candidate_entities(db, finding.investigation_id, ext.caption, ext.schema)
    return result


def create_review(db: Session, finding: ConnectorFinding, source_entity_id: str | None, target_entity_id: str | None, decision: str, note: str | None) -> ExternalRelationshipReview:
    if not is_relationship_finding(finding):
        raise ValueError("Finding is not a supported FollowTheMoney relationship")
    if decision not in {"supported", "conflicting", "unresolved", "rejected"}:
        raise ValueError("Invalid relationship review decision")
    for entity_id in (source_entity_id, target_entity_id):
        if entity_id:
            entity = db.get(Entity, entity_id)
            if entity is None or entity.investigation_id != finding.investigation_id:
                raise ValueError("Relationship endpoint must belong to this investigation")
    if decision == "supported" and (not source_entity_id or not target_entity_id):
        raise ValueError("Supported relationships require both canonical endpoints")
    row = ExternalRelationshipReview(
        investigation_id=finding.investigation_id, finding_id=finding.id, schema=finding.schema,
        source_entity_id=source_entity_id, target_entity_id=target_entity_id,
        decision=decision, note=note,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row


def promote_review(db: Session, review: ExternalRelationshipReview) -> ExternalRelationshipPromotion:
    if review.decision != "supported":
        raise ValueError("Only supported external relationships can be promoted")
    if not review.source_entity_id or not review.target_entity_id:
        raise ValueError("Canonical relationship endpoints are required before promotion")
    existing = db.scalar(select(ExternalRelationshipPromotion).where(ExternalRelationshipPromotion.review_id == review.id))
    if existing:
        return existing
    finding = db.get(ConnectorFinding, review.finding_id)
    if finding is None:
        raise ValueError("Source finding no longer exists")
    info = RELATIONSHIP_SCHEMAS[review.schema]
    props = {}
    for prop, values in (finding.properties or {}).items():
        if prop in {info["source_prop"], info["target_prop"]}:
            continue
        props[prop] = [str(v) for v in values]
    edge = create_relationship(
        db, investigation_id=review.investigation_id, schema=review.schema,
        source_entity_id=review.source_entity_id, target_entity_id=review.target_entity_id,
        properties=props, dataset=_dataset_name(finding), origin=finding.source_url,
    )
    row = ExternalRelationshipPromotion(
        investigation_id=review.investigation_id, finding_id=finding.id, review_id=review.id,
        relationship_edge_id=edge.id, relationship_entity_id=edge.relationship_entity_id,
        provider=finding.provider, source_url=finding.source_url,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row


def list_relationship_reviews(db: Session, finding_id: str) -> list[ExternalRelationshipReview]:
    return db.scalars(
        select(ExternalRelationshipReview).where(ExternalRelationshipReview.finding_id == finding_id).order_by(ExternalRelationshipReview.created_at.desc())
    ).all()
