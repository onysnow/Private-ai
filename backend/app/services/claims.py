from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.time import utcnow_naive
from app.schemas.api import ClaimCreate
from app.models.domain import Claim, ClaimReviewEvent, ClaimEvidenceLink, Evidence, Source, RelationshipEdge, RelationshipEvidenceAttachment


# The confidence grade on each claim (ADR-0005, line 5): the IPCC AR5
# evidence-by-agreement grid (Mastrandrea et al. 2010, "Guidance Note for
# Lead Authors of the IPCC Fifth Assessment Report on Consistent Treatment of
# Uncertainties", Figure 1). Evidence is summarised as limited, medium or
# robust (its type, amount, quality and consistency), agreement as low,
# medium or high. Both are the reporter's judgement: the note gives no
# counts to derive them from, so the Workbench shows the evidence (its
# stances and how many sources it comes from) and records the grade the
# reporter gives, with the rationale.
EVIDENCE_GRADES = ("limited", "medium", "robust")
AGREEMENT_GRADES = ("low", "medium", "high")


def validate_grade(*, evidence_grade: str | None, agreement_grade: str | None) -> None:
    if evidence_grade is not None and evidence_grade not in EVIDENCE_GRADES:
        raise ValueError(f"Invalid evidence grade. Allowed: {', '.join(EVIDENCE_GRADES)}")
    if agreement_grade is not None and agreement_grade not in AGREEMENT_GRADES:
        raise ValueError(f"Invalid agreement grade. Allowed: {', '.join(AGREEMENT_GRADES)}")
    if (evidence_grade is None) != (agreement_grade is None):
        raise ValueError("A confidence grade gives both the evidence and the agreement")


def review_claim(db: Session, claim: Claim, *, status: str, confidence: float, rationale: str,
                 evidence_grade: str | None = None, agreement_grade: str | None = None,
                 override_reason: str | None = None, reviewer_type: str = "HUMAN") -> Any:
    """Record a reporter's review: the claim's status, confidence and, when
    given, its grade (both halves together; a review without one keeps the
    grade the claim has). Supported and Confirmed are held to the Done rules
    (app/services/claim_done.py); with a rule not met, a written reason is
    required and kept on the event."""
    from app.db.locking import lock_investigation_transaction
    from app.services.claim_done import require_done

    # A review made at the same moment commits first; this one starts from what
    # it left, so each event's "from" is the status it really changed.
    lock_investigation_transaction(db, claim.investigation_id)
    db.refresh(claim)
    rationale = rationale.strip()
    if not rationale:
        raise ValueError("Reporter rationale is required for a claim review")
    validate_claim_fields(status=status, confidence=confidence)
    validate_grade(evidence_grade=evidence_grade, agreement_grade=agreement_grade)
    from app.ai.suite_vocab import REVIEWER_TYPES
    if reviewer_type not in REVIEWER_TYPES:
        raise ValueError(f"reviewer_type must be one of: {', '.join(REVIEWER_TYPES)}")
    unmet = require_done(db, claim, status, override_reason)
    new_evidence = evidence_grade if evidence_grade is not None else claim.evidence_grade
    new_agreement = agreement_grade if agreement_grade is not None else claim.agreement_grade
    event = ClaimReviewEvent(
        claim_id=claim.id, from_status=claim.status, to_status=status,
        from_confidence=claim.confidence, to_confidence=confidence, rationale=rationale,
        from_evidence_grade=claim.evidence_grade, to_evidence_grade=new_evidence,
        from_agreement_grade=claim.agreement_grade, to_agreement_grade=new_agreement,
        override_reason=(override_reason or "").strip() or None if unmet else None,
        unmet_rules=[r["key"] for r in unmet["rules"] if r["state"] == "not_met"] if unmet else None,
        reviewer_type=reviewer_type,
    )
    claim.status = status
    claim.confidence = confidence
    claim.evidence_grade = new_evidence
    claim.agreement_grade = new_agreement
    db.add(event)
    db.commit(); db.refresh(claim); db.refresh(event)
    return claim, event


