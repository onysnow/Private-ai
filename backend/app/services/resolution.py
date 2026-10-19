import re
from typing import Any

from followthemoney import model
from followthemoney.compare import compare_names
from followthemoney.exc import InvalidData
from followthemoney.schema import Schema
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.domain import Entity, RelationshipEdge, CanonicalResolutionDecision
from app.services.entity_aliases import resolve_active_entity

def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


# How alike two names are (design doc "Document Ingestion & Review System
# Design", Phase 4: a scored decision in place of a binary guard). Two
# measures, the stronger kept:
# - FollowTheMoney's own name comparison (followthemoney.compare
#   compare_names, the comparison OpenAleph's matching is built on): it
#   reads "Ltd" and "Limited" as one, ignores word order ("Voss, Alaric") and
#   personal titles, forgives small spelling slips, and only compares records
#   whose kinds can be the same thing -- a Company is never a Person
#   (model.common_schema). It is strict about extra words, so
# - the share of words two names have in common still lists a name that is
#   part of another ("Bellcastle Trading" in "Bellcastle Trading Group").
# Tiers, conservative by default (a wrong merge costs more in an
# investigation than a missed one, as the design doc notes): the same name
# (FtM 0.9 or more, or the same words) must be answered "same" or "new"
# before a proposal is accepted; a similar name (FtM 0.7 or more) or most
# words shared is listed; nothing is ever linked without the reporter.
SAME_NAME = 0.9
SIMILAR_NAME = 0.7
BASIS_SAME, BASIS_SIMILAR, BASIS_WORDS = "same_name", "similar_name", "shared_words"


def _proxy(schema: Schema, caption: str) -> Any:
    proxy = model.make_entity(schema)
    proxy.id = "candidate"
    proxy.add("name", caption, quiet=True)
    return proxy


def candidate_entities(db: Session, investigation_id: str, caption: str, schema: str | None, *,
                       schema_is_guess: bool = False) -> list[dict]:
    """The investigation's records that may be what ``caption`` names, best
    first. ``schema_is_guess``: the proposal's kind is only a guess (the
    pattern finder's 0.40, or a name OpenAleph gave no kind), so it is
    compared as "some legal entity" and a guessed Person still finds the
    Company of the same name."""
    needle = set(_norm(caption).split())
    wanted = None if schema_is_guess else model.get(schema or "")
    query_schema = wanted if wanted is not None and wanted.matchable else model.get("LegalEntity")
    assert query_schema is not None
    relationship_ids = select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)
    rows = db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None), ~Entity.id.in_(relationship_ids))).all()
    scored: list[dict[str, Any]] = []
    for row in rows:
        row_schema = model.get(row.schema)
        similarity: float | None = None
        if row_schema is not None:
            try:
                common = model.common_schema(query_schema, row_schema)
            except InvalidData:
                continue   # kinds that can never be the same thing
            if common.matchable and caption.strip() and (row.caption or "").strip():
                similarity = compare_names(common, _proxy(common, caption), _proxy(common, row.caption))
        hay = set(_norm(row.caption).split())
        overlap = len(needle & hay) / max(1, len(needle | hay))
        same_words = bool(needle) and needle == hay
        score = max(overlap, similarity or 0.0, 1.0 if same_words else 0.0)
        if score <= 0:
            continue
        basis = (BASIS_SAME if same_words or (similarity or 0) >= SAME_NAME
                 else BASIS_SIMILAR if (similarity or 0) >= SIMILAR_NAME else BASIS_WORDS)
        scored.append({"entity_id": row.id, "caption": row.caption, "schema": row.schema, "score": round(score, 4),
                       "name_similarity": None if similarity is None else round(similarity, 4), "basis": basis,
                       # How much the record already holds, for the "already in the case" card (reading room).
                       "facts": sum(len(v) for v in (row.properties or {}).values() if isinstance(v, list))})
    return sorted(scored, key=lambda x: x["score"], reverse=True)[:10]


