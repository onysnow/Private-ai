"""OpenAleph's cross-referencing, as proposals for reporters (ADR-0006, Wave B).

After a push changes what an investigation's collection holds, OpenAleph is
asked to cross-reference the collection (POST /api/2/collections/{id}/xref):
every matchable entity in it is compared with everything OpenAleph has
indexed (aleph/logic/xref.py xref_collection; scored by nomenklatura's
regression-v1 unless the deployment configures another algorithm). Each match
that involves one of the investigation's confirmed entities becomes a
proposal here:

- a match with an entity that is not one of the investigation's confirmed
  records is a "cross-reference" for a reporter to review: "Same entity",
  "Different" or "Not sure", with a note. The decision is kept here and sent
  to OpenAleph as a pairwise match judgement (POST /api/2/profiles/_pairwise,
  by the corpus push job), so OpenAleph's profiles agree with the Workbench.
  "Same entity" also records the OpenAleph entity as an external identity of
  ours through the Workbench's existing external-identity record -- a
  connector finding with a positive resolution decision -- which is what the
  dossier lists and what "Expand in the corpus" follows.
- a match between two of the investigation's own confirmed entities is a
  possible duplicate: it joins the dossier's duplicate candidates
  (app/services/resolution.py) and is decided through the existing
  canonical-resolution and merge flow, not a second one.

Cross-referencing is suggestive, not definitive (ADR-0005, line 1): nothing
here changes a confirmed record.
"""

from __future__ import annotations

from typing import Any

from followthemoney import model
from followthemoney.compare import compare_scores
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.authorization import AuthorizationScope
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import (
    ConnectorFinding,
    CrossReferenceDecision,
    CrossReferenceProposal,
    Entity,
    InvestigationCorpusBinding,
    OpenAlephEntityLink,
)
from app.schemas.api import ResolutionRequest
from app.services.connector_findings import create_resolution_decision
from app.services.openaleph_corpus import PROVIDER, record_openaleph_operation_failure
from app.services.openaleph_gateway import CorpusGateway, OpenAlephNotFound

KIND_CORPUS = "corpus"
KIND_DUPLICATE = "duplicate"
# A reporter's decision and the judgement OpenAleph records for it
# (aleph/model/entityset.py Judgement).
JUDGEMENTS = {"same": "positive", "different": "negative", "unsure": "unsure"}
# What a decision makes of the external-identity record (ResolutionDecision).
RESOLUTIONS = {"same": "positive", "different": "negative", "unsure": "unsure"}
OPERATION_JUDGEMENT = "corpus_judgement"
MAX_VALUES = 10


def _strings(properties: Any) -> dict[str, list[str]]:
    """The plain values of an OpenAleph entity's properties. Entity
    references can come back as nested entities (views/serializers.py), which
    no matching or display here needs."""
    out: dict[str, list[str]] = {}
    for prop, values in (properties or {}).items() if isinstance(properties, dict) else []:
        kept = [str(value) for value in (values if isinstance(values, list) else [values]) if isinstance(value, (str, int, float))]
        if kept:
            out[str(prop)] = kept
    return out


def _proxy(entity: dict[str, Any]) -> Any:
    schema = model.get(str(entity.get("schema") or ""))
    if schema is None:
        return None
    return model.get_proxy({"id": entity.get("id"), "schema": schema.name, "properties": _strings(entity.get("properties"))},
                           cleaned=False)


def matched_properties(ours: dict[str, Any], theirs: dict[str, Any]) -> list[dict[str, Any]]:
    """Which kinds of property agree, and how well, as followthemoney itself
    compares two entities (followthemoney/compare.py compare_scores: one score
    per matchable property type both sides have -- names, identifiers,
    countries, dates, addresses, emails, phones...). OpenAleph's own score
    comes from its xref algorithm; this says what the two have in common."""
    left, right = _proxy(ours), _proxy(theirs)
    if left is None or right is None:
        return []
    rows = []
    for prop_type, score in compare_scores(left, right).items():
        if not score:  # None: only one side has this kind of value; 0: nothing alike
            continue
        rows.append({
            "property_type": prop_type.name,
            "label": str(prop_type.label),
            "score": round(float(score), 3),
            "ours": left.get_type_values(prop_type)[:MAX_VALUES],
            "theirs": right.get_type_values(prop_type)[:MAX_VALUES],
        })
    return sorted(rows, key=lambda row: (-row["score"], row["property_type"]))


