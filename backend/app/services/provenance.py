from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import (
    Entity, Statement, StatementAssessment, StatementPromotion, ConnectorFinding,
    RelationshipEvidenceAttachment,
)

STATUS_WEIGHT = {
    "accepted": 4,
    "conflicting": 3,
    "superseded": 2,
    "outdated": 1,
    "unresolved": 0,
}


def entity_statement_history(db: Session, entity_id: str) -> list[dict]:
    """Return an evidence ledger grouped by FtM property/value without mutating source records."""
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise ValueError("Entity not found")

    statements = db.scalars(
        select(Statement).where(Statement.entity_id == entity_id)
    ).all()
    assessments = db.scalars(
        select(StatementAssessment).where(StatementAssessment.entity_id == entity_id)
    ).all()
    promotions = db.scalars(
        select(StatementPromotion).where(StatementPromotion.entity_id == entity_id)
    ).all()

    promotion_by_assessment = {p.assessment_id: p for p in promotions}
    findings = {}
    for a in assessments:
        if a.finding_id not in findings:
            findings[a.finding_id] = db.get(ConnectorFinding, a.finding_id)

    buckets: dict[tuple[str, str], dict] = {}

    def bucket(prop: str, value: str) -> dict:
        key = (prop, value)
        if key not in buckets:
            buckets[key] = {
                "prop": prop,
                "value": value,
                "canonical": False,
                "canonical_statements": [],
                "external_assessments": [],
                "support_count": 0,
                "conflict_count": 0,
                "latest_status": None,
            }
        return buckets[key]

    for s in statements:
        b = bucket(s.prop, s.value)
        b["canonical"] = True
        b["canonical_statements"].append({
            "id": s.id,
            "dataset": s.dataset,
            "origin": s.origin,
            "original_value": s.original_value,
            "first_seen": s.first_seen.isoformat() if s.first_seen else None,
            "last_seen": s.last_seen.isoformat() if s.last_seen else None,
        })

    for a in assessments:
        b = bucket(a.prop, a.value)
        finding = findings.get(a.finding_id)
        promotion = promotion_by_assessment.get(a.id)
        item = {
            "assessment_id": a.id,
            "status": a.status,
            "note": a.note,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "finding_id": a.finding_id,
            "provider": finding.provider if finding else None,
            "dataset": (promotion.dataset if promotion else None),
            "source_url": (finding.source_url if finding else None),
            "provider_record_id": (finding.provider_record_id if finding else None),
            "finding_caption": (finding.caption if finding else None),
            "promoted": promotion is not None,
            "promotion_id": promotion.id if promotion else None,
            "promoted_at": promotion.promoted_at.isoformat() if promotion and promotion.promoted_at else None,
            "reviewer_note": promotion.reviewer_note if promotion else None,
        }
        b["external_assessments"].append(item)
        if a.status == "accepted":
            b["support_count"] += 1
        elif a.status == "conflicting":
            b["conflict_count"] += 1

    for b in buckets.values():
        if b["external_assessments"]:
            ordered = sorted(
                b["external_assessments"],
                key=lambda x: (x["created_at"] or "", STATUS_WEIGHT.get(x["status"], -1)),
                reverse=True,
            )
            b["external_assessments"] = ordered
            b["latest_status"] = ordered[0]["status"]
        b["canonical_statements"] = sorted(
            b["canonical_statements"], key=lambda x: (x["dataset"] or "", x["origin"] or "")
        )

    return sorted(
        buckets.values(),
        key=lambda x: (x["prop"].lower(), x["value"].lower()),
    )


def _record_extraction_lineage(db: Session, record_type: str, record_id: str) -> dict | None:
    """Return the latest accepted extraction lineage for a canonical record, if one exists."""
    from app.models.domain import ExtractionCandidate
    from app.services.documents import serialize_extraction_lineage

    row = db.scalar(
        select(ExtractionCandidate)
        .where(
            ExtractionCandidate.accepted_record_type == record_type,
            ExtractionCandidate.accepted_record_id == record_id,
            ExtractionCandidate.review_status == "accepted",
        )
        .order_by(ExtractionCandidate.reviewed_at.desc(), ExtractionCandidate.created_at.desc())
    )
    if row:
        return serialize_extraction_lineage(db, row)

    # Evidence materialized while accepting a claim intentionally shares the claim's
    # exact reviewed extraction span. Recover that lineage through the immutable
    # candidate id stored on the evidence rather than guessing from matching text.
    if record_type == "evidence":
        from app.models.domain import Evidence
        import re
        evidence = db.get(Evidence, record_id)
        match = re.search(r"Created from accepted extraction candidate ([A-Za-z0-9_-]+)", evidence.notes or "") if evidence else None
        if match:
            candidate = db.get(ExtractionCandidate, match.group(1))
            if candidate and candidate.review_status == "accepted" and candidate.accepted_record_type == "claim":
                return serialize_extraction_lineage(db, candidate)
    return None


