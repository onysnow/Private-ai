from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Claim, ClaimEvidenceLink, Entity, Evidence, Lead, LeadLink, LeadProfile, LeadWorkflowEvent,
    RelationshipEdge, RelationshipEvidenceAttachment, RelationshipEvidenceReviewEvent, ReportingTask, ReportingTaskWorkflowEvent, Source,
)

LEAD_STATUSES = {"unreviewed", "active", "blocked", "resolved", "rejected"}
PRIORITIES = {"low", "normal", "high", "urgent"}
TASK_STATUSES = {"todo", "in_progress", "blocked", "done", "cancelled"}


def get_profile(db: Session, lead_id: str, create: bool = False) -> LeadProfile | None:
    row = db.scalar(select(LeadProfile).where(LeadProfile.lead_id == lead_id))
    if row is None and create:
        row = LeadProfile(lead_id=lead_id)
        db.add(row)
        db.flush()
    return row


def _target_label(link: LeadLink) -> tuple[str, str] | tuple[None, None]:
    for field, kind in (("entity_id", "entity"), ("source_id", "source"), ("claim_id", "claim"), ("evidence_id", "evidence"), ("relationship_id", "relationship")):
        value = getattr(link, field)
        if value:
            return kind, value
    return None, None


def serialize_link(db: Session, link: LeadLink) -> dict:
    kind, target_id = _target_label(link)
    target = None
    if kind == "entity":
        row = db.get(Entity, target_id); target = row.caption if row else None
    elif kind == "source":
        row = db.get(Source, target_id); target = row.title if row else None
    elif kind == "claim":
        row = db.get(Claim, target_id); target = row.text if row else None
    elif kind == "evidence":
        row = db.get(Evidence, target_id); target = (row.quote or row.locator or row.notes) if row else None
    elif kind == "relationship":
        edge = db.get(RelationshipEdge, target_id)
        if edge:
            source = db.get(Entity, edge.source_entity_id)
            target_entity = db.get(Entity, edge.target_entity_id)
            target = f"{source.caption if source else edge.source_entity_id} — {edge.schema} → {target_entity.caption if target_entity else edge.target_entity_id}"
    return {"id": link.id, "lead_id": link.lead_id, "type": kind, "target_id": target_id, "label": target, "note": link.note, "created_at": link.created_at}


def _lead_triage(db: Session, links: list[LeadLink]) -> dict:
    """Summarize evidence tension around records explicitly linked to a lead.

    This is a queue-attention signal only. It never changes reporter-set priority,
    claim status, or canonical evidence/relationship state.
    """
    claim_ids = {link.claim_id for link in links if link.claim_id}
    evidence_ids = {link.evidence_id for link in links if link.evidence_id}
    relationship_ids = {link.relationship_id for link in links if link.relationship_id}
    if relationship_ids:
        attachments = db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id.in_(relationship_ids))).all()
        evidence_ids.update(attachment.evidence_id for attachment in attachments)

    evidence_links = []
    if claim_ids:
        evidence_links.extend(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id.in_(claim_ids))).all())
    if evidence_ids:
        evidence_links.extend(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_(evidence_ids))).all())

    # De-duplicate links reached through both a directly-linked claim and evidence item.
    evidence_links = list({row.id: row for row in evidence_links}.values())
    claim_ids.update(row.claim_id for row in evidence_links)
    claims = db.scalars(select(Claim).where(Claim.id.in_(claim_ids))).all() if claim_ids else []

    stance_counts = {"supports": 0, "contradicts": 0, "context": 0}
    for row in evidence_links:
        if row.stance in stance_counts:
            stance_counts[row.stance] += 1
    disputed_claim_count = sum(1 for claim in claims if claim.status == "disputed")
    contradiction_count = stance_counts["contradicts"]

    # Relationship evidence assessments are a separate reporter judgment from claim
    # evidence stance. Surface the newest assessment for each attached evidence item
    # so lead triage cannot appear healthy while a linked relationship is explicitly
    # contradicted or unresolved.
    relationship_review_counts = {"supports": 0, "contradicts": 0, "context": 0, "superseded": 0, "unresolved": 0, "unreviewed": 0}
    if relationship_ids:
        for relationship_id in relationship_ids:
            attached = db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == relationship_id)).all()
            for attachment in attached:
                latest = db.scalar(select(RelationshipEvidenceReviewEvent).where(
                    RelationshipEvidenceReviewEvent.relationship_edge_id == relationship_id,
                    RelationshipEvidenceReviewEvent.evidence_id == attachment.evidence_id,
                ).order_by(RelationshipEvidenceReviewEvent.created_at.desc(), RelationshipEvidenceReviewEvent.id.desc()))
                relationship_review_counts[latest.stance if latest else "unreviewed"] += 1
    relationship_attention = relationship_review_counts["contradicts"] * 3 + relationship_review_counts["unresolved"] * 2 + relationship_review_counts["unreviewed"]
    attention_score = contradiction_count * 3 + disputed_claim_count * 2 + relationship_attention
    reasons = []
    if contradiction_count:
        reasons.append(f"{contradiction_count} contradicting evidence link(s)")
    if disputed_claim_count:
        reasons.append(f"{disputed_claim_count} disputed claim(s)")
    if relationship_review_counts["contradicts"]:
        reasons.append(f"{relationship_review_counts['contradicts']} relationship evidence assessment(s) contradict the relationship")
    if relationship_review_counts["unresolved"]:
        reasons.append(f"{relationship_review_counts['unresolved']} unresolved relationship evidence assessment(s)")
    if relationship_review_counts["unreviewed"]:
        reasons.append(f"{relationship_review_counts['unreviewed']} unreviewed relationship evidence attachment(s)")
    return {
        "needs_attention": attention_score > 0,
        "attention_score": attention_score,
        "stance_counts": stance_counts,
        "linked_claim_count": len(claims),
        "disputed_claim_count": disputed_claim_count,
        "relationship_evidence_review_counts": relationship_review_counts,
        "reasons": reasons,
    }