def claim_review_workspace(db: Session, claim: Claim) -> dict:
    links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id).order_by(ClaimEvidenceLink.created_at)).all())
    evidence_rows, evidence_ids = [], []
    for link in links:
        evidence = db.get(Evidence, link.evidence_id)
        source = db.get(Source, evidence.source_id) if evidence else None
        if evidence:
            evidence_ids.append(evidence.id)
        evidence_rows.append({"id": link.id, "stance": link.stance, "note": link.note, "created_at": link.created_at, "evidence": evidence, "source": source,
                              "superseded": superseded_of(db, link)})
    relationships = []
    if evidence_ids:
        attachments = list(db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.evidence_id.in_(evidence_ids))).all())
        edge_ids = {a.relationship_edge_id for a in attachments}
        edges = list(db.scalars(select(RelationshipEdge).where(RelationshipEdge.id.in_(edge_ids))).all()) if edge_ids else []
        # Explicit annotation: edge id -> list of attached evidence ids.
        attached_by_edge: dict[str, list[str]] = {}
        for attachment in attachments:
            attached_by_edge.setdefault(attachment.relationship_edge_id, []).append(attachment.evidence_id)
        for edge in edges:
            relationships.append({"id": edge.id, "relationship_entity_id": edge.relationship_entity_id, "source_entity_id": edge.source_entity_id, "target_entity_id": edge.target_entity_id, "evidence_ids": sorted(attached_by_edge.get(edge.id, []))})
    history = list(db.scalars(select(ClaimReviewEvent).where(ClaimReviewEvent.claim_id == claim.id).order_by(ClaimReviewEvent.created_at.desc())).all())
    # What the grade is judged from: the stances, and how many separate sources the evidence comes from.
    # A superseded link is shown but not counted (supersede_claim_evidence).
    sources = {link_source.id for row in evidence_rows if row["superseded"] is None and isinstance(link_source := row["source"], Source)}
    from app.services.claim_done import done_checks

    return {"claim": claim, "evidence": evidence_rows, "dependent_relationships": relationships, "review_history": history,
            "stance_counts": {s: sum(1 for x in links if x.stance == s and x.counts_toward_claim) for s in ("supports", "contradicts", "context")},
            "superseded_count": sum(1 for x in links if not x.counts_toward_claim),
            "source_count": len(sources),
            "done": {"supported": done_checks(db, claim, target="supported"), "confirmed": done_checks(db, claim, target="confirmed")}}


CLAIM_STATUSES = {"lead", "unverified", "supported", "confirmed", "disputed", "rejected"}


def validate_claim_fields(*, status: str | None, confidence: float | None) -> None:
    if status is not None and status not in CLAIM_STATUSES:
        raise ValueError(f"Invalid claim status. Allowed: {', '.join(sorted(CLAIM_STATUSES))}")
    if confidence is not None and not 0.0 <= confidence <= 1.0:
        raise ValueError("Claim confidence must be between 0 and 1")