def record_provenance_trace(db: Session, record_type: str, record_id: str) -> dict:
    """Build one read-only provenance graph for a canonical investigative record.

    The trace deliberately does not infer evidentiary meaning. It exposes explicit links already
    recorded by the reporter: source/document lineage, claim-evidence stances, graph usage and
    lead references. This makes provenance inspectable without promoting or changing records.
    """
    from app.models.domain import (
        Claim, Evidence, Source, ClaimEvidenceLink, RelationshipEdge, Entity, LeadLink, Lead, ReportingTask, Document,
    )
    from app.services.relationships import serialize_relationship
    from app.services.entity_aliases import resolve_active_entity, entity_alias_payload
    from app.services.post_merge_reconciliation import detect_post_merge_reconciliation, reconciliation_preference_map

    allowed = {"entity", "claim", "evidence", "relationship", "source", "document", "lead", "task"}
    if record_type not in allowed:
        raise ValueError(f"record_type must be one of: {', '.join(sorted(allowed))}")

    root: dict
    investigation_id: str | None = None
    lineage = None
    # These names are reused across the record_type branches below, each time
    # loaded via db.get() and narrowed by an explicit None check; declaring them
    # Optional once keeps every branch honest about the lookup possibly missing.
    evidence: Evidence | None
    source: Source | None
    document: Document | None
    edge: RelationshipEdge | None
    evidence_rows: list[dict] = []
    claim_rows: list[dict] = []
    relationship_rows: list[dict] = []
    reconciliation = None

    if record_type in {"source", "document"}:
        document = None
        if record_type == "source":
            source = db.get(Source, record_id)
            if source is None:
                raise LookupError("Source not found")
            document = db.scalar(select(Document).where(Document.source_id == source.id).order_by(Document.created_at.desc()))
        else:
            document = db.get(Document, record_id)
            if document is None:
                raise LookupError("Document not found")
            source = db.get(Source, document.source_id)
            if source is None:
                raise LookupError("Document source not found")

        investigation_id = source.investigation_id
        source_payload = {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type}
        if record_type == "source":
            root = {"id": source.id, "type": "source", "source": source_payload}
            if document is not None:
                root["document"] = {
                    "id": document.id, "filename": document.filename, "mime_type": document.mime_type,
                    "sha256": document.sha256, "extraction_status": document.extraction_status,
                    "extraction_error": document.extraction_error,
                }
        else:
            assert document is not None  # the document branch above raised if it was missing
            root = {
                "id": document.id, "type": "document", "source": source_payload,
                "document": {
                    "id": document.id, "filename": document.filename, "mime_type": document.mime_type,
                    "sha256": document.sha256, "extraction_status": document.extraction_status,
                    "extraction_error": document.extraction_error,
                },
            }

        evidence_objects = db.scalars(select(Evidence).where(Evidence.source_id == source.id)).all()
        seen_claim_links: set[str] = set()
        for evidence in evidence_objects:
            evidence_rows.append({
                "link_id": None, "stance": "source_evidence", "note": None,
                "evidence": {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes},
                "source": source_payload,
                "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id),
            })
            for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id == evidence.id).order_by(ClaimEvidenceLink.created_at)).all():
                if link.id not in seen_claim_links:
                    claim = db.get(Claim, link.claim_id)
                    claim_rows.append({
                        "link_id": link.id, "stance": link.stance, "note": link.note,
                        "claim": None if claim is None else {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence},
                    })
                    seen_claim_links.add(link.id)
            for edge in db.scalars(select(RelationshipEdge).join(RelationshipEvidenceAttachment, RelationshipEvidenceAttachment.relationship_edge_id == RelationshipEdge.id).where(RelationshipEvidenceAttachment.evidence_id == evidence.id)).all():
                relationship_rows.append(serialize_relationship(db, edge))

    elif record_type == "claim":
        claim = db.get(Claim, record_id)
        if claim is None:
            raise LookupError("Claim not found")
        investigation_id = claim.investigation_id
        root = {"id": claim.id, "type": "claim", "text": claim.text, "status": claim.status, "confidence": claim.confidence}
        lineage = _record_extraction_lineage(db, "claim", claim.id)
        links = db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id).order_by(ClaimEvidenceLink.created_at)).all()
        for link in links:
            evidence = db.get(Evidence, link.evidence_id)
            source = db.get(Source, evidence.source_id) if evidence else None
            evidence_rows.append({
                "link_id": link.id, "stance": link.stance, "note": link.note,
                "evidence": None if evidence is None else {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes},
                "source": None if source is None else {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type},
                "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id) if evidence else None,
            })
            if evidence is not None:
                for edge in db.scalars(select(RelationshipEdge).join(RelationshipEvidenceAttachment, RelationshipEvidenceAttachment.relationship_edge_id == RelationshipEdge.id).where(RelationshipEvidenceAttachment.evidence_id == evidence.id)).all():
                    relationship_rows.append(serialize_relationship(db, edge))

    elif record_type == "evidence":
        evidence = db.get(Evidence, record_id)
        if evidence is None:
            raise LookupError("Evidence not found")
        source = db.get(Source, evidence.source_id)
        if source is None:
            raise LookupError("Evidence source not found")
        investigation_id = source.investigation_id
        root = {
            "id": evidence.id, "type": "evidence", "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes,
            "source": {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type},
        }
        lineage = _record_extraction_lineage(db, "evidence", evidence.id)
        links = db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id == evidence.id).order_by(ClaimEvidenceLink.created_at)).all()
        for link in links:
            claim = db.get(Claim, link.claim_id)
            claim_rows.append({
                "link_id": link.id, "stance": link.stance, "note": link.note,
                "claim": None if claim is None else {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence},
            })
        for edge in db.scalars(select(RelationshipEdge).join(RelationshipEvidenceAttachment, RelationshipEvidenceAttachment.relationship_edge_id == RelationshipEdge.id).where(RelationshipEvidenceAttachment.evidence_id == evidence.id)).all():
            relationship_rows.append(serialize_relationship(db, edge))

    elif record_type == "relationship":
        edge = db.get(RelationshipEdge, record_id)
        if edge is None:
            # Accept the FtM relationship entity id as a convenience for graph callers.
            edge = db.scalar(select(RelationshipEdge).where(RelationshipEdge.relationship_entity_id == record_id))
        if edge is None:
            raise LookupError("Relationship not found")
        investigation_id = edge.investigation_id
        serialized = serialize_relationship(db, edge)
        reconciliation = reconciliation_preference_map(db, edge.investigation_id, "relationship").get(edge.id)
        root = {"id": edge.id, "type": "relationship", "relationship": serialized, "reconciliation": reconciliation}
        # A compact preferred graph edge can stand in for several reporter-reviewed duplicate
        # relationship records. Provenance tracing must therefore traverse every preserved
        # underlying edge rather than only the presentation record.
        states = reconciliation_preference_map(db, edge.investigation_id, "relationship")
        state = states.get(edge.id) or {}
        preferred_id = state.get("preferred_record_id") or edge.id
        underlying_ids = {preferred_id}
        for candidate_id, candidate_state in states.items():
            if candidate_state.get("decision") == "duplicate" and candidate_state.get("preferred_record_id") == preferred_id:
                underlying_ids.add(candidate_id)
        maybe_edges = [db.get(RelationshipEdge, rid) for rid in sorted(underlying_ids)]
        underlying_edges = [item for item in maybe_edges if item is not None]
        relationship_rows = [serialize_relationship(db, item) for item in underlying_edges]
        root["reviewed_duplicate_scope"] = {
            "presentation_only": True,
            "preferred_relationship_id": preferred_id,
            "underlying_relationship_ids": [item.id for item in underlying_edges],
            "underlying_relationship_count": len(underlying_edges),
        }
        seen_evidence: set[str] = set()
        seen_claim_links = set()
        for underlying in underlying_edges:
            attachments = db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == underlying.id).order_by(RelationshipEvidenceAttachment.created_at)).all()
            for attachment in attachments:
                if attachment.evidence_id in seen_evidence:
                    continue
                seen_evidence.add(attachment.evidence_id)
                evidence = db.get(Evidence, attachment.evidence_id)
                source = db.get(Source, evidence.source_id) if evidence else None
                evidence_rows.append({
                    "link_id": attachment.id, "stance": "supports_relationship",
                    "note": attachment.note or f"Evidence attached to underlying relationship {underlying.id}",
                    "evidence": None if evidence is None else {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes},
                    "source": None if source is None else {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type},
                    "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id) if evidence else None,
                })
                if evidence is not None:
                    for claim_link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id == evidence.id).order_by(ClaimEvidenceLink.created_at)).all():
                        if claim_link.id in seen_claim_links:
                            continue
                        seen_claim_links.add(claim_link.id)
                        claim = db.get(Claim, claim_link.claim_id)
                        claim_rows.append({
                            "link_id": claim_link.id, "stance": claim_link.stance, "note": claim_link.note,
                            "claim": None if claim is None else {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence},
                        })

    elif record_type == "lead":
        from app.services.leads import serialize_lead
        lead = db.get(Lead, record_id)
        if lead is None:
            raise LookupError("Lead not found")
        investigation_id = lead.investigation_id
        lead_payload = serialize_lead(db, lead)
        root = {"id": lead.id, "type": "lead", "lead": lead_payload}
        for lead_link in db.scalars(select(LeadLink).where(LeadLink.lead_id == lead.id).order_by(LeadLink.created_at)).all():
            if lead_link.claim_id:
                claim = db.get(Claim, lead_link.claim_id)
                if claim:
                    claim_rows.append({"link_id": lead_link.id, "stance": "lead_context", "note": lead_link.note, "claim": {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence}})
            if lead_link.evidence_id:
                evidence = db.get(Evidence, lead_link.evidence_id)
                source = db.get(Source, evidence.source_id) if evidence else None
                evidence_rows.append({"link_id": lead_link.id, "stance": "lead_context", "note": lead_link.note, "evidence": None if evidence is None else {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes}, "source": None if source is None else {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type}, "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id) if evidence else None})
            if lead_link.source_id:
                source = db.get(Source, lead_link.source_id)
                if source:
                    for evidence in db.scalars(select(Evidence).where(Evidence.source_id == source.id)).all():
                        evidence_rows.append({"link_id": lead_link.id, "stance": "lead_source_context", "note": lead_link.note, "evidence": {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes}, "source": {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type}, "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id)})
            if lead_link.relationship_id:
                edge = db.get(RelationshipEdge, lead_link.relationship_id)
                if edge:
                    relationship_rows.append(serialize_relationship(db, edge))
            if lead_link.entity_id:
                for edge in db.scalars(select(RelationshipEdge).where((RelationshipEdge.source_entity_id == lead_link.entity_id) | (RelationshipEdge.target_entity_id == lead_link.entity_id))).all():
                    relationship_rows.append(serialize_relationship(db, edge))

    elif record_type == "task":
        from app.services.leads import serialize_task
        task = db.get(ReportingTask, record_id)
        if task is None:
            raise LookupError("Reporting task not found")
        investigation_id = task.investigation_id
        task_payload = serialize_task(db, task)
        root = {"id": task.id, "type": "task", "task": task_payload}
        if task.lead_id:
            lead = db.get(Lead, task.lead_id)
            if lead:
                task_lead_links = db.scalars(select(LeadLink).where(LeadLink.lead_id == lead.id).order_by(LeadLink.created_at)).all()
                for lead_link in task_lead_links:
                    if lead_link.claim_id:
                        claim = db.get(Claim, lead_link.claim_id)
                        if claim:
                            claim_rows.append({"link_id": lead_link.id, "stance": "lead_context", "note": lead_link.note, "claim": {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence}})
                    if lead_link.evidence_id:
                        evidence = db.get(Evidence, lead_link.evidence_id)
                        source = db.get(Source, evidence.source_id) if evidence else None
                        evidence_rows.append({"link_id": lead_link.id, "stance": "lead_context", "note": lead_link.note, "evidence": None if evidence is None else {"id": evidence.id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes}, "source": None if source is None else {"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type}, "extraction_lineage": _record_extraction_lineage(db, "evidence", evidence.id) if evidence else None})
                    if lead_link.relationship_id:
                        edge = db.get(RelationshipEdge, lead_link.relationship_id)
                        if edge:
                            relationship_rows.append(serialize_relationship(db, edge))

    else:  # entity
        requested_entity = db.get(Entity, record_id)
        if requested_entity is None:
            raise LookupError("Entity not found")
        try:
            entity, alias_chain = resolve_active_entity(db, requested_entity)
        except ValueError as exc:
            raise LookupError(str(exc)) from exc
        if entity is None:
            raise LookupError("Entity not found")
        investigation_id = entity.investigation_id
        root = {
            "id": entity.id, "type": "entity", "ftm_id": entity.ftm_id, "schema": entity.schema, "caption": entity.caption,
            "alias_resolution": entity_alias_payload(requested_entity, entity, alias_chain),
        }
        lineage = _record_extraction_lineage(db, "entity", entity.id)
        relationship_rows = [serialize_relationship(db, edge) for edge in db.scalars(
            select(RelationshipEdge).where(
                (RelationshipEdge.source_entity_id == entity.id) | (RelationshipEdge.target_entity_id == entity.id)
            ).order_by(RelationshipEdge.created_at.desc())
        ).all()]
        record_id = entity.id
        reconciliation = detect_post_merge_reconciliation(db, entity)

    lead_links: list[dict] = []
    conditions = []
    if record_type == "entity": conditions.append(LeadLink.entity_id == record_id)
    if record_type == "claim": conditions.append(LeadLink.claim_id == record_id)
    if record_type == "evidence": conditions.append(LeadLink.evidence_id == record_id)
    if record_type == "source": conditions.append(LeadLink.source_id == record_id)
    if record_type == "document":
        source_id = root.get("source", {}).get("id") if isinstance(root.get("source"), dict) else None
        if source_id: conditions.append(LeadLink.source_id == source_id)
    if record_type == "lead":
        lead = db.get(Lead, record_id)
        if lead:
            lead_links.append({"link_id": f"lead:{record_id}", "note": "Trace root", "lead": {"id": lead.id, "title": lead.title, "detail": lead.detail, "status": lead.status, "provider": lead.provider}})
    if record_type == "task":
        task_lead_id = root.get("task", {}).get("lead_id") if isinstance(root.get("task"), dict) else None
        if task_lead_id:
            lead = db.get(Lead, task_lead_id)
            if lead:
                lead_links.append({"link_id": f"task:{record_id}", "note": "Reporting task originated from lead", "lead": {"id": lead.id, "title": lead.title, "detail": lead.detail, "status": lead.status, "provider": lead.provider}})
    # Prefer an explicit relationship-edge lead link; retain the historical FtM-entity fallback.
    if record_type == "relationship" and relationship_rows:
        conditions.append(LeadLink.relationship_id == relationship_rows[0].get("id"))
        rel_entity_id = relationship_rows[0].get("relationship_entity_id")
        if rel_entity_id:
            conditions.append(LeadLink.entity_id == rel_entity_id)
    if conditions:
        from sqlalchemy import or_
        stmt = select(LeadLink).where(conditions[0] if len(conditions) == 1 else or_(*conditions))
        for lead_link in db.scalars(stmt.order_by(LeadLink.created_at)).all():
            lead = db.get(Lead, lead_link.lead_id)
            if lead and (investigation_id is None or lead.investigation_id == investigation_id):
                lead_links.append({
                    "link_id": lead_link.id, "note": lead_link.note,
                    "lead": {"id": lead.id, "title": lead.title, "detail": lead.detail, "status": lead.status, "provider": lead.provider},
                })

    # Deduplicate relationships when several claim evidence links point to the same edge.
    deduped_relationships = []
    seen = set()
    for row in relationship_rows:
        key = row.get("id")
        if key in seen:
            continue
        seen.add(key)
        deduped_relationships.append(row)

    return {
        "record_type": record_type,
        "record_id": record_id,
        "investigation_id": investigation_id,
        "root": root,
        "extraction_lineage": lineage,
        "evidence_links": evidence_rows,
        "claim_links": claim_rows,
        "relationships": deduped_relationships,
        "lead_links": lead_links,
        "reconciliation": reconciliation,
    }


def find_extraction_lineage(db: Session, record_type: str, record_id: str) -> dict:
    """Return the most recently accepted extraction candidate's lineage for a
    canonical record, if any exists, as a simple `{found, lineage}` payload.

    This is a direct-match lookup only (record_type/record_id must match an
    accepted ExtractionCandidate exactly) -- unlike `_record_extraction_lineage`
    above, it does not fall back to a claim's lineage for evidence created
    alongside it. That richer fallback is intentionally not applied here to
    preserve this endpoint's existing behavior exactly.
    """
    from app.models.domain import ExtractionCandidate
    from app.services.documents import serialize_extraction_lineage

    allowed = {"entity", "claim", "evidence"}
    if record_type not in allowed:
        raise ValueError("record_type must be entity, claim, or evidence")

    row = db.scalar(
        select(ExtractionCandidate)
        .where(
            ExtractionCandidate.accepted_record_type == record_type,
            ExtractionCandidate.accepted_record_id == record_id,
            ExtractionCandidate.review_status == "accepted",
        )
        .order_by(ExtractionCandidate.reviewed_at.desc(), ExtractionCandidate.created_at.desc())
    )
    return {"found": row is not None, "lineage": serialize_extraction_lineage(db, row) if row else None}