def serialize_lead(db: Session, lead: Lead) -> dict:
    profile = get_profile(db, lead.id, create=False)
    links = db.scalars(select(LeadLink).where(LeadLink.lead_id == lead.id).order_by(LeadLink.created_at)).all()
    tasks = db.scalars(select(ReportingTask).where(ReportingTask.lead_id == lead.id).order_by(ReportingTask.created_at.desc())).all()
    history = db.scalars(select(LeadWorkflowEvent).where(LeadWorkflowEvent.lead_id == lead.id).order_by(LeadWorkflowEvent.created_at.desc())).all()
    return {
        "id": lead.id,
        "investigation_id": lead.investigation_id,
        "title": lead.title,
        "detail": lead.detail,
        "provider": lead.provider,
        "provider_record_id": lead.provider_record_id,
        "kind": "connector" if lead.provider else "question",
        "status": lead.status,
        "priority": profile.priority if profile else "normal",
        "owner": profile.owner if profile else None,
        "next_action": profile.next_action if profile else None,
        "created_at": lead.created_at,
        "links": [serialize_link(db, link) for link in links],
        "tasks": [serialize_task(db, task) for task in tasks],
        "history": history,
        "triage": _lead_triage(db, links),
    }


def lead_provenance_snapshot(db: Session, lead: Lead | None) -> dict | None:
    """Freeze reporter-facing lead context for a task workflow event.

    The snapshot is intentionally denormalized: a later edit to a claim, source,
    evidence item, relationship, or lead profile must not rewrite why the task
    existed at this point in time.
    """
    if lead is None:
        return None
    profile = get_profile(db, lead.id, create=False)
    links = db.scalars(select(LeadLink).where(LeadLink.lead_id == lead.id).order_by(LeadLink.created_at)).all()
    claims, evidence_items, relationships, sources = [], [], [], []
    seen = {"claim": set(), "evidence": set(), "relationship": set(), "source": set()}

    def add_source(source: Source | None) -> None:
        if source is None or source.id in seen["source"]: return
        seen["source"].add(source.id)
        sources.append({"id": source.id, "title": source.title, "url": source.url, "source_type": source.source_type})

    def add_evidence(evidence: Evidence | None) -> None:
        if evidence is None or evidence.id in seen["evidence"]: return
        seen["evidence"].add(evidence.id)
        source = db.get(Source, evidence.source_id)
        evidence_items.append({"id": evidence.id, "source_id": evidence.source_id, "quote": evidence.quote, "locator": evidence.locator, "notes": evidence.notes})
        add_source(source)

    for link in links:
        if link.claim_id and link.claim_id not in seen["claim"]:
            claim = db.get(Claim, link.claim_id)
            if claim:
                seen["claim"].add(claim.id)
                claims.append({"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence})
                for cel in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id)).all():
                    add_evidence(db.get(Evidence, cel.evidence_id))
        if link.evidence_id: add_evidence(db.get(Evidence, link.evidence_id))
        if link.source_id: add_source(db.get(Source, link.source_id))
        if link.relationship_id and link.relationship_id not in seen["relationship"]:
            edge = db.get(RelationshipEdge, link.relationship_id)
            if edge:
                seen["relationship"].add(edge.id)
                src = db.get(Entity, edge.source_entity_id); dst = db.get(Entity, edge.target_entity_id)
                attachments = db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == edge.id)).all()
                attached_ids = sorted({attachment.evidence_id for attachment in attachments})
                relationships.append({"id": edge.id, "schema": edge.schema, "source_entity_id": edge.source_entity_id, "source_caption": src.caption if src else None, "target_entity_id": edge.target_entity_id, "target_caption": dst.caption if dst else None, "evidence_ids": attached_ids})
                for evidence_id in attached_ids:
                    add_evidence(db.get(Evidence, evidence_id))

    return {
        "lead": {"id": lead.id, "title": lead.title, "detail": lead.detail, "status": lead.status, "provider": lead.provider,
                 "priority": profile.priority if profile else "normal", "owner": profile.owner if profile else None,
                 "next_action": profile.next_action if profile else None},
        "links": [serialize_link(db, link) for link in links],
        "context": {"relationships": relationships, "claims": claims, "evidence": evidence_items, "sources": sources},
        "triage": _lead_triage(db, links),
    }