def create_claim(db: Session, body: ClaimCreate) -> Claim:
    """Validate and persist a new Claim. Raises ValueError for a bad
    status/confidence or empty text. The caller is responsible for
    confirming body.investigation_id exists (a 404 concern)."""
    validate_claim_fields(status=body.status, confidence=body.confidence)
    if not body.text.strip():
        raise ValueError("Claim text is required")
    row = Claim(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_claim(db: Session, row: Claim, changes: dict) -> Claim:
    """Apply a partial update to a Claim. Raises ValueError for a bad
    status/confidence or an empty text value."""
    validate_claim_fields(status=changes.get("status"), confidence=changes.get("confidence"))
    if changes.get("status") in {"supported", "confirmed"} and changes["status"] != row.status:
        raise ValueError("Mark a claim Supported or Confirmed by reviewing it (POST /api/claims/{id}/reviews), "
                         "so the Done rules run and the reason is kept")
    if "text" in changes:
        if changes["text"] is None or not changes["text"].strip():
            raise ValueError("Claim text is required")
        row.text = changes["text"].strip()
    if "status" in changes and changes["status"] is not None:
        row.status = changes["status"]
    if "confidence" in changes and changes["confidence"] is not None:
        row.confidence = changes["confidence"]
    db.commit()
    db.refresh(row)
    return row


def link_claim_evidence(db: Session, claim: Claim, evidence: Evidence, *, stance: str, note: str | None) -> Any:
    """Validate and persist a ClaimEvidenceLink (or return the existing one
    if this exact claim/evidence/stance link already exists). Raises
    ValueError if claim and evidence don't share an investigation, or the
    stance isn't one of the allowed values. The caller confirms the claim
    and evidence both exist (a 404 concern)."""
    source = db.get(Source, evidence.source_id)
    if source is None or source.investigation_id != claim.investigation_id:
        raise ValueError("Claim and evidence must belong to the same investigation")
    if stance not in {"supports", "contradicts", "context"}:
        raise ValueError("Stance must be supports, contradicts, or context")
    existing = db.scalar(select(ClaimEvidenceLink).where(
        ClaimEvidenceLink.claim_id == claim.id,
        ClaimEvidenceLink.evidence_id == evidence.id,
        ClaimEvidenceLink.stance == stance,
    ))
    if existing is not None:
        return existing
    row = ClaimEvidenceLink(claim_id=claim.id, evidence_id=evidence.id, stance=stance, note=note)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def superseded_of(db: Session, link: ClaimEvidenceLink) -> dict[str, Any] | None:
    """A superseded link's mark, as every screen shows it: when, the record that replaces it (its source's title and
    place, when it is in the case), why, and who marked it. None while the link counts."""
    if link.superseded_at is None:
        return None
    by = db.get(Evidence, link.superseded_by_evidence_id) if link.superseded_by_evidence_id else None
    by_source = db.get(Source, by.source_id) if by is not None else None
    return {"at": link.superseded_at, "by_evidence_id": by.id if by is not None else None,
            "by_label": by_source.title if by_source is not None else None, "by_locator": by.locator if by is not None else None,
            "reason": link.superseded_reason or "", "decided_by_id": link.superseded_decided_by_id,
            "decided_by_name": link.superseded_decided_by_name}


def supersede_claim_evidence(db: Session, claim: Claim, link: ClaimEvidenceLink, *, reason: str,
                             by_evidence_id: str | None = None) -> ClaimEvidenceLink:
    """Mark a claim's evidence link superseded by a newer record (or change the mark: who and when are taken again).
    The link stays, with its stance, but no longer counts toward the claim (claim_done.py, stories.py, custody_chain.py).
    A reason is required (the suite: a status does not change without a stated basis); the replacing record is
    optional, as it may not be in the case yet, and must be another record of the same case."""
    if link.claim_id != claim.id:
        raise LookupError("Evidence link not found on this claim")
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Say why this evidence is superseded")
    by_id = (by_evidence_id or "").strip() or None
    if by_id is not None:
        if by_id == link.evidence_id:
            raise ValueError("Evidence cannot supersede itself")
        by = db.get(Evidence, by_id)
        by_source = db.get(Source, by.source_id) if by is not None else None
        if by is None or by_source is None or by_source.investigation_id != claim.investigation_id:
            raise ValueError("The replacing evidence must be a record of the same case")
        # Two records replacing each other would leave the claim with neither: refuse the loop.
        loop = db.scalar(select(ClaimEvidenceLink.id).where(
            ClaimEvidenceLink.claim_id == claim.id, ClaimEvidenceLink.evidence_id == by_id,
            ClaimEvidenceLink.superseded_by_evidence_id == link.evidence_id, ClaimEvidenceLink.superseded_at.is_not(None)))
        if loop is not None:
            raise ValueError("That record is itself marked superseded by this one; undo that first")
    link.superseded_at = utcnow_naive()
    link.superseded_by_evidence_id = by_id
    link.superseded_reason = reason
    link.superseded_decided_by_id = link.superseded_decided_by_name = None  # stamped at flush (app/db/decided_by.py)
    db.commit()
    db.refresh(link)
    return link


def unsupersede_claim_evidence(db: Session, claim: Claim, link: ClaimEvidenceLink) -> ClaimEvidenceLink:
    """Undo a superseded mark: the link counts toward the claim again."""
    if link.claim_id != claim.id:
        raise LookupError("Evidence link not found on this claim")
    link.superseded_at = None
    link.superseded_by_evidence_id = None
    link.superseded_reason = None
    link.superseded_decided_by_id = link.superseded_decided_by_name = None
    db.commit()
    db.refresh(link)
    return link


def link_out(db: Session, link: ClaimEvidenceLink) -> dict[str, Any]:
    """The link as stored, with its superseded mark."""
    return {"id": link.id, "claim_id": link.claim_id, "evidence_id": link.evidence_id, "stance": link.stance, "note": link.note,
            "decided_by_id": link.decided_by_id, "decided_by_name": link.decided_by_name, "created_at": link.created_at,
            "superseded": superseded_of(db, link)}


def list_claim_evidence(db: Session, claim_id: str) -> list[dict]:
    """Return a claim's evidence links, each with its evidence and source
    attached. The caller confirms the claim exists (a 404 concern)."""
    links = db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim_id).order_by(ClaimEvidenceLink.created_at)).all()
    rows = []
    for link in links:
        evidence = db.get(Evidence, link.evidence_id)
        source = db.get(Source, evidence.source_id) if evidence else None
        rows.append({
            "id": link.id, "stance": link.stance, "note": link.note, "created_at": link.created_at,
            "evidence": evidence, "source": source, "superseded": superseded_of(db, link),
        })
    return rows
