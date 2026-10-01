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
        entity_row = db.get(Entity, record_id)
        if entity_row is None or entity_row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        active, alias_chain = resolve_active_entity(db, entity_row)
        is_alias = bool(alias_chain)
        properties_text = " ".join(f"{p} {' '.join(str(v) for v in (vals or []))}" for p, vals in (entity_row.properties or {}).items())
        return SearchHit(
            "entity", entity_row.id, entity_row.investigation_id,
            entity_row.caption if not is_alias or active is None else f"{entity_row.caption} → {active.caption}",
            _snippet(properties_text or entity_row.caption, ""), 1.0,
            {"kind": "merged_alias" if is_alias else "canonical", "ftm_id": entity_row.ftm_id, **_trace("entity", active.id if active is not None else entity_row.id)},
            {"schema": entity_row.schema, "properties": entity_row.properties or {}},
        )

    if record_type == "claim":
        claim_row = db.get(Claim, record_id)
        if claim_row is None or claim_row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "claim", claim_row.id, claim_row.investigation_id, "Claim", _snippet(claim_row.text, ""), 1.0,
            {"kind": "reporter_claim", **_trace("claim", claim_row.id)},
            {"status": claim_row.status, "confidence": claim_row.confidence},
        )

    if record_type == "evidence":
        evidence_row = db.get(Evidence, record_id)
        if evidence_row is None:
            raise RecordNotFoundError(record_type, record_id)
        source = db.get(Source, evidence_row.source_id)
        if source is None or source.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "evidence", evidence_row.id, source.investigation_id, source.title,
            _snippet(evidence_row.quote or evidence_row.notes or evidence_row.locator, ""), 1.0,
            {"kind": "evidence", "source_id": source.id, "source_url": source.url, "locator": evidence_row.locator, **_trace("evidence", evidence_row.id)},
            {"quote": evidence_row.quote, "notes": evidence_row.notes},
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
        source_row = db.get(Source, record_id)
        if source_row is None or source_row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        return SearchHit(
            "source", source_row.id, source_row.investigation_id, source_row.title,
            _snippet(source_row.url or str(source_row.metadata_json or ""), ""), 1.0,
            {"kind": "source", "url": source_row.url, **_trace("source", source_row.id)},
            {"source_type": source_row.source_type},
        )

    if record_type == "document":
        document_row = db.get(Document, record_id)
        if document_row is None or document_row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        source = db.get(Source, document_row.source_id)
        return SearchHit(
            "document", document_row.id, document_row.investigation_id, source.title if source else document_row.filename,
            _snippet(document_row.filename, ""), 1.0,
            {"kind": "document", "source_id": document_row.source_id, "sha256": document_row.sha256, **_trace("document", document_row.id)},
            {"filename": document_row.filename, "extraction_status": document_row.extraction_status},
        )

    if record_type == "lead":
        lead_row = db.get(Lead, record_id)
        if lead_row is None or lead_row.investigation_id != investigation_id:
            raise RecordNotFoundError(record_type, record_id)
        profile = db.scalar(select(LeadProfile).where(LeadProfile.lead_id == lead_row.id))
        return SearchHit(
            "lead", lead_row.id, lead_row.investigation_id, lead_row.title,
            _snippet(lead_row.detail or (profile.next_action if profile else None), ""), 1.0,
            {"kind": "lead", "provider": lead_row.provider, **_trace("lead", lead_row.id)},
            {"status": lead_row.status, "priority": profile.priority if profile else "normal"},
        )

    # record_type == "task": investigation_search()'s own hit type for this
    # model is "reporting_task" (see SEARCH_GROUPS), not "task" -- matched
    # here, not the SELECTABLE_RECORD_TYPES spelling, so this record cites
    # identically regardless of how it entered a retrieval packet.
    task_row = db.get(ReportingTask, record_id)
    if task_row is None or task_row.investigation_id != investigation_id:
        raise RecordNotFoundError(record_type, record_id)
    return SearchHit(
        "reporting_task", task_row.id, task_row.investigation_id, task_row.title, _snippet(task_row.detail, ""), 1.0,
        {"kind": "reporting_task", "lead_id": task_row.lead_id, **_trace("task", task_row.id)},
        {"status": task_row.status, "priority": task_row.priority, "owner": task_row.owner},
    )