def _active_entity(db: Session, link: OpenAlephEntityLink) -> Entity | None:
    """The confirmed entity a link holds, if it is one and still active."""
    if link.record_type != "entity":
        return None
    entity = db.get(Entity, link.record_id)
    if entity is None or entity.merged_into_entity_id:
        return None
    return entity


def _collection_of(entity: dict[str, Any]) -> tuple[str | None, str | None]:
    """The collection an OpenAleph entity is in, and its label: the entity
    serializer nests the collection (views/serializers.py EntitySerializer)."""
    nested = entity.get("collection")
    collection: dict[str, Any] = nested if isinstance(nested, dict) else {}
    collection_id = entity.get("collection_id") or collection.get("collection_id") or collection.get("id")
    label = collection.get("label")
    return (str(collection_id) if collection_id not in (None, "") else None, str(label) if label else None)


def import_cross_references(db: Session, investigation_id: str, rows: list[dict[str, Any]]) -> dict[str, int]:
    """Store OpenAleph's matches for one investigation as proposals.

    A pair seen before is updated (score, what matched), never reopened once
    decided; a pair no longer reported stays as it was, since the latest run
    may simply not have reached it.
    """
    links_here = {row.openaleph_entity_id: row for row in db.scalars(
        select(OpenAlephEntityLink).where(OpenAlephEntityLink.investigation_id == investigation_id))}
    counts = {"results": len(rows), "new": 0, "updated": 0, "duplicates": 0, "skipped": 0}
    pairs: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    for row in rows:
        entity, match = row.get("entity"), row.get("match")
        if not isinstance(entity, dict) or not isinstance(match, dict) or not entity.get("id") or not match.get("id"):
            counts["skipped"] += 1
            continue
        if str(entity["id"]) in links_here:
            pairs.append((entity, match, row))
        elif str(match["id"]) in links_here:
            # The other side is the investigation's: our record is the match.
            pairs.append((match, entity, row))
        else:
            counts["skipped"] += 1  # neither side is a confirmed record of this investigation
    collection_ids = {cid for _ours, other, _row in pairs for cid in [_collection_of(other)[0]] if cid}
    bindings = {row.collection_id: row for row in db.scalars(
        select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.collection_id.in_(collection_ids)))} if collection_ids else {}
    now = utcnow_naive()
    seen: set[tuple[str, str]] = set()
    for ours, other, row in pairs:
        our_link = links_here[str(ours["id"])]
        our_entity = _active_entity(db, our_link)
        if our_entity is None:
            counts["skipped"] += 1  # merged away, or a relationship record
            continue
        other_link = links_here.get(str(other["id"]))
        other_entity: Entity | None = None
        if other_link is not None:
            other_entity = _active_entity(db, other_link)
            if other_entity is None:
                counts["skipped"] += 1
                continue
            if other_entity.id < our_entity.id:
                # One proposal per pair of our own records, whichever way
                # round OpenAleph reported it.
                our_entity, other_entity = other_entity, our_entity
                our_link, other_link = other_link, our_link
                ours, other = other, ours
        kind = KIND_DUPLICATE if other_entity is not None else KIND_CORPUS
        key = (our_entity.id, str(other["id"]))
        if key in seen:
            continue
        seen.add(key)
        collection_id, label = _collection_of(other)
        binding = bindings.get(collection_id or "")
        proposal = db.scalar(select(CrossReferenceProposal).where(
            CrossReferenceProposal.entity_id == our_entity.id, CrossReferenceProposal.match_openaleph_id == str(other["id"])))
        values = {
            "openaleph_entity_id": our_link.openaleph_entity_id,
            "match_kind": kind,
            "other_entity_id": other_entity.id if other_entity is not None else None,
            "match_collection_id": collection_id,
            "match_collection_label": label or (binding.collection_label if binding else None),
            "match_investigation_id": binding.investigation_id if binding else None,
            "match_schema": str(other.get("schema") or ""),
            "match_caption": str(other.get("caption") or other["id"])[:512],
            "match_properties": _strings(other.get("properties")),
            "matched_properties": matched_properties(ours, other),
            "score": float(row.get("score") or 0.0),
            "method": str(row.get("method"))[:64] if row.get("method") else None,
            "last_seen_at": now,
        }
        if proposal is None:
            proposal = CrossReferenceProposal(investigation_id=investigation_id, entity_id=our_entity.id,
                                              match_openaleph_id=str(other["id"]), status="open", first_seen_at=now, **values)
            db.add(proposal)
            counts["duplicates" if kind == KIND_DUPLICATE else "new"] += 1
        else:
            for name, value in values.items():
                setattr(proposal, name, value)
            counts["updated"] += 1
    db.commit()
    return counts


