from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.domain import Entity, RelationshipEdge, Statement, Evidence, Source, ClaimEvidenceLink, Claim, RelationshipEvidenceReviewEvent, RelationshipEvidenceAttachment
from app.services.ftm import make_ftm_entity

# FollowTheMoney edge semantics. These property names are the entity-reference
# fields defined by the FtM model, not application-specific aliases.
RELATIONSHIP_SCHEMAS = {
    "Ownership": {
        "source_prop": "owner",
        "target_prop": "asset",
        "source_label": "Owner",
        "target_label": "Asset",
        "label": "Ownership",
    },
    "Directorship": {
        "source_prop": "director",
        "target_prop": "organization",
        "source_label": "Director",
        "target_label": "Organization",
        "label": "Directorship",
    },
    "Membership": {
        "source_prop": "member",
        "target_prop": "organization",
        "source_label": "Member",
        "target_label": "Organization",
        "label": "Membership",
    },
    "Employment": {
        "source_prop": "employee",
        "target_prop": "employer",
        "source_label": "Employee",
        "target_label": "Employer",
        "label": "Employment",
    },
    "UnknownLink": {
        "source_prop": "subject",
        "target_prop": "object",
        "source_label": "Subject",
        "target_label": "Object",
        "label": "Other link",
    },
}


def relationship_schema_info(schema: str) -> dict:
    info = RELATIONSHIP_SCHEMAS.get(schema)
    if info is None:
        raise ValueError(f"Unsupported relationship schema: {schema}")
    return info


def relationship_caption(schema: str, source: Entity, target: Entity, properties: dict[str, list[str]]) -> str:
    info = relationship_schema_info(schema)
    role_values = properties.get("role") or []
    role = role_values[0] if role_values else None
    middle = role or info["label"]
    return f"{source.caption} — {middle} → {target.caption}"


def create_relationship(
    db: Session,
    *,
    investigation_id: str,
    schema: str,
    source_entity_id: str,
    target_entity_id: str,
    properties: dict[str, list[str]] | None = None,
    dataset: str = "reporter",
    origin: str | None = None,
    evidence_id: str | None = None,
    commit: bool = True,
) -> RelationshipEdge:
    info = relationship_schema_info(schema)
    source = db.get(Entity, source_entity_id)
    target = db.get(Entity, target_entity_id)
    if source is None or target is None:
        raise ValueError("Relationship endpoints must reference existing entities")
    if source.investigation_id != investigation_id or target.investigation_id != investigation_id:
        raise ValueError("Relationship endpoints must belong to the same investigation")
    if source.id == target.id:
        raise ValueError("A relationship must connect two different canonical entities")
    if evidence_id is not None:
        evidence = db.get(Evidence, evidence_id)
        if evidence is None:
            raise ValueError("Relationship evidence not found")
        evidence_source = db.get(Source, evidence.source_id)
        if evidence_source is None or evidence_source.investigation_id != investigation_id:
            raise ValueError("Relationship evidence must belong to the same investigation")

    props = {key: list(values) for key, values in (properties or {}).items()}
    # Endpoint references are authoritative and cannot be overridden by request properties.
    props[info["source_prop"]] = [source.ftm_id]
    props[info["target_prop"]] = [target.ftm_id]
    caption = relationship_caption(schema, source, target, props)
    ftm = make_ftm_entity(schema, caption, props)

    rel_entity = Entity(
        investigation_id=investigation_id,
        ftm_id=ftm["id"],
        schema=ftm["schema"],
        caption=caption,
        properties=ftm["properties"],
    )
    db.add(rel_entity)
    db.flush()
    for prop, values in ftm["properties"].items():
        for value in values:
            db.add(Statement(
                entity_id=rel_entity.id,
                prop=prop,
                value=value,
                dataset=dataset,
                origin=origin,
                original_value=value,
            ))

    edge = RelationshipEdge(
        investigation_id=investigation_id,
        relationship_entity_id=rel_entity.id,
        schema=schema,
        source_entity_id=source.id,
        target_entity_id=target.id,
        source_prop=info["source_prop"],
        target_prop=info["target_prop"],
    )
    db.add(edge)
    db.flush()
    if evidence_id is not None:
        db.add(RelationshipEvidenceAttachment(relationship_edge_id=edge.id, evidence_id=evidence_id, attached_by="creation"))
    if commit:
        db.commit()
        db.refresh(edge)
    else:
        db.flush()
    return edge


