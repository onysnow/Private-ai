""""Expand in the corpus": what OpenAleph holds around one confirmed entity
(ADR-0006, Wave B, item 3).

GET /api/2/entities/{id}/expand (aleph/views/entities_api.py expand,
aleph/logic/expand.py) answers, per property of the entity, the entities
linked to it: the edge entities that point at it (an Ownership, a
Directorship) and the entities at their far ends. The entity is asked about
under each OpenAleph identity it has: its own copy in the investigation's
collection, and every OpenAleph entity a reporter decided is the same one
(a cross-reference "Same entity", recorded as a connector finding with a
positive resolution).

Nothing here becomes a record. Each edge becomes a relationship finding and
each far end a finding, both from provider "openaleph", through the existing
connector pipeline (persist_connector_findings: a lead per new finding), so
the relationship goes through the existing external-relationship review
(relationship_endpoint_candidates -> create_review -> promote_review) like
one from any other provider. The investigation's own records in the reply
are left out: they are already confirmed.

OpenAleph's ``nearby`` (GET /api/2/entities/{id}/nearby) is not used: it is
a geographic search around an Address entity with a latitude and longitude
(aleph/views/entities_api.py nearby) and answers 400 for anything else, so it
adds nothing for the people and companies reporters expand.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import ExternalFinding
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import ConnectorFinding, ConnectorRun, Entity, OpenAlephEntityLink, ResolutionDecision
from app.services.connectors import persist_connector_findings
from app.services.cross_references import openaleph_url
from app.services.openaleph_corpus import PROVIDER, record_openaleph_operation_failure
from app.services.openaleph_gateway import CorpusGateway
from app.services.relationships import RELATIONSHIP_SCHEMAS

OPERATION_EXPAND = "corpus_expand"


class NotInCorpus(LookupError):
    """The entity has no OpenAleph identity to expand from yet."""


def _value(value: Any) -> str | None:
    """A property value as a plain string; an entity reference may come back
    as the nested entity (aleph/views/serializers.py), which stands for its id."""
    if isinstance(value, dict):
        nested = value.get("id")
        return str(nested) if nested else None
    if isinstance(value, (str, int, float)):
        return str(value)
    return None


def _properties(entity: dict[str, Any]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    raw = entity.get("properties")
    for prop, values in (raw.items() if isinstance(raw, dict) else []):
        kept = [text for text in (_value(item) for item in (values if isinstance(values, list) else [values])) if text]
        if kept:
            out[str(prop)] = kept
    return out


def _caption(entity: dict[str, Any], properties: dict[str, list[str]]) -> str:
    if entity.get("caption"):
        return str(entity["caption"])[:512]
    for prop in ("name", "title", "summary"):
        if properties.get(prop):
            return properties[prop][0][:512]
    return str(entity.get("schema") or entity.get("id"))


def _collection(entity: dict[str, Any]) -> dict[str, Any]:
    nested = entity.get("collection")
    collection: dict[str, Any] = nested if isinstance(nested, dict) else {}
    return {"collection_id": str(entity.get("collection_id") or collection.get("id") or "") or None,
            "collection_label": collection.get("label")}


def openaleph_identities(db: Session, entity: Entity) -> list[str]:
    """The OpenAleph entities this confirmed entity is: its own copy in the
    investigation's collection, then those a reporter decided are the same
    (latest resolution positive)."""
    ids: list[str] = []
    link = db.scalar(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == entity.id))
    if link is not None:
        ids.append(link.openaleph_entity_id)
    findings = db.scalars(select(ConnectorFinding).where(
        ConnectorFinding.investigation_id == entity.investigation_id, ConnectorFinding.provider == PROVIDER)).all()
    for finding in findings:
        latest = db.scalar(select(ResolutionDecision).where(
            ResolutionDecision.finding_id == finding.id, ResolutionDecision.entity_id == entity.id)
            .order_by(ResolutionDecision.created_at.desc(), ResolutionDecision.id.desc()))
        if latest is not None and latest.decision == "positive" and finding.provider_record_id not in ids:
            ids.append(finding.provider_record_id)
    return ids


def _finding(entity: dict[str, Any], *, anchor: str, via: str) -> ExternalFinding:
    properties = _properties(entity)
    entity_id = str(entity["id"])
    return ExternalFinding(
        provider=PROVIDER, record_id=entity_id, caption=_caption(entity, properties), schema=str(entity.get("schema") or "") or None,
        url=openaleph_url(entity_id), properties=properties,
        raw={**_collection(entity), "expanded_from": anchor, "property": via},
    )


def expand_in_corpus(db: Session, entity: Entity, *, gateway: CorpusGateway) -> dict[str, Any]:
    """Ask OpenAleph what surrounds the entity and propose it for review.

    Raises NotInCorpus when the entity has no OpenAleph identity yet, and
    lets OpenAleph's errors through after recording them (the run is marked
    failed and an operation failure is kept)."""
    if entity.merged_into_entity_id:
        raise ValueError("This entity was merged into another record; expand the record that stayed")
    identities = openaleph_identities(db, entity)
    if not identities:
        raise NotInCorpus("This entity is not in OpenAleph yet: sync the corpus, or decide a cross-reference first")
    ours = {row for row in db.scalars(select(OpenAlephEntityLink.openaleph_entity_id).where(
        OpenAlephEntityLink.investigation_id == entity.investigation_id))}
    investigation_id, entity_id = entity.investigation_id, entity.id
    run = ConnectorRun(investigation_id=investigation_id, provider=PROVIDER, query=f"expand: {entity.caption}"[:2000])
    db.add(run); db.commit(); db.refresh(run)
    found: dict[str, ExternalFinding] = {}
    kinds: dict[str, str] = {}
    skipped = 0
    try:
        for anchor in identities:
            for row in gateway.expand(anchor, limit=settings.openaleph_expand_limit):
                via = str(row.get("property") or "")
                for item in row.get("entities") or []:
                    if not isinstance(item, dict) or not item.get("id"):
                        continue
                    item_id = str(item["id"])
                    if item_id in ours or item_id in identities:
                        skipped += 1  # already one of the investigation's confirmed records
                        continue
                    if item_id not in found:
                        found[item_id] = _finding(item, anchor=anchor, via=via)
                        kinds[item_id] = "relationship" if item.get("schema") in RELATIONSHIP_SCHEMAS else "entity"
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"[:4000]
        db.rollback()
        failed = db.get(ConnectorRun, run.id)
        if failed is not None:
            failed.status, failed.error, failed.finished_at = "failed", message, utcnow_naive()
            db.commit()
        record_openaleph_operation_failure(db, investigation_id=investigation_id, document_id=None,
                                           operation=OPERATION_EXPAND, error=message)
        raise
    # Far ends first, so a relationship's ends are findings before it is reviewed.
    ordered = sorted(found.values(), key=lambda item: kinds[item.record_id] == "relationship")
    rows = persist_connector_findings(db, run, investigation_id, PROVIDER, ordered)
    return {
        "entity_id": entity_id,
        "run_id": run.id,
        "identities": identities,
        "relationships": sum(1 for row in rows if kinds.get(row.provider_record_id) == "relationship"),
        "neighbours": sum(1 for row in rows if kinds.get(row.provider_record_id) == "entity"),
        "skipped_own": skipped,
        "findings": [{
            "id": row.id, "kind": kinds.get(row.provider_record_id, "entity"), "caption": row.caption, "schema": row.schema,
            "provider_record_id": row.provider_record_id, "source_url": row.source_url, "review_status": row.review_status,
            "collection_label": (row.raw or {}).get("collection_label"),
        } for row in rows],
    }