# --- review ----------------------------------------------------------------------

def visible_to(proposal: CrossReferenceProposal, scope: AuthorizationScope | None) -> bool:
    """A match held in another investigation's collection is shown only to
    someone who may read that investigation: cross-referencing runs across
    every collection (OpenAleph runs single-user behind the Workbench,
    ADR-0006 "Not used"), but the Workbench keeps investigations apart
    (ADR-0002)."""
    if scope is None or proposal.match_investigation_id is None:
        return True
    return scope.allows(proposal.match_investigation_id)


def _latest_decisions(db: Session, proposal_ids: list[str]) -> dict[str, CrossReferenceDecision]:
    latest: dict[str, CrossReferenceDecision] = {}
    if not proposal_ids:
        return latest
    for row in db.scalars(select(CrossReferenceDecision).where(CrossReferenceDecision.proposal_id.in_(proposal_ids))
                          .order_by(CrossReferenceDecision.created_at, CrossReferenceDecision.id)):
        latest[row.proposal_id] = row
    return latest


def _identity_finding(db: Session, investigation_id: str, openaleph_id: str) -> ConnectorFinding | None:
    return db.scalar(select(ConnectorFinding).where(
        ConnectorFinding.investigation_id == investigation_id, ConnectorFinding.provider == PROVIDER,
        ConnectorFinding.provider_record_id == openaleph_id).order_by(ConnectorFinding.created_at))


def openaleph_url(entity_id: str) -> str:
    return f"{settings.openaleph_ui_url.rstrip('/')}/entities/{entity_id}"


def serialize_cross_reference(db: Session, proposal: CrossReferenceProposal, latest: CrossReferenceDecision | None = None,
                              *, entity: Entity | None = None) -> dict[str, Any]:
    entity = entity or db.get(Entity, proposal.entity_id)
    finding = _identity_finding(db, proposal.investigation_id, proposal.match_openaleph_id)
    return {
        "id": proposal.id,
        "investigation_id": proposal.investigation_id,
        "status": proposal.status,
        "entity": {"id": proposal.entity_id, "caption": entity.caption if entity else "", "schema": entity.schema if entity else ""},
        "openaleph_entity_id": proposal.openaleph_entity_id,
        "match": {
            "openaleph_id": proposal.match_openaleph_id,
            "collection_id": proposal.match_collection_id,
            "collection_label": proposal.match_collection_label,
            "investigation_id": proposal.match_investigation_id,
            "schema": proposal.match_schema,
            "caption": proposal.match_caption,
            "properties": proposal.match_properties or {},
            "url": openaleph_url(proposal.match_openaleph_id),
        },
        "matched_properties": proposal.matched_properties or [],
        "score": proposal.score,
        "method": proposal.method,
        "decision": None if latest is None else {
            "id": latest.id,
            "decision": latest.decision,
            "note": latest.note,
            "judgement": latest.judgement,
            "judgement_status": latest.judgement_status,
            "judgement_sent_at": latest.judgement_sent_at,
            "judgement_error": latest.judgement_error,
            "created_at": latest.created_at,
        },
        "identity_finding_id": finding.id if finding is not None else None,
        "first_seen_at": proposal.first_seen_at,
        "last_seen_at": proposal.last_seen_at,
    }


def list_cross_references(db: Session, investigation_id: str, *, scope: AuthorizationScope | None,
                          status: str | None = "open") -> list[dict[str, Any]]:
    """The investigation's cross-references (matches outside its own
    records), best score first, without those on records merged away."""
    stmt = (select(CrossReferenceProposal, Entity)
            .join(Entity, Entity.id == CrossReferenceProposal.entity_id)
            .where(CrossReferenceProposal.investigation_id == investigation_id,
                   CrossReferenceProposal.match_kind == KIND_CORPUS,
                   Entity.merged_into_entity_id.is_(None))
            .order_by(CrossReferenceProposal.score.desc(), CrossReferenceProposal.id))
    if status:
        stmt = stmt.where(CrossReferenceProposal.status == status)
    rows = [(proposal, entity) for proposal, entity in db.execute(stmt).all() if visible_to(proposal, scope)]
    latest = _latest_decisions(db, [proposal.id for proposal, _entity in rows])
    return [serialize_cross_reference(db, proposal, latest.get(proposal.id), entity=entity) for proposal, entity in rows]