def attach_relationship_evidence(db: Session, edge: RelationshipEdge, *, evidence_id: str, note: str | None = None) -> RelationshipEvidenceAttachment:
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise ValueError("Evidence not found")
    source = db.get(Source, evidence.source_id)
    if source is None or source.investigation_id != edge.investigation_id:
        raise ValueError("Evidence must belong to the relationship investigation")
    existing = db.scalar(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == edge.id, RelationshipEvidenceAttachment.evidence_id == evidence_id))
    if existing is not None:
        return existing
    row = RelationshipEvidenceAttachment(relationship_edge_id=edge.id, evidence_id=evidence_id, attached_by="reporter", note=(note or "").strip() or None)
    db.add(row); db.commit(); db.refresh(row)
    return row

def relationship_evidence_attachments(db: Session, edge: RelationshipEdge) -> list[RelationshipEvidenceAttachment]:
    return list(db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == edge.id).order_by(RelationshipEvidenceAttachment.created_at, RelationshipEvidenceAttachment.id)).all())

RELATIONSHIP_EVIDENCE_STANCES = {"supports", "contradicts", "context", "superseded", "unresolved"}

def review_relationship_evidence(db: Session, edge: RelationshipEdge, *, evidence_id: str, stance: str, rationale: str) -> RelationshipEvidenceReviewEvent:
    if stance not in RELATIONSHIP_EVIDENCE_STANCES:
        raise ValueError(f"Unsupported relationship evidence stance: {stance}")
    if not rationale.strip():
        raise ValueError("Reporter rationale is required")
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise ValueError("Evidence not found")
    source = db.get(Source, evidence.source_id)
    if source is None or source.investigation_id != edge.investigation_id:
        raise ValueError("Evidence must belong to the relationship investigation")
    attached = db.scalar(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == edge.id, RelationshipEvidenceAttachment.evidence_id == evidence_id))
    if attached is None:
        raise ValueError("Evidence is not directly attached to this relationship")
    event = RelationshipEvidenceReviewEvent(relationship_edge_id=edge.id, evidence_id=evidence_id, stance=stance, rationale=rationale.strip())
    db.add(event); db.commit(); db.refresh(event)
    return event

def relationship_evidence_review_history(db: Session, edge: RelationshipEdge) -> list[dict]:
    rows = db.scalars(select(RelationshipEvidenceReviewEvent).where(RelationshipEvidenceReviewEvent.relationship_edge_id == edge.id).order_by(RelationshipEvidenceReviewEvent.created_at, RelationshipEvidenceReviewEvent.id)).all()
    return [{"id": r.id, "relationship_edge_id": r.relationship_edge_id, "evidence_id": r.evidence_id, "stance": r.stance, "rationale": r.rationale, "created_at": r.created_at} for r in rows]

