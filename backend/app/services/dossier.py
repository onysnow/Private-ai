from __future__ import annotations

from collections import Counter
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.domain import (
    Entity, Statement, Source, Evidence, ClaimEvidenceLink, Claim, Lead, LeadLink,
    ConnectorFinding, ResolutionDecision, StatementAssessment, StatementPromotion,
    EnrichmentSession, EnrichmentSessionFinding, CrossProviderDecision, ReportingTask, RelationshipEdge,
    CanonicalResolutionDecision, CanonicalEntityMergeAudit, PropertyConflictDecision, RelationshipEvidenceAttachment,
)
from app.services.provenance import entity_statement_history
from app.services.relationships import entity_relationships
from app.services.timeline import investigation_timeline
from app.services.entity_aliases import resolve_active_entity, entity_alias_payload
from app.services.leads import serialize_task


def _terms(entity: Entity) -> list[str]:
    values = [entity.caption, entity.ftm_id]
    for key in ("name", "alias", "previousName", "weakAlias"):
        values.extend(str(v) for v in (entity.properties or {}).get(key, []) if v)
    seen = set()
    out = []
    for value in values:
        value = (value or "").strip()
        folded = value.casefold()
        if len(value) >= 3 and folded not in seen:
            seen.add(folded); out.append(value)
    return out


def _mention(text: str | None, terms: list[str]) -> list[str]:
    hay = (text or "").casefold()
    return [term for term in terms if term.casefold() in hay]