def same_name(a: str, b: str) -> bool:
    """Whether two names read as the same name (the strong tier above): the same words, or FollowTheMoney's
    comparison at SAME_NAME or more, compared as legal entities so a guessed kind does not keep them apart."""
    if not a.strip() or not b.strip():
        return False
    if set(_norm(a).split()) == set(_norm(b).split()):
        return True
    schema = model.get("LegalEntity")
    assert schema is not None
    return (compare_names(schema, _proxy(schema, a), _proxy(schema, b)) or 0.0) >= SAME_NAME


FOUND_BY_NAME = "name_overlap"
FOUND_BY_XREF = "openaleph_xref"


def _with_cross_reference_matches(db: Session, entity: Entity, candidates: list[dict]) -> list[dict]:
    """Add OpenAleph's cross-referencing matches between this record and the
    investigation's other confirmed records (ADR-0006, Wave B): they are
    possible duplicates for this same review and merge flow, not a second
    one. A record both ways keeps the higher score; ``found_by`` says which."""
    from app.services.cross_references import duplicate_matches

    by_id = {row["entity_id"]: {**row, "found_by": [FOUND_BY_NAME]} for row in candidates}
    for match in duplicate_matches(db, entity.id):
        other_id = match.other_entity_id if match.entity_id == entity.id else match.entity_id
        other = db.get(Entity, other_id) if other_id else None
        if other is None or other.merged_into_entity_id or other.id == entity.id:
            continue
        row = by_id.get(other.id)
        if row is None:
            by_id[other.id] = {"entity_id": other.id, "caption": other.caption, "schema": other.schema,
                               "score": round(match.score, 4), "found_by": [FOUND_BY_XREF]}
        else:
            row["score"] = max(row["score"], round(match.score, 4))
            row["found_by"] = [FOUND_BY_NAME, FOUND_BY_XREF]
    return sorted(by_id.values(), key=lambda row: row["score"], reverse=True)


def canonical_duplicate_candidates(db: Session, entity: Entity) -> list[dict]:
    resolved_entity, _ = resolve_active_entity(db, entity)
    if resolved_entity is None:
        return []
    candidates = candidate_entities(db, resolved_entity.investigation_id, resolved_entity.caption, resolved_entity.schema)
    candidates = _with_cross_reference_matches(db, resolved_entity, candidates)
    latest: dict[str, CanonicalResolutionDecision] = {}
    rows = db.scalars(select(CanonicalResolutionDecision).where(
        CanonicalResolutionDecision.investigation_id == resolved_entity.investigation_id,
        ((CanonicalResolutionDecision.entity_a_id == resolved_entity.id) | (CanonicalResolutionDecision.entity_b_id == resolved_entity.id)),
    ).order_by(CanonicalResolutionDecision.created_at.desc())).all()
    for row in rows:
        other = row.entity_b_id if row.entity_a_id == resolved_entity.id else row.entity_a_id
        latest.setdefault(other, row)
    out = []
    for candidate in candidates:
        if candidate["entity_id"] == resolved_entity.id:
            continue
        decision = latest.get(candidate["entity_id"])
        out.append({**candidate, "latest_decision": None if decision is None else {
            "id": decision.id, "decision": decision.decision, "confidence": decision.confidence,
            "rationale": decision.rationale, "created_at": decision.created_at.isoformat(),
        }})
    return out


def record_canonical_resolution(db: Session, entity: Entity, other: Entity, *, decision: str, confidence: float, rationale: str | None, commit: bool = True) -> Any:
    if entity.id == other.id:
        raise ValueError("An entity cannot be resolved against itself")
    if entity.investigation_id != other.investigation_id:
        raise ValueError("Both entities must belong to the same investigation")
    from app.jobs.corpus import request_corpus_sync
    from app.services.cross_references import record_duplicate_judgement

    a, b = sorted((entity.id, other.id))
    row = CanonicalResolutionDecision(
        investigation_id=entity.investigation_id, entity_a_id=a, entity_b_id=b,
        decision=decision, confidence=confidence, rationale=rationale,
    )
    db.add(row)
    # When OpenAleph proposed this pair, the decision goes back to it as a
    # pairwise judgement with the next corpus push (ADR-0006, Wave B).
    judgement = record_duplicate_judgement(db, a, b, decision=decision, note=rationale)
    if commit:
        db.commit(); db.refresh(row)
        if judgement is not None:
            request_corpus_sync(db, entity.investigation_id)
    else:
        db.flush()
    return row