def serialize_relationship(db: Session, edge: RelationshipEdge) -> dict:
    source = db.get(Entity, edge.source_entity_id)
    target = db.get(Entity, edge.target_entity_id)
    rel = db.get(Entity, edge.relationship_entity_id)
    statements = []
    if rel is not None:
        for stmt in db.scalars(select(Statement).where(Statement.entity_id == rel.id).order_by(Statement.prop, Statement.value)).all():
            statements.append({
                "id": stmt.id, "prop": stmt.prop, "value": stmt.value,
                "dataset": stmt.dataset, "origin": stmt.origin,
                "original_value": stmt.original_value, "first_seen": stmt.first_seen, "last_seen": stmt.last_seen,
            })
    attachments = relationship_evidence_attachments(db, edge)
    attached_evidence: list[dict[str, Any]] = []
    for attachment in attachments:
        ev = db.get(Evidence, attachment.evidence_id)
        src = db.get(Source, ev.source_id) if ev else None
        reviews = [r for r in relationship_evidence_review_history(db, edge) if r["evidence_id"] == attachment.evidence_id]
        attached_evidence.append({"attachment_id": attachment.id, "attached_by": attachment.attached_by, "note": attachment.note, "created_at": attachment.created_at, "evidence": None if ev is None else {"id": ev.id, "quote": ev.quote, "locator": ev.locator, "notes": ev.notes, "source": None if src is None else {"id": src.id, "title": src.title, "url": src.url, "source_type": src.source_type}}, "latest_review": reviews[-1] if reviews else None})
    evidence_review_history = relationship_evidence_review_history(db, edge)
    latest_evidence_review = evidence_review_history[-1] if evidence_review_history else None
    provenance_sources = sorted({
        f"{stmt['dataset']}|{stmt['origin'] or ''}" for stmt in statements
    })
    claim_dependencies = []
    attached_evidence_ids = {attachment.evidence_id for attachment in attachments}
    if attached_evidence_ids:
        links = db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_(attached_evidence_ids))).all()
        for link in links:
            claim = db.get(Claim, link.claim_id)
            if claim is not None:
                claim_dependencies.append({"claim_id": claim.id, "evidence_id": link.evidence_id, "text": claim.text, "status": claim.status, "confidence": claim.confidence, "stance": link.stance, "note": link.note, "needs_review": claim.status in {"disputed", "rejected"}})
    disputed_count = sum(1 for row in claim_dependencies if row["status"] == "disputed")
    rejected_count = sum(1 for row in claim_dependencies if row["status"] == "rejected")
    healthy_support = [row for row in claim_dependencies if row["stance"] == "supports" and row["status"] not in {"disputed", "rejected"}]
    challenged_support = [row for row in claim_dependencies if row["stance"] == "supports" and row["status"] in {"disputed", "rejected"}]
    # Advisory is intentionally non-destructive. A challenged claim is disclosed even when
    # another independently reviewed supporting claim remains healthy.
    if challenged_support and healthy_support:
        support_state = "mixed_support"
    elif challenged_support:
        support_state = "challenged_support"
    elif healthy_support:
        support_state = "independent_support"
    elif claim_dependencies:
        support_state = "no_supporting_claim"
    else:
        support_state = "no_claim_dependency"
    evidence_review_counts = {stance: 0 for stance in ("supports", "contradicts", "context", "superseded", "unresolved", "unreviewed")}
    for item in attached_evidence:
        latest = item["latest_review"]
        evidence_review_counts[latest["stance"] if latest else "unreviewed"] += 1
    advisory = {
        "needs_review": bool(challenged_support),
        "support_state": support_state,
        "has_independent_support": bool(healthy_support),
        "healthy_supporting_claim_count": len(healthy_support),
        "challenged_supporting_claim_count": len(challenged_support),
        "disputed_claim_count": disputed_count,
        "rejected_claim_count": rejected_count,
        "claim_dependencies": claim_dependencies,
        "relationship_evidence_review": latest_evidence_review,
        "relationship_evidence_needs_review": any(item["latest_review"] is None or item["latest_review"]["stance"] in {"contradicts", "unresolved"} for item in attached_evidence),
        "relationship_evidence_attachment_count": len(attached_evidence),
        "relationship_evidence_review_counts": evidence_review_counts,
    }
    return {
        "id": edge.id,
        "investigation_id": edge.investigation_id,
        "relationship_entity_id": edge.relationship_entity_id,
        "ftm_id": rel.ftm_id if rel else None,
        "schema": edge.schema,
        "source_prop": edge.source_prop,
        "target_prop": edge.target_prop,
        "source": None if source is None else {
            "id": source.id, "ftm_id": source.ftm_id, "schema": source.schema, "caption": source.caption,
        },
        "target": None if target is None else {
            "id": target.id, "ftm_id": target.ftm_id, "schema": target.schema, "caption": target.caption,
        },
        "caption": rel.caption if rel else None,
        "properties": rel.properties if rel else {},
        "statements": statements,
        "provenance": {
            "statement_count": len(statements),
            "sources": provenance_sources,
            "evidence_review_history": evidence_review_history,
            "evidence_attachments": attached_evidence,
        },
        "advisory": advisory,
        "created_at": edge.created_at,
    }