def entity_dossier(db: Session, entity_id: str) -> dict:
    requested = db.get(Entity, entity_id)
    if requested is None:
        raise ValueError("Entity not found")
    try:
        entity, alias_chain = resolve_active_entity(db, requested)
    except ValueError:
        raise
    if entity is None:
        raise ValueError("Entity not found")
    alias_resolution = entity_alias_payload(requested, entity, alias_chain)

    # Identity history is deliberately audit-oriented: canonical-resolution decisions
    # remain reporter judgments, while merges remain reversible-in-history aliases.
    canonical_decisions = db.scalars(select(CanonicalResolutionDecision).where(
        CanonicalResolutionDecision.investigation_id == entity.investigation_id,
        or_(CanonicalResolutionDecision.entity_a_id == entity.id, CanonicalResolutionDecision.entity_b_id == entity.id),
    ).order_by(CanonicalResolutionDecision.created_at.desc())).all()
    merge_audits = db.scalars(select(CanonicalEntityMergeAudit).where(
        CanonicalEntityMergeAudit.investigation_id == entity.investigation_id,
        or_(CanonicalEntityMergeAudit.source_entity_id == entity.id, CanonicalEntityMergeAudit.target_entity_id == entity.id),
    ).order_by(CanonicalEntityMergeAudit.created_at.desc())).all()
    merged_aliases = db.scalars(select(Entity).where(
        Entity.investigation_id == entity.investigation_id, Entity.merged_into_entity_id == entity.id
    ).order_by(Entity.created_at.asc())).all()
    identity_entity_ids = {entity.id}
    identity_entity_ids.update(a.id for a in merged_aliases)
    identity_entity_ids.update(d.entity_a_id for d in canonical_decisions)
    identity_entity_ids.update(d.entity_b_id for d in canonical_decisions)
    identity_entities = db.scalars(select(Entity).where(Entity.id.in_(identity_entity_ids))).all()
    identity_entity_by_id = {row.id: row for row in identity_entities}
    identity_history = {
        "canonical_entity_id": entity.id,
        "aliases": [{"id": row.id, "caption": row.caption, "schema": row.schema, "merged_into_entity_id": row.merged_into_entity_id} for row in merged_aliases],
        "canonical_decisions": [{
            "id": row.id, "decision": row.decision, "confidence": row.confidence, "rationale": row.rationale,
            "created_at": row.created_at,
            "other_entity": (lambda other: None if other is None else {
                "id": other.id, "caption": other.caption, "schema": other.schema
            })(identity_entity_by_id.get(row.entity_b_id if row.entity_a_id == entity.id else row.entity_a_id)),
        } for row in canonical_decisions],
        "merge_audits": [{
            "id": row.id, "source_entity_id": row.source_entity_id, "target_entity_id": row.target_entity_id,
            "resolution_decision_id": row.resolution_decision_id, "rationale": row.rationale,
            "moved_counts": row.moved_counts_json, "created_at": row.created_at,
        } for row in merge_audits],
        "unresolved_decision_count": sum(1 for row in canonical_decisions if row.decision == "unsure"),
    }
    terms = _terms(entity)

    statements = db.scalars(select(Statement).where(Statement.entity_id == entity.id)).all()
    all_relationships = entity_relationships(db, entity.id, include_reconciled_duplicates=True)
    relationships = entity_relationships(db, entity.id, include_reconciled_duplicates=False)
    suppressed_relationship_count = max(0, len(all_relationships) - len(relationships))

    sessions = db.scalars(
        select(EnrichmentSession).where(EnrichmentSession.entity_id == entity.id).order_by(EnrichmentSession.started_at.desc())
    ).all()
    session_ids = [s.id for s in sessions]
    enrichment_links = db.scalars(
        select(EnrichmentSessionFinding).where(EnrichmentSessionFinding.session_id.in_(session_ids))
    ).all() if session_ids else []

    decisions = db.scalars(
        select(ResolutionDecision).where(ResolutionDecision.entity_id == entity.id).order_by(ResolutionDecision.created_at.desc())
    ).all()
    assessments = db.scalars(
        select(StatementAssessment).where(StatementAssessment.entity_id == entity.id).order_by(StatementAssessment.created_at.desc())
    ).all()
    promotions = db.scalars(
        select(StatementPromotion).where(StatementPromotion.entity_id == entity.id).order_by(StatementPromotion.promoted_at.desc())
    ).all()
    cross_provider = db.scalars(
        select(CrossProviderDecision).where(CrossProviderDecision.entity_id == entity.id).order_by(CrossProviderDecision.created_at.desc())
    ).all()

    finding_ids = {link.finding_id for link in enrichment_links}
    finding_ids.update(d.finding_id for d in decisions)
    finding_ids.update(a.finding_id for a in assessments)
    findings = db.scalars(select(ConnectorFinding).where(ConnectorFinding.id.in_(finding_ids))).all() if finding_ids else []
    finding_by_id = {f.id: f for f in findings}

    # Build dossier relevance from explicit graph/evidence links first. Text mentions are
    # retained only as a discoverability fallback and are labelled as such.
    relationship_edge_ids = {r["id"] for r in all_relationships}
    relationship_edges = db.scalars(
        select(RelationshipEdge).where(RelationshipEdge.id.in_(relationship_edge_ids))
    ).all() if relationship_edge_ids else []
    relationship_attachments = db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id.in_(relationship_edge_ids))).all() if relationship_edge_ids else []
    relationship_evidence_ids = {attachment.evidence_id for attachment in relationship_attachments}

    sources = db.scalars(select(Source).where(Source.investigation_id == entity.investigation_id)).all()
    source_by_id = {s.id: s for s in sources}
    all_evidence = db.scalars(select(Evidence).where(Evidence.source_id.in_(source_by_id.keys()))).all() if source_by_id else []
    evidence_by_id = {e.id: e for e in all_evidence}

    all_claim_links = db.scalars(
        select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_(evidence_by_id.keys()))
    ).all() if evidence_by_id else []
    links_by_evidence = {}
    links_by_claim = {}
    for link in all_claim_links:
        links_by_evidence.setdefault(link.evidence_id, []).append(link)
        links_by_claim.setdefault(link.claim_id, []).append(link)

    relationship_claim_ids = {
        link.claim_id for evidence_id in relationship_evidence_ids
        for link in links_by_evidence.get(evidence_id, [])
    }
    explicit_lead_links = db.scalars(
        select(LeadLink).join(Lead, Lead.id == LeadLink.lead_id).where(Lead.investigation_id == entity.investigation_id)
    ).all()
    direct_lead_ids = {link.lead_id for link in explicit_lead_links if link.entity_id == entity.id}
    for link in explicit_lead_links:
        if link.relationship_id in relationship_edge_ids:
            direct_lead_ids.add(link.lead_id)
        if link.evidence_id in relationship_evidence_ids:
            direct_lead_ids.add(link.lead_id)
        if link.claim_id in relationship_claim_ids:
            direct_lead_ids.add(link.lead_id)

    explicit_claim_ids = set(relationship_claim_ids)
    explicit_evidence_ids = set(relationship_evidence_ids)
    for link in explicit_lead_links:
        if link.lead_id not in direct_lead_ids:
            continue
        if link.claim_id:
            explicit_claim_ids.add(link.claim_id)
        if link.evidence_id:
            explicit_evidence_ids.add(link.evidence_id)
        if link.source_id and link.source_id in source_by_id:
            explicit_evidence_ids.update(e.id for e in all_evidence if e.source_id == link.source_id)

    claims = []
    all_claims = db.scalars(select(Claim).where(Claim.investigation_id == entity.investigation_id).order_by(Claim.created_at.desc())).all()
    claim_by_id = {claim.id: claim for claim in all_claims}
    for claim in all_claims:
        matched = _mention(claim.text, terms)
        if claim.id in explicit_claim_ids:
            basis = {"type": "explicit_graph_context"}
        elif matched:
            basis = {"type": "text_mention", "terms": matched}
        else:
            continue
        claims.append({"claim": claim, "match_basis": basis})
        explicit_evidence_ids.update(link.evidence_id for link in links_by_claim.get(claim.id, []))

    evidence_rows = []
    for evidence in all_evidence:
        matched = _mention(" ".join(filter(None, [evidence.quote, evidence.notes, evidence.locator])), terms)
        related_links = links_by_evidence.get(evidence.id, [])
        related_dossier_links = [link for link in related_links if link.claim_id in {item["claim"].id for item in claims}]
        if evidence.id in relationship_evidence_ids:
            basis = {"type": "relationship_evidence"}
        elif evidence.id in explicit_evidence_ids:
            basis = {"type": "explicit_context"}
        elif related_dossier_links:
            basis = {"type": "linked_claim"}
        elif matched:
            basis = {"type": "text_mention", "terms": matched}
        else:
            continue
        evidence_rows.append({
            "evidence": evidence,
            "source": source_by_id.get(evidence.source_id),
            "match_basis": basis,
            "claim_links": [
                {"claim_id": link.claim_id, "stance": link.stance, "note": link.note}
                for link in related_links if link.claim_id in claim_by_id
            ],
        })

    leads = []
    all_leads = db.scalars(select(Lead).where(Lead.investigation_id == entity.investigation_id).order_by(Lead.created_at.desc())).all()
    dossier_lead_ids = set()
    for lead in all_leads:
        matched = _mention(" ".join(filter(None, [lead.title, lead.detail])), terms)
        if lead.id in direct_lead_ids:
            leads.append({"lead": lead, "match_basis": {"type": "explicit_lead_link"}})
            dossier_lead_ids.add(lead.id)
        elif matched:
            leads.append({"lead": lead, "match_basis": {"type": "text_mention", "terms": matched}})
            dossier_lead_ids.add(lead.id)

    task_rows = db.scalars(
        select(ReportingTask).where(ReportingTask.lead_id.in_(dossier_lead_ids)).order_by(ReportingTask.created_at.desc())
    ).all() if dossier_lead_ids else []
    tasks = [serialize_task(db, task) for task in task_rows]

    relationship_entity_ids = {r["relationship_entity_id"] for r in all_relationships}
    timeline_rows = []
    timeline = investigation_timeline(db, entity.investigation_id)
    for event in timeline["events"]:
        refs = event.get("refs") or {}
        if refs.get("entity_id") == entity.id or refs.get("relationship_entity_id") in relationship_entity_ids:
            timeline_rows.append(event)

    # Property conflicts are presentation-only diagnostics over the immutable statement ledger.
    # Multiple values are never collapsed or "resolved" by the dossier. A reporter preference
    # must come from an explicit review primitive; until then the conflict stays unresolved.
    statement_history = entity_statement_history(db, entity.id)
    property_groups = {}
    for row in statement_history:
        property_groups.setdefault(row["prop"], []).append(row)
    conflict_decisions = db.scalars(select(PropertyConflictDecision).where(
        PropertyConflictDecision.entity_id == entity.id
    ).order_by(PropertyConflictDecision.created_at.desc())).all()
    decisions_by_prop = {}
    for decision in conflict_decisions:
        decisions_by_prop.setdefault(decision.prop, []).append(decision)
    property_conflicts = []
    for prop, values in sorted(property_groups.items(), key=lambda item: item[0].lower()):
        canonical_values = [row for row in values if row.get("canonical")]
        has_external_conflict = any((row.get("conflict_count") or 0) > 0 or row.get("latest_status") == "conflicting" for row in values)
        if len(canonical_values) <= 1 and not has_external_conflict:
            continue
        reviews = decisions_by_prop.get(prop, [])
        latest = reviews[0] if reviews else None
        property_conflicts.append({
            "prop": prop,
            "status": latest.decision if latest else "unresolved",
            "preferred_value": latest.preferred_value if latest else None,
            "reason": "multiple_canonical_values" if len(canonical_values) > 1 else "external_conflict",
            "latest_decision": None if latest is None else {
                "id": latest.id, "decision": latest.decision, "values": latest.values_json,
                "preferred_value": latest.preferred_value, "rationale": latest.rationale, "temporal_intervals": latest.temporal_intervals_json or [], "created_at": latest.created_at,
            },
            "decision_history": [{
                "id": d.id, "decision": d.decision, "values": d.values_json,
                "preferred_value": d.preferred_value, "rationale": d.rationale, "temporal_intervals": d.temporal_intervals_json or [], "created_at": d.created_at,
            } for d in reviews],
            "values": [{
                "value": row["value"],
                "canonical": row.get("canonical", False),
                "support_count": row.get("support_count", 0),
                "conflict_count": row.get("conflict_count", 0),
                "latest_status": row.get("latest_status"),
                "canonical_statements": row.get("canonical_statements", []),
                "external_assessments": row.get("external_assessments", []),
            } for row in values],
        })

    relationship_counts = dict(Counter(r["schema"] for r in relationships))
    relationship_review_advisories = [r for r in relationships if (r.get("advisory") or {}).get("needs_review")]
    relationship_mixed_support = [r for r in relationships if (r.get("advisory") or {}).get("support_state") in {"mixed_support", "mixed_independent_evidence"}]
    finding_status_counts = dict(Counter(f.review_status for f in findings))
    claim_status_counts = dict(Counter(item["claim"].status for item in claims))

    return {
        "entity": entity,
        "alias_resolution": alias_resolution,
        "identity_history": identity_history,
        "summary": {
            "statement_count": len(statements),
            "property_conflict_count": len(property_conflicts),
            "identity_alias_count": len(merged_aliases),
            "identity_decision_count": len(canonical_decisions),
            "identity_unresolved_count": identity_history["unresolved_decision_count"],
            "relationship_count": len(relationships),
            "relationship_underlying_count": len(all_relationships),
            "relationship_suppressed_duplicate_count": suppressed_relationship_count,
            "relationship_schemas": relationship_counts,
            "relationship_review_advisory_count": len(relationship_review_advisories),
            "relationship_mixed_support_count": len(relationship_mixed_support),
            "claim_count": len(claims),
            "claim_statuses": claim_status_counts,
            "evidence_count": len(evidence_rows),
            "lead_count": len(leads),
            "task_count": len(tasks),
            "timeline_event_count": len(timeline_rows),
            "external_finding_count": len(findings),
            "external_finding_statuses": finding_status_counts,
            "enrichment_session_count": len(sessions),
            "unresolved_external_count": sum(1 for f in findings if f.review_status in {"unreviewed", "needs_followup"}),
        },
        "statement_history": statement_history,
        "property_conflicts": property_conflicts,
        "relationships": relationships,
        "claims": claims,
        "evidence": evidence_rows,
        "leads": leads,
        "tasks": tasks,
        "timeline": timeline_rows,
        "external": {
            "findings": findings,
            "resolution_decisions": decisions,
            "statement_assessments": assessments,
            "promotions": promotions,
            "enrichment_sessions": sessions,
            "enrichment_links": enrichment_links,
            "cross_provider_decisions": cross_provider,
        },
    }