def serialize_task(db: Session, task: ReportingTask) -> dict:
    events = db.scalars(
        select(ReportingTaskWorkflowEvent)
        .where(ReportingTaskWorkflowEvent.task_id == task.id)
        .order_by(ReportingTaskWorkflowEvent.created_at.desc())
    ).all()
    history = []
    for event in events:
        snapshot = None
        if event.lead_provenance_json:
            try:
                snapshot = json.loads(event.lead_provenance_json)
            except json.JSONDecodeError:
                snapshot = {"corrupt_snapshot": True}
        history.append({
            "id": event.id, "from_status": event.from_status, "to_status": event.to_status,
            "note": event.note, "created_at": event.created_at, "lead_provenance": snapshot,
        })
    return {
        "id": task.id, "investigation_id": task.investigation_id, "lead_id": task.lead_id,
        "title": task.title, "detail": task.detail, "status": task.status, "priority": task.priority,
        "owner": task.owner, "due_date": task.due_date, "created_at": task.created_at,
        "updated_at": task.updated_at, "history": history,
        # Convenience projection for the reporter task list. History remains the
        # immutable audit trail; this is simply the newest frozen lead snapshot.
        "task_context": next((item["lead_provenance"] for item in history if item.get("lead_provenance")), None),
    }


def make_task_workflow_event(db: Session, task: ReportingTask, *, from_status: str | None, to_status: str, note: str | None) -> ReportingTaskWorkflowEvent:
    lead = db.get(Lead, task.lead_id) if task.lead_id else None
    snapshot = lead_provenance_snapshot(db, lead)
    return ReportingTaskWorkflowEvent(
        investigation_id=task.investigation_id, task_id=task.id, from_status=from_status,
        to_status=to_status, note=note,
        lead_provenance_json=json.dumps(snapshot, sort_keys=True, default=str) if snapshot is not None else None,
    )


def validate_link_target(db: Session, lead: Lead, *, entity_id=None, source_id=None, claim_id=None, evidence_id=None, relationship_id=None) -> None:
    targets = [x for x in (entity_id, source_id, claim_id, evidence_id, relationship_id) if x]
    if len(targets) != 1:
        raise ValueError("A lead link must reference exactly one entity, source, claim, evidence item, or relationship")
    if entity_id:
        row = db.get(Entity, entity_id)
        if row is None or row.investigation_id != lead.investigation_id:
            raise ValueError("Entity must belong to the same investigation")
    if source_id:
        row = db.get(Source, source_id)
        if row is None or row.investigation_id != lead.investigation_id:
            raise ValueError("Source must belong to the same investigation")
    if claim_id:
        row = db.get(Claim, claim_id)
        if row is None or row.investigation_id != lead.investigation_id:
            raise ValueError("Claim must belong to the same investigation")
    if evidence_id:
        evidence = db.get(Evidence, evidence_id)
        source = db.get(Source, evidence.source_id) if evidence else None
        if evidence is None or source is None or source.investigation_id != lead.investigation_id:
            raise ValueError("Evidence must belong to the same investigation")
    if relationship_id:
        edge = db.get(RelationshipEdge, relationship_id)
        if edge is None or edge.investigation_id != lead.investigation_id:
            raise ValueError("Relationship must belong to the same investigation")