def _aggregate_reviewed_duplicate_provenance(preferred: dict, duplicate_rows: list[dict]) -> dict:
    """Build a read-only provenance inventory for a compact preferred edge.

    This does not merge or rewrite any underlying relationship/evidence record. It only
    lets the compact graph/dossier presentation disclose every reviewed duplicate source
    that sits beneath the preferred edge.
    """
    rows = [preferred, *duplicate_rows]
    statement_sources: set[str] = set()
    evidence_by_id: dict[str, dict] = {}
    statement_count = 0
    for row in rows:
        provenance = row.get("provenance") or {}
        statement_count += int(provenance.get("statement_count") or 0)
        statement_sources.update(provenance.get("sources") or [])
        for attachment in provenance.get("evidence_attachments") or []:
            evidence = attachment.get("evidence") or {}
            if evidence.get("id"):
                evidence_by_id[evidence["id"]] = evidence
    return {
        "presentation_only": True,
        "underlying_relationship_ids": [row["id"] for row in rows],
        "underlying_relationship_count": len(rows),
        "statement_count": statement_count,
        "statement_sources": sorted(statement_sources),
        "evidence_count": len(evidence_by_id),
        "evidence": list(evidence_by_id.values()),
    }


def _apply_reconciliation_view(
    db: Session,
    investigation_id: str,
    rows: list[dict],
    *,
    include_reconciled_duplicates: bool,
) -> tuple[list[dict], dict]:
    # Local import avoids a module cycle: post_merge_reconciliation serializes
    # relationship rows when building its reporter review queue.
    from app.services.post_merge_reconciliation import reconciliation_preference_map

    states = reconciliation_preference_map(db, investigation_id, "relationship")
    suppressed_by_preferred: dict[str, list[str]] = {}
    for record_id, state in states.items():
        if state.get("suppressed_duplicate") and state.get("preferred_record_id"):
            suppressed_by_preferred.setdefault(state["preferred_record_id"], []).append(record_id)

    row_by_id = {row["id"]: row for row in rows}
    visible: list[dict] = []
    suppressed_count = 0
    for row in rows:
        row_state = states.get(row["id"])
        reconciliation = None
        if row_state:
            reconciliation = {**row_state}
            reconciliation["suppressed_duplicate_ids"] = sorted(suppressed_by_preferred.get(row["id"], []))
            reconciliation["suppressed_duplicate_count"] = len(reconciliation["suppressed_duplicate_ids"])
            row["reconciliation"] = reconciliation
            if (
                not include_reconciled_duplicates
                and reconciliation.get("is_preferred")
                and reconciliation["suppressed_duplicate_ids"]
            ):
                duplicate_rows = [
                    row_by_id[record_id]
                    for record_id in reconciliation["suppressed_duplicate_ids"]
                    if record_id in row_by_id
                ]
                row["aggregate_provenance"] = _aggregate_reviewed_duplicate_provenance(row, duplicate_rows)
                # A reconciled presentation edge may have several preserved evidence records.
                # Compute an aggregate advisory so one challenged claim does not visually
                # contaminate the relationship when another reviewed evidence record has
                # a healthy supporting claim. No underlying edge or claim is modified.
                advisory_rows = [row, *duplicate_rows]
                deps = []
                healthy_evidence_ids = set()
                challenged_evidence_ids = set()
                for advisory_row in advisory_rows:
                    attached_ids = {(attachment.get("evidence") or {}).get("id") for attachment in ((advisory_row.get("provenance") or {}).get("evidence_attachments") or []) if (attachment.get("evidence") or {}).get("id")}
                    for dep in (advisory_row.get("advisory") or {}).get("claim_dependencies", []):
                        ev_id = dep.get("evidence_id")
                        deps.append({**dep, "relationship_id": advisory_row.get("id")})
                        if ev_id not in attached_ids or dep.get("stance") != "supports": continue
                        if dep.get("status") in {"disputed", "rejected"}: challenged_evidence_ids.add(ev_id)
                        else: healthy_evidence_ids.add(ev_id)
                if challenged_evidence_ids and healthy_evidence_ids:
                    aggregate_state = "mixed_independent_evidence"
                elif challenged_evidence_ids:
                    aggregate_state = "challenged_support"
                elif healthy_evidence_ids:
                    aggregate_state = "independent_support"
                else:
                    aggregate_state = "no_supporting_claim" if deps else "no_claim_dependency"
                row["advisory"] = {
                    "needs_review": bool(challenged_evidence_ids),
                    "support_state": aggregate_state,
                    "has_independent_support": bool(healthy_evidence_ids),
                    "healthy_supporting_evidence_count": len(healthy_evidence_ids),
                    "challenged_supporting_evidence_count": len(challenged_evidence_ids),
                    "disputed_claim_count": sum(1 for dep in deps if dep.get("status") == "disputed"),
                    "rejected_claim_count": sum(1 for dep in deps if dep.get("status") == "rejected"),
                    "claim_dependencies": deps,
                    "presentation_aggregate": True,
                }
        if row_state and row_state.get("suppressed_duplicate") and not include_reconciled_duplicates:
            suppressed_count += 1
            continue
        visible.append(row)

    return visible, {
        "collapsed_by_default": not include_reconciled_duplicates,
        "suppressed_duplicate_count": suppressed_count,
        "underlying_edge_count": len(rows),
        "visible_edge_count": len(visible),
    }


