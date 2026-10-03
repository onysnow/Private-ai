from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
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
                 evidence_grade: str | None = None, agreement_grade: str | None = None) -> Any:
    """Record a reporter's review: the claim's status, confidence and, when
    given, its grade (both halves together; a review without one keeps the
    grade the claim has)."""
    rationale = rationale.strip()
    if not rationale:
        raise ValueError("Reporter rationale is required for a claim review")
    validate_grade(evidence_grade=evidence_grade, agreement_grade=agreement_grade)
    new_evidence = evidence_grade if evidence_grade is not None else claim.evidence_grade
    new_agreement = agreement_grade if agreement_grade is not None else claim.agreement_grade
    event = ClaimReviewEvent(
        claim_id=claim.id, from_status=claim.status, to_status=status,
        from_confidence=claim.confidence, to_confidence=confidence, rationale=rationale,
        from_evidence_grade=claim.evidence_grade, to_evidence_grade=new_evidence,
        from_agreement_grade=claim.agreement_grade, to_agreement_grade=new_agreement,
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
        evidence_rows.append({"id": link.id, "stance": link.stance, "note": link.note, "created_at": link.created_at, "evidence": evidence, "source": source})
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
    sources = {link_source.id for row in evidence_rows if isinstance(link_source := row["source"], Source)}
    return {"claim": claim, "evidence": evidence_rows, "dependent_relationships": relationships, "review_history": history,
            "stance_counts": {s: sum(1 for x in links if x.stance == s) for s in ("supports", "contradicts", "context")},
            "source_count": len(sources)}


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
            "evidence": evidence, "source": source,
        })
    return rows