def create_relationship_context_lead(db: Session, edge: RelationshipEdge, *, title: str | None = None, detail: str | None = None) -> Lead:
    """Create a reporting lead that freezes the explicit relationship/claim/evidence context.

    Only existing reporter-recorded links are copied. No claim stance, verification state,
    relationship truth, or priority is inferred or changed.
    """
    from app.services.provenance import record_provenance_trace

    trace = record_provenance_trace(db, "relationship", edge.id)
    serialized = trace.get("root", {}).get("relationship", {})
    source = serialized.get("source", {}).get("caption", edge.source_entity_id)
    target = serialized.get("target", {}).get("caption", edge.target_entity_id)
    lead = Lead(
        investigation_id=edge.investigation_id,
        title=title or f"Verify {edge.schema}: {source} → {target}",
        detail=detail or "Follow up on this relationship with its currently recorded claim and evidence context preserved.",
        status="unreviewed",
    )
    db.add(lead); db.flush()
    db.add(LeadProfile(lead_id=lead.id))
    db.add(LeadWorkflowEvent(lead_id=lead.id, from_status=None, to_status=lead.status, note="Lead created from relationship context"))

    seen: set[tuple[str, str]] = set()
    def add_link(kind: str, target_id: str | None, note: str) -> None:
        if not target_id or (kind, target_id) in seen:
            return
        seen.add((kind, target_id))
        db.add(LeadLink(lead_id=lead.id, **{f"{kind}_id": target_id}, note=note))

    # Preserve every reviewed duplicate relationship represented by the compact graph edge.
    for rel in trace.get("relationships", []):
        add_link("relationship", rel.get("id"), "Relationship context")
    for item in trace.get("evidence_links", []):
        evidence = item.get("evidence") or {}
        add_link("evidence", evidence.get("id"), f"Relationship evidence: {item.get('stance') or 'context'}")
    for item in trace.get("claim_links", []):
        claim = item.get("claim") or {}
        add_link("claim", claim.get("id"), f"Claim context: {item.get('stance') or 'context'}")

    db.flush()
    return lead


def create_reporting_task(db: Session, body) -> ReportingTask:
    """Validate and persist a new ReportingTask from a request body.

    Raises ValueError for a bad status/priority enum or a lead_id that
    doesn't belong to the same investigation. The caller is responsible
    for confirming body.investigation_id exists (a 404 concern, not a
    validation one).
    """
    if body.status not in TASK_STATUSES or body.priority not in PRIORITIES:
        raise ValueError("Invalid task status or priority")
    if body.lead_id:
        lead = db.get(Lead, body.lead_id)
        if lead is None or lead.investigation_id != body.investigation_id:
            raise ValueError("Lead must belong to the same investigation")
    row = ReportingTask(**body.model_dump())
    db.add(row)
    db.flush()
    db.add(make_task_workflow_event(db, row, from_status=None, to_status=row.status, note="Reporting task created"))
    db.commit()
    db.refresh(row)
    return row


def update_reporting_task(db: Session, row: ReportingTask, body) -> ReportingTask:
    """Apply a partial update to a ReportingTask, recording a workflow event
    when status changes. Raises ValueError for a bad status/priority enum.
    The caller is responsible for confirming the task exists (a 404
    concern, not a validation one)."""
    data = body.model_dump(exclude_unset=True)
    workflow_note = data.pop("workflow_note", None)
    if data.get("status") is not None and data["status"] not in TASK_STATUSES:
        raise ValueError("Invalid task status")
    if data.get("priority") is not None and data["priority"] not in PRIORITIES:
        raise ValueError("Invalid task priority")
    old_status = row.status
    for field, value in data.items():
        setattr(row, field, value)
    if row.status != old_status:
        db.add(make_task_workflow_event(db, row, from_status=old_status, to_status=row.status, note=workflow_note))
    db.commit()
    db.refresh(row)
    return row


