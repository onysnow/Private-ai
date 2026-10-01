from __future__ import annotations

from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.search import SearchHit, _snippet, _trace, investigation_search

EXTERNAL_GROUP = "external_lead"

# The record_type strings a reporter can pick a specific record by, for
# build_selected_record_context(). Matches app/services/provenance.py's
# record_provenance_trace() allowed set and the frontend's traceRecordType/
# acceptedRecordType convention -- the same strings a Writeup citation node
# or a LeadLink carries -- not investigation_search()'s internal "reporting_task"
# hit type (translated below, so the same underlying record cites identically
# whether it reached a packet via free-text search or explicit selection).
SELECTABLE_RECORD_TYPES = {"entity", "claim", "evidence", "relationship", "source", "document", "lead", "task"}


class RecordNotFoundError(ValueError):
    """A selected record_type/record_id doesn't exist, or doesn't belong to
    the investigation being built for. Raised eagerly with the offending
    ref named, rather than silently dropped -- a reporter who picked a
    specific piece of evidence expects it to actually be in the packet the
    model sees, not to vanish without explanation.
    """

    def __init__(self, record_type: str, record_id: str):
        self.record_type = record_type
        self.record_id = record_id
        super().__init__(f"{record_type} {record_id!r} not found in this investigation")


def _hit_for_selected_record(db: Session, *, investigation_id: str, record_type: str, record_id: str) -> SearchHit:
    """Fetch one exact record by type+id and build the same SearchHit shape
    investigation_search() produces for it, so a reporter-selected record
    composes into a retrieval packet identically to the same record turning
    up in a free-text search's results. Each branch below mirrors the
    corresponding construction in app/services/search.py; see
    record_provenance_trace() in app/services/provenance.py for the same
    per-record_type dispatch pattern used for a different purpose.
    """
    from app.models.domain import Claim, Document, Entity, Evidence, Lead, LeadProfile, RelationshipEdge, ReportingTask, Source
    from app.services.entity_aliases import resolve_active_entity

    if record_type not in SELECTABLE_RECORD_TYPES:
        raise ValueError(f"record_type must be one of: {', '.join(sorted(SELECTABLE_RECORD_TYPES))}")

    if record_type == "entity":
        row = db.get(Entity, record_id)
        if row is None or row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        active, alias_chain = resolve_active_entity(db, row)
        is_alias = bool(alias_chain)
        properties_text = " ".join(f"{p} {' '.join(str(v) for v in (vals or []))}" for p, vals in (row.properties or {}).items())
        return SearchHit(
            "entity", row.id, row.investigation_id,
            row.caption if not is_alias else f"{row.caption} → {active.caption}",
            _snippet(properties_text or row.caption, ""), 1.0,
            {"kind": "merged_alias" if is_alias else "canonical", "ftm_id": row.ftm_id, **_trace("entity", active.id)},
            {"schema": row.schema, "properties": row.properties or {}},
        )

    if record_type == "claim":
        row = db.get(Claim, record_id)
        if row is None or row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "claim", row.id, row.investigation_id, "Claim", _snippet(row.text, ""), 1.0,
            {"kind": "reporter_claim", **_trace("claim", row.id)},
            {"status": row.status, "confidence": row.confidence},
        )

    if record_type == "evidence":
        row = db.get(Evidence, record_id)
        if row is None:
            raise RecordNotFoundError(record_type, record_id)
        source = db.get(Source, row.source_id)
        if source is None or source.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "evidence", row.id, source.investigation_id, source.title,
            _snippet(row.quote or row.notes or row.locator, ""), 1.0,
            {"kind": "evidence", "source_id": source.id, "source_url": source.url, "locator": row.locator, **_trace("evidence", row.id)},
            {"quote": row.quote, "notes": row.notes},
        )

    if record_type == "relationship":
        edge = db.get(RelationshipEdge, record_id)
        if edge is None or edge.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        rel_entity = db.get(Entity, edge.relationship_entity_id)
        source_entity = db.get(Entity, edge.source_entity_id)
        target_entity = db.get(Entity, edge.target_entity_id)
        label = f"{source_entity.caption if source_entity else edge.source_entity_id} — {edge.schema} → {target_entity.caption if target_entity else edge.target_entity_id}"
        return SearchHit(
            "relationship", edge.id, edge.investigation_id, label,
            _snippet(str(rel_entity.properties or {}) if rel_entity else "", ""), 1.0,
            {"kind": "ftm_relationship", "relationship_entity_id": edge.relationship_entity_id, **_trace("relationship", edge.id)},
            {"schema": edge.schema, "source_entity_id": edge.source_entity_id, "target_entity_id": edge.target_entity_id},
        )

    if record_type == "source":
        row = db.get(Source, record_id)
        if row is None or row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "source", row.id, row.investigation_id, row.title,
            _snippet(row.url or str(row.metadata_json or ""), ""), 1.0,
            {"kind": "source", "url": row.url, **_trace("source", row.id)},
            {"source_type": row.source_type},
        )

    if record_type == "document":
        row = db.get(Document, record_id)
        if row is None or row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        source = db.get(Source, row.source_id)
        return SearchHit(
            "document", row.id, row.investigation_id, source.title if source else row.filename,
            _snippet(row.filename, ""), 1.0,
            {"kind": "document", "source_id": row.source_id, "sha256": row.sha256, **_trace("document", row.id)},
            {"filename": row.filename, "extraction_status": row.extraction_status},
        )

    if record_type == "lead":
        row = db.get(Lead, record_id)
        if row is None or row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        profile = db.scalar(select(LeadProfile).where(LeadProfile.lead_id == row.id))
        return SearchHit(
            "lead", row.id, row.investigation_id, row.title,
            _snippet(row.detail or (profile.next_action if profile else None), ""), 1.0,
            {"kind": "lead", "provider": row.provider, **_trace("lead", row.id)},
            {"status": row.status, "priority": profile.priority if profile else "normal"},
        )

    # record_type == "task": investigation_search()'s own hit type for this
    # model is "reporting_task" (see SEARCH_GROUPS), not "task" -- matched
    # here, not the SELECTABLE_RECORD_TYPES spelling, so this record cites
    # identically regardless of how it entered a retrieval packet.
    row = db.get(ReportingTask, record_id)
    if row is None or row.investigation_id != investigation_id:
        raise RecordNotFoundError(record_type, record_id)
    return SearchHit(
        "reporting_task", row.id, row.investigation_id, row.title, _snippet(row.detail, ""), 1.0,
        {"kind": "reporting_task", "lead_id": row.lead_id, **_trace("task", row.id)},
        {"status": row.status, "priority": row.priority, "owner": row.owner},
    )


