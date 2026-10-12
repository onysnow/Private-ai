"""Setting the Authority System Suite's fields on a claim, source, evidence record or
link (the app-side suite gaps; the values come from app/ai/suite_vocab.py).

A claim's suite fields are judgements, so a change is written as a claim review event
with the fields it changed and who reviewed (a person unless the caller says it was
AI-assisted, automated or legal counsel); the claim's history stays whole. Sources,
evidence and links take their fields directly. Every value is checked against the
suite's own list; a value outside it is refused with the list.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.ai import suite_vocab as v
from app.models.domain import Claim, ClaimReviewEvent, Evidence, RelationshipEdge, Source

CLAIM_FIELDS = {"classification": v.CLASSIFICATIONS, "confidence_term": v.CONFIDENCE_TERMS, "confidence_level": v.CONFIDENCE_LEVELS,
                "confidence_basis": None, "warrant": None, "assumptions": list, "limitations": list,
                "verification_verdict": v.VERIFICATION_VERDICTS, "corrected_wording": None}
SOURCE_FIELDS = {"source_tier": v.SOURCE_TIERS, "issuer_or_author": None}
DATE = r"^\d{4}(-\d{2}(-\d{2})?)?$"
EVIDENCE_FIELDS = {"issuer_or_author": None, "authenticity_status": v.AUTHENTICITY_STATUSES, "restates_evidence_id": None,
                   "created_on": DATE, "event_on": DATE, "published_on": DATE, "retrieved_on": DATE, "limitations": list}
RELATIONSHIP_FIELDS = {"evidence_status": v.RELATIONSHIP_EVIDENCE_STATUSES}


def _check(fields: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    import re

    out: dict[str, Any] = {}
    for name, value in data.items():
        if name not in fields:
            raise ValueError(f"Unknown field {name!r}")
        rule = fields[name]
        if value is None:
            out[name] = None
        elif rule is list:
            if not isinstance(value, list) or not all(isinstance(x, str) and x.strip() for x in value):
                raise ValueError(f"{name} is a list of sentences")
            out[name] = [x.strip() for x in value]
        elif isinstance(rule, tuple):
            if value not in rule:
                raise ValueError(f"{name} must be one of: {', '.join(rule)}")
            out[name] = value
        elif isinstance(rule, str):
            if not isinstance(value, str) or not re.match(rule, value):
                raise ValueError(f"{name} is a date written YYYY, YYYY-MM or YYYY-MM-DD")
            out[name] = value
        else:
            if not isinstance(value, str):
                raise ValueError(f"{name} is text")
            out[name] = value.strip() or None
    return out


def set_claim_fields(db: Session, claim: Claim, data: dict[str, Any], *, rationale: str, reviewer_type: str = "HUMAN") -> tuple[Claim, ClaimReviewEvent | None]:
    if reviewer_type not in v.REVIEWER_TYPES:
        raise ValueError(f"reviewer_type must be one of: {', '.join(v.REVIEWER_TYPES)}")
    if not rationale.strip():
        raise ValueError("Say why: a change to how a claim is classified or how sure it is needs a reason")
    clean = _check(CLAIM_FIELDS, data)
    verdict = clean.get("verification_verdict", claim.verification_verdict)
    wording = clean.get("corrected_wording", claim.corrected_wording)
    if verdict in ("PARTIALLY VERIFIED", "CONTRADICTED") and not (wording or "").strip():
        raise ValueError("A partly verified or contradicted claim needs corrected wording that does not exceed the evidence (Module 02)")
    term = clean.get("confidence_term", claim.confidence_term)
    level = clean.get("confidence_level", claim.confidence_level)
    basis = clean.get("confidence_basis", claim.confidence_basis)
    if (term or level) and not (basis or "").strip():
        raise ValueError("A likelihood term or confidence level needs its basis: why it is that sure")
    changes = {k: [getattr(claim, k), val] for k, val in clean.items() if getattr(claim, k) != val}
    if not changes:
        return claim, None
    for k, (_, val) in changes.items():
        setattr(claim, k, val)
    event = ClaimReviewEvent(claim_id=claim.id, from_status=claim.status, to_status=claim.status, from_confidence=claim.confidence,
                             to_confidence=claim.confidence, from_evidence_grade=claim.evidence_grade, to_evidence_grade=claim.evidence_grade,
                             from_agreement_grade=claim.agreement_grade, to_agreement_grade=claim.agreement_grade,
                             rationale=rationale.strip(), reviewer_type=reviewer_type, suite_changes=changes)
    db.add(event)
    db.commit(); db.refresh(claim); db.refresh(event)
    return claim, event


def set_source_fields(db: Session, source: Source, data: dict[str, Any]) -> Source:
    for k, val in _check(SOURCE_FIELDS, data).items():
        setattr(source, k, val)
    db.commit(); db.refresh(source)
    return source


def set_evidence_fields(db: Session, evidence: Evidence, data: dict[str, Any]) -> Evidence:
    clean = _check(EVIDENCE_FIELDS, data)
    target = clean.get("restates_evidence_id")
    if target:
        other = db.get(Evidence, target)
        source = db.get(Source, evidence.source_id)
        other_source = db.get(Source, other.source_id) if other else None
        if other is None or other_source is None or source is None or other_source.investigation_id != source.investigation_id:
            raise ValueError("restates_evidence_id must name an evidence record in this case")
        # A restatement points at the original, never round in a loop.
        seen, cur = {evidence.id}, other
        while cur is not None:
            if cur.id in seen:
                raise ValueError("That would make a loop of restatements: point at the original record")
            seen.add(cur.id)
            cur = db.get(Evidence, cur.restates_evidence_id) if cur.restates_evidence_id else None
    for k, val in clean.items():
        setattr(evidence, k, val)
    db.commit(); db.refresh(evidence)
    return evidence


def original_of(db: Session, evidence: Evidence) -> Evidence:
    """The record a chain of restatements points back to (itself when it restates nothing)."""
    seen, cur = set(), evidence
    while cur.restates_evidence_id and cur.id not in seen:
        seen.add(cur.id)
        nxt = db.get(Evidence, cur.restates_evidence_id)
        if nxt is None:
            break
        cur = nxt
    return cur


def set_relationship_fields(db: Session, edge: RelationshipEdge, data: dict[str, Any]) -> RelationshipEdge:
    for k, val in _check(RELATIONSHIP_FIELDS, data).items():
        setattr(edge, k, val)
    db.commit(); db.refresh(edge)
    return edge