def decide_cross_reference(db: Session, proposal: CrossReferenceProposal, *, decision: str, note: str | None) -> dict[str, Any]:
    """Record a reporter's decision on a cross-reference.

    The decision is kept as history (the latest stands) and queued for
    OpenAleph as a pairwise judgement; an earlier decision not yet sent is
    superseded rather than sent too. "Same entity" records the OpenAleph
    entity as an external identity of ours; changing one's mind later adds a
    new resolution to that identity record rather than erasing it.
    """
    from app.jobs.corpus import request_corpus_sync

    if decision not in JUDGEMENTS:
        raise ValueError("decision must be same, different or unsure")
    if proposal.match_kind != KIND_CORPUS:
        raise ValueError("Two of the investigation's own records are decided as a possible duplicate, on the entity's dossier")
    entity = db.get(Entity, proposal.entity_id)
    if entity is None or entity.merged_into_entity_id:
        raise ValueError("This entity was merged into another record; decide on the record that stayed")
    note = (note or "").strip() or None
    for older in db.scalars(select(CrossReferenceDecision).where(
            CrossReferenceDecision.proposal_id == proposal.id, CrossReferenceDecision.judgement_status == "pending")):
        older.judgement_status = "superseded"
    row = CrossReferenceDecision(investigation_id=proposal.investigation_id, proposal_id=proposal.id, decision=decision,
                                 note=note, judgement=JUDGEMENTS[decision], judgement_status="pending")
    db.add(row)
    proposal.status = "decided"
    finding = _identity_finding(db, proposal.investigation_id, proposal.match_openaleph_id)
    if finding is None and decision == "same":
        finding = ConnectorFinding(
            investigation_id=proposal.investigation_id, provider=PROVIDER, provider_record_id=proposal.match_openaleph_id,
            caption=proposal.match_caption, schema=proposal.match_schema or None, properties=proposal.match_properties or {},
            source_url=openaleph_url(proposal.match_openaleph_id),
            raw={"cross_reference_id": proposal.id, "collection_id": proposal.match_collection_id,
                 "collection_label": proposal.match_collection_label, "score": proposal.score, "method": proposal.method},
        )
        db.add(finding)
        db.flush()
    if finding is not None:
        reason = note or f"Reporter decision on an OpenAleph cross-reference ({proposal.match_collection_label or 'corpus'})"
        resolution = create_resolution_decision(db, finding, ResolutionRequest(
            entity_id=entity.id, decision=RESOLUTIONS[decision], confidence=proposal.score if decision == "same" else 1.0,
            rationale=reason))
        row.resolution_decision_id = resolution.id
    db.commit()
    db.refresh(row)
    # The judgement goes to OpenAleph with the next corpus push (app/jobs/corpus.py).
    request_corpus_sync(db, proposal.investigation_id)
    return serialize_cross_reference(db, proposal, row, entity=entity)


def open_cross_reference_count(db: Session, investigation_id: str, *, scope: AuthorizationScope | None) -> int:
    """How many cross-references wait for a reporter (as the review list shows them)."""
    stmt = (select(CrossReferenceProposal)
            .join(Entity, Entity.id == CrossReferenceProposal.entity_id)
            .where(CrossReferenceProposal.investigation_id == investigation_id,
                   CrossReferenceProposal.match_kind == KIND_CORPUS,
                   CrossReferenceProposal.status == "open",
                   Entity.merged_into_entity_id.is_(None)))
    return sum(1 for proposal in db.scalars(stmt) if visible_to(proposal, scope))


def pending_judgements(db: Session, investigation_id: str) -> int:
    return len(db.scalars(select(CrossReferenceDecision.id).where(
        CrossReferenceDecision.investigation_id == investigation_id,
        CrossReferenceDecision.judgement_status == "pending")).all())


