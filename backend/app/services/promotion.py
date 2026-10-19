from sqlalchemy import select
from sqlalchemy.orm import Session
from app.jobs.corpus import request_corpus_sync
from app.models.domain import (
    ConnectorFinding, Entity, ResolutionDecision, Statement, StatementAssessment, StatementPromotion,
)


def _dataset_name(finding: ConnectorFinding) -> str:
    raw = finding.raw or {}
    dataset = raw.get("dataset")
    if isinstance(dataset, str) and dataset.strip():
        return dataset.strip()[:255]
    datasets = raw.get("datasets")
    if isinstance(datasets, list) and datasets:
        first = datasets[0]
        if isinstance(first, str) and first.strip():
            return first.strip()[:255]
    collection = raw.get("collection")
    if isinstance(collection, dict):
        for key in ("label", "name", "id"):
            value = collection.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:255]
    return f"connector:{finding.provider}"


def promote_assessment(db: Session, assessment: StatementAssessment, note: str | None = None) -> StatementPromotion:
    if assessment.status != "accepted":
        raise ValueError("Only accepted statement assessments can be promoted")
    if not assessment.entity_id:
        raise ValueError("Assessment must target a canonical entity before promotion")

    existing = db.scalar(select(StatementPromotion).where(StatementPromotion.assessment_id == assessment.id))
    if existing:
        return existing

    finding = db.get(ConnectorFinding, assessment.finding_id)
    entity = db.get(Entity, assessment.entity_id)
    if finding is None or entity is None:
        raise ValueError("Assessment references missing finding or entity")

    # The assessment, the finding and the entity must belong to one investigation;
    # otherwise a reporter of case A could write a value into case B's entity.
    if finding.investigation_id != assessment.investigation_id or entity.investigation_id != assessment.investigation_id:
        raise ValueError("Assessment, finding and entity must belong to the same investigation")

    # The reporter's latest word on this finding and entity decides, not any past
    # "positive": a later "negative" or "unsure" withdraws the earlier agreement.
    latest_identity = db.scalar(select(ResolutionDecision).where(
        ResolutionDecision.finding_id == finding.id,
        ResolutionDecision.entity_id == entity.id,
    ).order_by(ResolutionDecision.created_at.desc(), ResolutionDecision.id.desc()))
    if latest_identity is None or latest_identity.decision != "positive":
        raise ValueError("A positive identity resolution is required before promotion")

    values = (finding.properties or {}).get(assessment.prop) or []
    if assessment.value not in values:
        raise ValueError("Assessed value is not present in the source finding")

    dataset = _dataset_name(finding)
    statement = Statement(
        entity_id=entity.id,
        prop=assessment.prop,
        value=assessment.value,
        dataset=dataset,
        origin=finding.source_url,
        original_value=assessment.value,
    )
    db.add(statement)
    db.flush()

    props = {key: list(vals) for key, vals in (entity.properties or {}).items()}
    prop_values = props.setdefault(assessment.prop, [])
    if assessment.value not in prop_values:
        prop_values.append(assessment.value)
    entity.properties = props

    promotion = StatementPromotion(
        investigation_id=assessment.investigation_id,
        finding_id=finding.id,
        assessment_id=assessment.id,
        entity_id=entity.id,
        statement_id=statement.id,
        provider=finding.provider,
        dataset=dataset,
        source_url=finding.source_url,
        original_value=assessment.value,
        reviewer_note=note or assessment.note,
    )
    db.add(promotion)
    db.commit()
    db.refresh(promotion)
    # The promoted value changed a confirmed entity: re-send it to the
    # OpenAleph collection (ADR-0006, Wave B).
    request_corpus_sync(db, promotion.investigation_id)
    return promotion