_TYPE_LABELS = {
    "entity": "Entity", "claim": "Claim", "evidence": "Evidence", "relationship": "Relationship",
    "source": "Source", "document": "Document", "lead": "Lead", "task": "Task",
}


def _clip(text: str | None, limit: int) -> str:
    text = (text or "").strip().replace("\n", " ")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def describe_record_refs(db: Session, *, investigation_id: str, refs: list[dict]) -> list[dict]:
    """Human-readable details for citation refs, for display (the review
    panel's evidence chips) and export (a deck's or brief's source list) --
    the places a raw `evidence:7f3c…` UUID means nothing to a reader.

    Accepts both task spellings ("task" and search's "reporting_task"),
    since a model citing a task copies whatever the packet called it.
    Never raises for a ref that no longer resolves (a record deleted after
    the draft was written): it comes back with `missing=True` so an export
    still renders instead of failing outright.

    Returned keys: record_type (as given), record_id, trace_record_type
    (the provenance-trace spelling), type_label, label (one-line name),
    quote, locator, source_title, source_url, detail, missing.
    """
    from app.models.domain import Claim, Evidence, Source

    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for ref in refs or []:
        record_type, record_id = ref.get("record_type"), ref.get("record_id")
        if not record_type or not record_id or (record_type, record_id) in seen:
            continue
        seen.add((record_type, record_id))
        lookup_type = "task" if record_type == "reporting_task" else record_type
        item = {
            "record_type": record_type, "record_id": record_id, "trace_record_type": lookup_type,
            "type_label": _TYPE_LABELS.get(lookup_type, lookup_type.replace("_", " ").title()),
            "label": "", "quote": None, "locator": None, "source_title": None, "source_url": None,
            "detail": None, "missing": False,
        }
        try:
            hit = _hit_for_selected_record(db, investigation_id=investigation_id, record_type=lookup_type, record_id=record_id)
        except ValueError:
            item.update(label="Record no longer available", missing=True)
            out.append(item)
            continue
        provenance, metadata = hit.provenance or {}, hit.metadata or {}
        if lookup_type == "claim":
            claim = db.get(Claim, record_id)
            item.update(label=_clip(claim.text if claim else hit.snippet, 160), detail=f"Claim · {metadata.get('status') or 'unverified'}")
        elif lookup_type == "evidence":
            evidence = db.get(Evidence, record_id)
            source = db.get(Source, evidence.source_id) if evidence else None
            item.update(
                label=_clip(evidence.locator if evidence and evidence.locator else hit.title, 120),
                quote=_clip(metadata.get("quote") or metadata.get("notes"), 400) or None,
                locator=provenance.get("locator"), source_title=source.title if source else hit.title,
                source_url=provenance.get("source_url"), detail=source.title if source else None,
            )
        elif lookup_type == "entity":
            item.update(label=_clip(hit.title, 120), detail=metadata.get("schema"))
        elif lookup_type == "source":
            item.update(label=_clip(hit.title, 160), source_title=hit.title, source_url=provenance.get("url"), detail=metadata.get("source_type"))
        else:
            item.update(label=_clip(hit.title, 160), detail=_clip(hit.snippet, 200) or None)
        out.append(item)
    return out


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
    context = {group_key: grouped.get(group_key, []) for group_key in ("canonical", "evidence", "reporting", "workflow", "review")}
    citations, seen = [], set()
    for group_key in ("canonical", "evidence", "reporting", "workflow", "review"):
        for item in context[group_key]:
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
