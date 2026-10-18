"""Email addresses and phone numbers found in documents (ADR-0006, Wave A).

OpenAleph's ftm-analyze finds them (``emailMentioned``, ``phoneMentioned``)
but cannot say whose they are, so each becomes an ``identifier`` proposal
(``openaleph_analysis.import_analysis_proposals``). Accepting one is the
reporter saying which entity it belongs to: the value is then added to that
entity as a reviewed FollowTheMoney statement (its ``email`` or ``phone``
property) whose origin is the exact place in the document. Nothing is
attached without that choice (ADR-0004, decision 1).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, Entity, ExtractionCandidate, RelationshipEdge, Statement
from app.services.entity_aliases import resolve_active_entity
from app.services.ftm import schema_has_property

IDENTIFIER_PROPERTIES = {"email": "email", "phone": "phone"}
IDENTIFIER_LABELS = {"email": "an email address", "phone": "a phone number"}


def _identifier(candidate: ExtractionCandidate) -> tuple[str, str, str]:
    """The proposal's kind, FtM property and value, or ValueError."""
    payload = candidate.payload if isinstance(candidate.payload, dict) else {}
    kind = payload.get("kind")
    value = str(payload.get("value") or "").strip()
    if candidate.candidate_type != "identifier" or kind not in IDENTIFIER_PROPERTIES or not value:
        raise ValueError("This proposal is not an email address or phone number")
    return str(kind), IDENTIFIER_PROPERTIES[str(kind)], value


def accept_identifier(db: Session, candidate: ExtractionCandidate, doc: Document, *, origin: str,
                      target_entity_id: str | None) -> Statement:
    """Add the proposal's value to the entity the reporter chose, as a
    statement pointing at the document place it came from. The caller sets
    the proposal's review fields and commits."""
    kind, prop, value = _identifier(candidate)
    label = IDENTIFIER_LABELS[kind]
    if not target_entity_id:
        raise ValueError(f"Choose which entity {label} belongs to before accepting it")
    target = db.get(Entity, target_entity_id)
    if target is None or target.investigation_id != doc.investigation_id:
        raise ValueError("The chosen entity is missing or outside this investigation")
    if target.merged_into_entity_id is not None:
        raise ValueError("The chosen entity was merged into another one; choose that one instead")
    if not schema_has_property(target.schema, prop):
        article = "An" if target.schema[:1].upper() in "AEIOU" else "A"
        raise ValueError(f"{article} {target.schema} cannot have {label}; choose a person, company or organisation")
    payload = candidate.payload if isinstance(candidate.payload, dict) else {}
    raw_provenance = payload.get("provenance")
    provenance: dict[str, Any] = raw_provenance if isinstance(raw_provenance, dict) else {}
    provider = str(provenance.get("provider") or "").strip()
    collection_id = str(provenance.get("collection_id") or "").strip()
    dataset = (f"{provider}:{collection_id}" if collection_id else provider) if provider else f"document:{doc.id}"
    statement = Statement(entity_id=target.id, prop=prop, value=value, dataset=dataset, origin=origin,
                          original_value=str(payload.get("caption") or value))
    db.add(statement)
    db.flush()
    properties = {key: list(values) for key, values in (target.properties or {}).items()}
    current = properties.setdefault(prop, [])
    if value not in current:
        current.append(value)
    target.properties = properties
    return statement


def _entity_row(entity: Entity) -> dict[str, Any]:
    return {"entity_id": entity.id, "caption": entity.caption, "schema": entity.schema}


def identifier_targets(db: Session, candidate: ExtractionCandidate) -> dict[str, Any]:
    """The entities an email or phone proposal can be attached to, the
    document's own first: entities accepted from this document, then this
    document's entity proposals still waiting (accept one to attach to it),
    then every other entity in the investigation. Only schemas that have the
    property in FollowTheMoney are offered (a person, company or
    organisation has an email; an address or bank account does not)."""
    kind, prop, value = _identifier(candidate)
    doc_entities: list[dict[str, Any]] = []
    proposals: list[dict[str, Any]] = []
    listed: set[str] = set()
    rows = db.scalars(select(ExtractionCandidate).where(
        ExtractionCandidate.document_id == candidate.document_id,
        ExtractionCandidate.candidate_type == "entity",
    ).order_by(ExtractionCandidate.created_at)).all()
    for row in rows:
        payload = row.payload if isinstance(row.payload, dict) else {}
        if row.review_status == "accepted" and row.accepted_record_type == "entity" and row.accepted_record_id:
            active, _ = resolve_active_entity(db, db.get(Entity, row.accepted_record_id))
            if active is not None and active.id not in listed and schema_has_property(active.schema, prop):
                listed.add(active.id)
                doc_entities.append(_entity_row(active))
        elif row.review_status == "proposed":
            schema = str(payload.get("suggested_schema") or "Thing")
            if schema_has_property(schema, prop):
                proposals.append({"candidate_id": row.id, "caption": str(payload.get("caption") or ""),
                                  "suggested_schema": schema, "schema_question": bool(payload.get("schema_question"))})
    relationship_ids = select(RelationshipEdge.relationship_entity_id).where(
        RelationshipEdge.investigation_id == candidate.investigation_id)
    others = db.scalars(select(Entity).where(
        Entity.investigation_id == candidate.investigation_id, Entity.merged_into_entity_id.is_(None),
        ~Entity.id.in_(relationship_ids),
    ).order_by(Entity.caption)).all()
    other_entities = [_entity_row(entity) for entity in others
                      if entity.id not in listed and schema_has_property(entity.schema, prop)]
    return {"candidate_id": candidate.id, "kind": kind, "property": prop, "value": value,
            "document_entities": doc_entities, "document_proposals": proposals, "other_entities": other_entities}
