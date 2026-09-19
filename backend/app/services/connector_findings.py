"""Connector-finding review, resolution, and statement-assessment logic
(STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E group 5).
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import ConnectorFinding, ResolutionDecision, StatementAssessment


def update_finding_review_status(db: Session, row: ConnectorFinding, status: str) -> ConnectorFinding:
    """Set a ConnectorFinding's review_status. Raises ValueError for an
    unrecognized status."""
    allowed = {"unreviewed", "accepted", "needs_followup", "rejected"}
    if status not in allowed:
        raise ValueError("Invalid review status")
    row.review_status = status
    db.commit()
    db.refresh(row)
    return row


def create_resolution_decision(db: Session, finding: ConnectorFinding, body) -> ResolutionDecision:
    """Record a resolution decision for a finding and update the finding's
    review_status to match. Raises ValueError for a bad decision enum.
    The caller confirms the finding (and, if given, body.entity_id) exist
    -- a 404 concern."""
    if body.decision not in {"positive", "negative", "unsure"}:
        raise ValueError("Decision must be positive, negative, or unsure")
    row = ResolutionDecision(
        investigation_id=finding.investigation_id, finding_id=finding.id, entity_id=body.entity_id,
        decision=body.decision, confidence=body.confidence, rationale=body.rationale,
    )
    finding.review_status = "accepted" if body.decision == "positive" else ("rejected" if body.decision == "negative" else "needs_followup")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_statement_assessments(db: Session, finding_id: str) -> list[StatementAssessment]:
    # db.scalars(...).all() is typed Sequence[StatementAssessment]; wrap for the declared list return type.
    return list(db.scalars(
        select(StatementAssessment).where(StatementAssessment.finding_id == finding_id).order_by(StatementAssessment.created_at.desc())
    ).all())


def create_statement_assessment(db: Session, finding: ConnectorFinding, body) -> StatementAssessment:
    """Persist a StatementAssessment for a finding. Raises ValueError for
    an unrecognized status. The caller confirms the finding (and, if
    given, body.entity_id) exist -- a 404 concern."""
    allowed = {"accepted", "conflicting", "outdated", "superseded", "unresolved"}
    if body.status not in allowed:
        raise ValueError(f"Status must be one of: {', '.join(sorted(allowed))}")
    row = StatementAssessment(
        investigation_id=finding.investigation_id, finding_id=finding.id, entity_id=body.entity_id,
        prop=body.prop, value=body.value, status=body.status, note=body.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