def _citation(hit: dict) -> dict:
    provenance = hit.get("provenance") or {}
    return {
        "record_type": hit["type"],
        "record_id": hit["id"],
        "title": hit.get("title"),
        "locator": provenance.get("locator"),
        "source_id": provenance.get("source_id"),
        "source_url": provenance.get("source_url"),
        "trace_record_type": provenance.get("trace_record_type"),
        "trace_record_id": provenance.get("trace_record_id"),
    }


def build_question_context(
    db: Session, *, investigation_id: str, question: str, max_results: int = 30,
    include_external_leads: bool = True, include_reconciled_duplicates: bool = False,
) -> dict:
    """Build a bounded provenance-bearing packet for a local reasoning model.

    This is deliberately retrieval-only: it does not call an LLM, alter facts, or
    promote connector results. External/Aleph results remain segregated leads.
    """
    search = investigation_search(
        db, question, investigation_id=investigation_id, limit=max_results,
        include_reconciled_duplicates=include_reconciled_duplicates,
    )
    grouped: dict[str, list[dict]] = defaultdict(list)
    for hit in search["results"]:
        group = hit.get("group", "other")
        if group == EXTERNAL_GROUP and not include_external_leads:
            continue
        item = {
            "record_type": hit["type"], "record_id": hit["id"],
            "title": hit.get("title"), "snippet": hit.get("snippet"),
            "score": hit.get("score"), "provenance": hit.get("provenance") or {},
            "metadata": hit.get("metadata") or {}, "citation": _citation(hit),
        }
        grouped[group].append(item)

    external = grouped.pop(EXTERNAL_GROUP, [])
    context = {key: grouped.get(key, []) for key in ("canonical", "evidence", "reporting", "workflow", "review")}
    citations, seen = [], set()
    for key in ("canonical", "evidence", "reporting", "workflow", "review"):
        for item in context[key]:
            citation = item["citation"]
            ident = (citation["record_type"], citation["record_id"])
            if ident not in seen:
                citations.append(citation); seen.add(ident)

    return {
        "question": question.strip(), "investigation_id": investigation_id,
        "retrieval": {
            "query": search["query"], "total_matches": search["total"],
            "returned_matches": len(search["results"]), "counts": search.get("counts", {}),
            "group_counts": search.get("group_counts", {}),
        },
        "context": context, "external_leads": external, "citations": citations,
        "reasoning_contract": {
            "canonical_records_are_reviewed": True, "evidence_requires_provenance": True,
            "claims_may_be_disputed_or_unverified": True, "external_leads_are_unverified": True,
            "external_leads_must_not_be_stated_as_fact_without_promotion_or_independent_evidence": True,
            "missing_evidence_must_be_reported_as_unknown": True,
        },
        "warnings": ([
            "External connector results are leads only. They are excluded from factual citations until reviewed/promoted or independently evidenced."
        ] if external else []),
    }


