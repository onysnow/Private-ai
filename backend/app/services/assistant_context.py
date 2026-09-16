from __future__ import annotations

from collections import defaultdict
from sqlalchemy.orm import Session

from app.services.search import investigation_search

EXTERNAL_GROUP = "external_lead"


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