def investigation_relationships(
    db: Session,
    investigation_id: str,
    schemas: set[str] | None = None,
    *,
    include_reconciled_duplicates: bool = True,
) -> list[dict]:
    stmt = select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id)
    if schemas:
        stmt = stmt.where(RelationshipEdge.schema.in_(schemas))
    edges = db.scalars(stmt.order_by(RelationshipEdge.created_at.desc())).all()
    rows = [serialize_relationship(db, edge) for edge in edges]
    rows, _ = _apply_reconciliation_view(
        db, investigation_id, rows, include_reconciled_duplicates=include_reconciled_duplicates
    )
    return rows


def entity_relationships(
    db: Session,
    entity_id: str,
    *,
    include_reconciled_duplicates: bool = True,
) -> list[dict]:
    edges = db.scalars(
        select(RelationshipEdge)
        .where(or_(RelationshipEdge.source_entity_id == entity_id, RelationshipEdge.target_entity_id == entity_id))
        .order_by(RelationshipEdge.created_at.desc())
    ).all()
    rows = []
    for edge in edges:
        row = serialize_relationship(db, edge)
        row["direction"] = "outgoing" if edge.source_entity_id == entity_id else "incoming"
        rows.append(row)
    rows, _ = _apply_reconciliation_view(
        db, edges[0].investigation_id if edges else "", rows,
        include_reconciled_duplicates=include_reconciled_duplicates,
    ) if rows else (rows, {"collapsed_by_default": not include_reconciled_duplicates, "suppressed_duplicate_count": 0, "underlying_edge_count": 0, "visible_edge_count": 0})
    return rows


def investigation_graph(
    db: Session,
    investigation_id: str,
    schemas: set[str] | None = None,
    *,
    include_reconciled_duplicates: bool = False,
) -> dict:
    # Relationship entities are represented as edges; canonical endpoint entities are nodes.
    stmt = select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id)
    if schemas:
        stmt = stmt.where(RelationshipEdge.schema.in_(schemas))
    edge_models = db.scalars(stmt.order_by(RelationshipEdge.created_at.desc())).all()
    raw_edges = [serialize_relationship(db, edge) for edge in edge_models]
    edges, reconciliation = _apply_reconciliation_view(
        db, investigation_id, raw_edges,
        include_reconciled_duplicates=include_reconciled_duplicates,
    )
    endpoint_ids = {e["source"]["id"] for e in edges if e["source"]} | {e["target"]["id"] for e in edges if e["target"]}
    nodes = []
    if endpoint_ids:
        entities = db.scalars(select(Entity).where(Entity.id.in_(endpoint_ids)).order_by(Entity.caption)).all()
        nodes = [
            {"id": e.id, "ftm_id": e.ftm_id, "caption": e.caption, "schema": e.schema, "properties": e.properties or {}}
            for e in entities
        ]
    return {"nodes": nodes, "edges": edges, "schemas": sorted({edge["schema"] for edge in edges}), "reconciliation": reconciliation}