def send_pending_judgements(db: Session, investigation_id: str, *, gateway: CorpusGateway) -> dict[str, int]:
    """Send reporters' decisions to OpenAleph as pairwise judgements.

    A judgement OpenAleph refuses (one of the two entities is gone, or it
    cannot compare their types: logic/profiles.py decide_pairwise) is marked
    failed and recorded; one that could not reach OpenAleph stays pending and
    the error is raised, so the push is tried again later.
    """
    import httpx

    counts = {"sent": 0, "failed": 0}
    rows = list(db.scalars(select(CrossReferenceDecision).where(
        CrossReferenceDecision.investigation_id == investigation_id,
        CrossReferenceDecision.judgement_status == "pending").order_by(CrossReferenceDecision.created_at)))
    for row in rows:
        proposal = db.get(CrossReferenceProposal, row.proposal_id)
        if proposal is not None and proposal.match_kind == KIND_DUPLICATE and _merged_away(db, proposal):
            row.judgement_status = "superseded"
            db.commit()
            continue
        link = db.scalar(select(OpenAlephEntityLink).where(OpenAlephEntityLink.record_id == proposal.entity_id)) if proposal else None
        error: str | None = None
        profile_id: str | None = None
        if proposal is None or link is None:
            error = "The entity is no longer in OpenAleph"
        else:
            try:
                profile_id = gateway.decide_pairwise(link.openaleph_entity_id, proposal.match_openaleph_id, row.judgement)
            except OpenAlephNotFound as exc:
                error = str(exc)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code >= 500:
                    raise
                error = f"OpenAleph refused the judgement (HTTP {exc.response.status_code}): {exc.response.text[:500]}"
        if error is None:
            row.judgement_status = "sent"
            row.judgement_sent_at = utcnow_naive()
            row.openaleph_profile_id = profile_id
            row.judgement_error = None
            counts["sent"] += 1
            db.commit()
            continue
        row.judgement_status = "failed"
        row.judgement_error = error
        db.commit()
        counts["failed"] += 1
        record_openaleph_operation_failure(db, investigation_id=investigation_id, document_id=None,
                                           operation=OPERATION_JUDGEMENT, error=error)
    return counts


# --- duplicates for the existing merge flow -------------------------------------------

def record_duplicate_judgement(db: Session, entity_a_id: str, entity_b_id: str, *, decision: str,
                               note: str | None) -> CrossReferenceDecision | None:
    """A reporter's same/different/unsure decision on two of the
    investigation's own records (the dossier's duplicate review,
    app/services/resolution.py record_canonical_resolution), queued for
    OpenAleph as a pairwise judgement when OpenAleph itself proposed the
    pair, so its profiles agree with the Workbench as they do for corpus
    matches. A pair OpenAleph never raised is left to the Workbench alone.
    The caller commits."""
    if decision not in JUDGEMENTS:
        return None
    proposal = db.scalar(select(CrossReferenceProposal).where(
        CrossReferenceProposal.match_kind == KIND_DUPLICATE,
        or_(and_(CrossReferenceProposal.entity_id == entity_a_id, CrossReferenceProposal.other_entity_id == entity_b_id),
            and_(CrossReferenceProposal.entity_id == entity_b_id, CrossReferenceProposal.other_entity_id == entity_a_id))))
    if proposal is None:
        return None
    for older in db.scalars(select(CrossReferenceDecision).where(
            CrossReferenceDecision.proposal_id == proposal.id, CrossReferenceDecision.judgement_status == "pending")):
        older.judgement_status = "superseded"
    row = CrossReferenceDecision(investigation_id=proposal.investigation_id, proposal_id=proposal.id, decision=decision,
                                 note=(note or "").strip() or None, judgement=JUDGEMENTS[decision], judgement_status="pending")
    db.add(row)
    proposal.status = "decided"
    db.flush()
    return row


def _merged_away(db: Session, proposal: CrossReferenceProposal) -> bool:
    """Whether either of a duplicate pair has since been merged: the push
    then removes it from OpenAleph, which says more than a judgement would,
    and a judgement on a removed entity would only fail."""
    for entity_id in (proposal.entity_id, proposal.other_entity_id):
        entity = db.get(Entity, entity_id) if entity_id else None
        if entity is None or entity.merged_into_entity_id:
            return True
    return False


def duplicate_matches(db: Session, entity_id: str) -> list[CrossReferenceProposal]:
    """OpenAleph's matches between this record and another of the
    investigation's confirmed records (app/services/resolution.py adds them to
    the dossier's duplicate candidates)."""
    return list(db.scalars(select(CrossReferenceProposal).where(
        CrossReferenceProposal.match_kind == KIND_DUPLICATE,
        or_(CrossReferenceProposal.entity_id == entity_id, CrossReferenceProposal.other_entity_id == entity_id))))
