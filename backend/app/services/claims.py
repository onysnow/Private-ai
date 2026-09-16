from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import Claim, ClaimReviewEvent, ClaimEvidenceLink, Evidence, Source, RelationshipEdge, RelationshipEvidenceAttachment


def review_claim(db: Session, claim: Claim, *, status: str, confidence: float, rationale: str):
    rationale = rationale.strip()
    if not rationale:
        raise ValueError("Reporter rationale is required for a claim review")
    event = ClaimReviewEvent(
        claim_id=claim.id, from_status=claim.status, to_status=status,
        from_confidence=claim.confidence, to_confidence=confidence, rationale=rationale,
    )
    claim.status = status
    claim.confidence = confidence
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
        attached_by_edge = {}
        for attachment in attachments:
            attached_by_edge.setdefault(attachment.relationship_edge_id, []).append(attachment.evidence_id)
        for edge in edges:
            relationships.append({"id": edge.id, "relationship_entity_id": edge.relationship_entity_id, "source_entity_id": edge.source_entity_id, "target_entity_id": edge.target_entity_id, "evidence_ids": sorted(attached_by_edge.get(edge.id, []))})
    history = list(db.scalars(select(ClaimReviewEvent).where(ClaimReviewEvent.claim_id == claim.id).order_by(ClaimReviewEvent.created_at.desc())).all())
    return {"claim": claim, "evidence": evidence_rows, "dependent_relationships": relationships, "review_history": history,
            "stance_counts": {s: sum(1 for x in links if x.stance == s) for s in ("supports", "contradicts", "context")}}