def build_selected_record_context(
    db: Session, *, investigation_id: str, record_refs: list[dict], goal: str,
) -> dict:
    """Like build_question_context(), but the evidence set is an explicit,
    reporter-picked list of records rather than a free-text search's
    results -- this is the retrieval packet for the presentation_draft
    module (app/ai/reasoning.py), where the reporter already knows exactly
    which claims/evidence/entities/etc. the draft should be built from.

    Returns the identical packet shape build_question_context() does (same
    `context`/`external_leads`/`citations`/`reasoning_contract` keys), so
    run_reasoning_module() and build_system_prompt() don't need to know or
    care which builder produced the packet they were handed. `goal` is
    carried in the `question` key for that same reason -- it is the only
    free-text framing this packet has, playing the same role a free-text
    question does in the other builder's packet.
    """
    if not record_refs:
        raise ValueError("record_refs must not be empty")

    seen_refs: set[tuple[str, str]] = set()
    hits: list[SearchHit] = []
    for ref in record_refs:
        record_type, record_id = ref["record_type"], ref["record_id"]
        key = (record_type, record_id)
        if key in seen_refs:
            continue  # a reporter picking the same record twice is a no-op, not an error
        seen_refs.add(key)
        hits.append(_hit_for_selected_record(db, investigation_id=investigation_id, record_type=record_type, record_id=record_id))

    grouped: dict[str, list[dict]] = defaultdict(list)
    for hit in hits:
        as_dict = hit.as_dict()
        item = {
            "record_type": as_dict["type"], "record_id": as_dict["id"],
            "title": as_dict.get("title"), "snippet": as_dict.get("snippet"),
            "score": as_dict.get("score"), "provenance": as_dict.get("provenance") or {},
            "metadata": as_dict.get("metadata") or {}, "citation": _citation(as_dict),
        }
        grouped[as_dict["group"]].append(item)

    # No external-lead concept here: a reporter can only select a record_type
    # in SELECTABLE_RECORD_TYPES, and a connector finding isn't one of them --
    # external/unreviewed evidence never enters this packet at all, rather
    # than entering and then being segregated the way search results are.
    context = {key: grouped.get(key, []) for key in ("canonical", "evidence", "reporting", "workflow", "review")}
    citations, seen = [], set()
    for key in ("canonical", "evidence", "reporting", "workflow", "review"):
        for item in context[key]:
            citation = item["citation"]
            ident = (citation["record_type"], citation["record_id"])
            if ident not in seen:
                citations.append(citation); seen.add(ident)

    return {
        "question": goal.strip(), "investigation_id": investigation_id,
        "retrieval": {
            "query": None, "total_matches": len(hits), "returned_matches": len(hits),
            "counts": {}, "group_counts": {group: len(items) for group, items in context.items() if items},
        },
        "context": context, "external_leads": [], "citations": citations,
        "reasoning_contract": {
            "canonical_records_are_reviewed": True, "evidence_requires_provenance": True,
            "claims_may_be_disputed_or_unverified": True, "external_leads_are_unverified": True,
            "external_leads_must_not_be_stated_as_fact_without_promotion_or_independent_evidence": True,
            "missing_evidence_must_be_reported_as_unknown": True,
            "evidence_set_is_reporter_selected_not_a_search_result": True,
        },
        "warnings": [],
    }