def create_lead(db: Session, body) -> Lead:
    """Validate and persist a new Lead, optionally linking it to a
    relationship. Raises ValueError for a bad status or a relationship
    link target that fails validate_link_target. The caller is
    responsible for confirming body.investigation_id exists (a 404
    concern)."""
    if body.status not in LEAD_STATUSES:
        raise ValueError("Invalid lead status")
    data = body.model_dump(exclude={"relationship_id"})
    row = Lead(**data)
    db.add(row)
    db.flush()
    if body.relationship_id:
        try:
            validate_link_target(db, row, relationship_id=body.relationship_id)
        except ValueError:
            db.rollback()
            raise
        db.add(LeadLink(lead_id=row.id, relationship_id=body.relationship_id, note="Created from relationship"))
    db.add(LeadProfile(lead_id=row.id))
    db.add(LeadWorkflowEvent(lead_id=row.id, from_status=None, to_status=row.status, note="Lead created"))
    db.commit()
    db.refresh(row)
    return row


def update_lead(db: Session, row: Lead, data: dict) -> Lead:
    """Apply a partial update to a Lead (and its profile). Raises
    ValueError for a bad status or priority."""
    if data.get("status") is not None and data["status"] not in LEAD_STATUSES:
        raise ValueError("Invalid lead status")
    if data.get("priority") is not None and data["priority"] not in PRIORITIES:
        raise ValueError("Invalid lead priority")
    profile = get_profile(db, row.id, create=True)
    old_status = row.status
    for field in ("title", "detail", "status"):
        if field in data and data[field] is not None:
            setattr(row, field, data[field])
    for field in ("priority", "owner", "next_action"):
        if field in data:
            setattr(profile, field, data[field])
    if row.status != old_status:
        db.add(LeadWorkflowEvent(lead_id=row.id, from_status=old_status, to_status=row.status, note=data.get("note")))
    db.commit()
    db.refresh(row)
    return row


def create_lead_link(db: Session, lead: Lead, body) -> LeadLink:
    """Validate and persist a LeadLink. Raises ValueError if
    validate_link_target rejects the target (the caller confirms the
    lead exists -- a 404 concern)."""
    validate_link_target(db, lead, **body.model_dump(exclude={"note"}))
    row = LeadLink(lead_id=lead.id, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_lead_links(db: Session, lead_id: str) -> list[dict]:
    rows = db.scalars(select(LeadLink).where(LeadLink.lead_id == lead_id).order_by(LeadLink.created_at)).all()
    return [serialize_link(db, row) for row in rows]


def convert_lead(db: Session, lead: Lead, body) -> dict:
    """Convert a Lead into a Claim or a ReportingTask. Raises ValueError
    for an unknown conversion kind or (for a task conversion) a bad
    priority."""
    if body.kind == "claim":
        text = (body.text or body.title or lead.title).strip()
        claim = Claim(investigation_id=lead.investigation_id, text=text, status="lead", confidence=0.0)
        db.add(claim)
        db.flush()
        link = LeadLink(lead_id=lead.id, claim_id=claim.id, note="Converted from lead")
        db.add(link)
        if lead.status == "unreviewed":
            old = lead.status
            lead.status = "active"
            db.add(LeadWorkflowEvent(lead_id=lead.id, from_status=old, to_status="active", note="Converted to claim"))
        db.commit()
        db.refresh(claim)
        return {"kind": "claim", "record": claim, "lead": serialize_lead(db, lead)}
    if body.kind == "task":
        priority = body.priority or (get_profile(db, lead.id, create=True).priority)
        if priority not in PRIORITIES:
            raise ValueError("Invalid task priority")
        task = ReportingTask(
            investigation_id=lead.investigation_id, lead_id=lead.id, title=body.title or lead.title,
            detail=body.detail or lead.detail, priority=priority, owner=body.owner, due_date=body.due_date,
        )
        db.add(task)
        db.flush()
        db.add(make_task_workflow_event(db, task, from_status=None, to_status=task.status, note="Created from reporting lead"))
        if lead.status == "unreviewed":
            old = lead.status
            lead.status = "active"
            db.add(LeadWorkflowEvent(lead_id=lead.id, from_status=old, to_status="active", note="Converted to reporting task"))
        db.commit()
        db.refresh(task)
        return {"kind": "task", "record": serialize_task(db, task), "lead": serialize_lead(db, lead)}
    raise ValueError("Conversion kind must be claim or task")
