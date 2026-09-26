"""Why was this proposed? Per-part reasoning and sources for extraction candidates (#190).

The document pipeline stays propose-then-confirm: nothing here accepts, rejects or
edits a candidate. This module only makes each proposal legible to the reporter who
has to decide on it, by answering, for every part of the proposal:

* what the part says (``value``),
* which rule or provider produced it and why that rule fired (``reasoning``),
* exactly where it came from (``sources``: document, chunk + character span,
  source record, provider record, claim, evidence, entity).

Composite proposals (a staged relationship: schema + two endpoints + supporting
claim + supporting evidence + properties) are broken down part by part.

Reasoning is taken from ``payload['rationale']`` when the extractor recorded it
(``rationale_basis='recorded'``). Candidates created before rationale was recorded
are explained by re-running the *current* rules against the stored text
(``rationale_basis='reconstructed'``) and say so in ``caveats``; provider and
reporter-staged proposals report ``'provider'`` / ``'reporter'``.

Confidence values in this pipeline are fixed per extraction rule, not model
probabilities; every explanation states what its number means.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Claim,
    ClaimEvidenceLink,
    Entity,
    Evidence,
    ExtractionCandidate,
    Source,
)
from app.services.documents import (
    CLAIM_MAX_CHARS,
    CLAIM_MIN_CHARS,
    CLAIM_TRIGGER_RE,
    ORG_SUFFIX,
    serialize_extraction_lineage,
)

EXCERPT_CONTEXT_CHARS = 80

METHODS: dict[str, dict[str, Any]] = {
    "whole_chunk": {
        "label": "Verbatim chunk quote",
        "description": "The full text of one extracted document chunk is proposed as an evidence quote. Nothing is summarized, rewritten or selected.",
        "automated": True,
    },
    "sentence_assertion": {
        "label": "Sentence pattern rule",
        "description": f"Text is split into sentences at . ! or ?. A sentence is proposed as a claim when it is {CLAIM_MIN_CHARS}–{CLAIM_MAX_CHARS} characters long and contains one of a fixed list of assertion verbs.",
        "automated": True,
    },
    "capitalized_name_sequence": {
        "label": "Capitalized-name pattern rule",
        "description": "A run of 2–6 capitalized words (optionally joined by of / the / and / &) is proposed as a named entity. The schema is Organization when the name contains an organizational suffix (Inc, LLC, Department, Bank, …), otherwise Person.",
        "automated": True,
    },
    "openaleph_ingest_file": {
        "label": "OpenAleph page text",
        "description": "OpenAleph ingested the uploaded file and returned the text of one page; that page text is proposed verbatim as an evidence quote.",
        "automated": True,
    },
    "openaleph_ftm_analyze": {
        "label": "OpenAleph ftm-analyze mention",
        "description": "OpenAleph's ftm-analyze named-entity step detected a mention in the document and returned its name and detected schema.",
        "automated": True,
    },
    "reporter_staged": {
        "label": "Reporter-staged relationship",
        "description": "A reporter chose the relationship schema and both endpoints from an already-accepted extracted claim. No automated matcher chose any part of it.",
        "automated": False,
    },
    "unknown": {
        "label": "Unrecorded method",
        "description": "This proposal does not record which rule or provider produced it.",
        "automated": True,
    },
}


def _excerpt(text: str, start: int | None, end: int | None) -> dict[str, Any] | None:
    """Return the matched text with a little context on each side, plus the span."""
    if start is None or end is None or not text or start < 0 or end > len(text) or start > end:
        return None
    lo = max(0, start - EXCERPT_CONTEXT_CHARS)
    hi = min(len(text), end + EXCERPT_CONTEXT_CHARS)
    return {
        "before": ("…" if lo > 0 else "") + text[lo:start],
        "match": text[start:end],
        "after": text[end:hi] + ("…" if hi < len(text) else ""),
        "start_char": start, "end_char": end,
    }


def _span(payload: dict) -> tuple[int | None, int | None]:
    raw = payload.get("span")
    span: dict = raw if isinstance(raw, dict) else {}
    start, end = span.get("start_char"), span.get("end_char")
    return (start if isinstance(start, int) else None, end if isinstance(end, int) else None)


def _chunk_ref(lineage: dict, payload: dict) -> dict[str, Any] | None:
    chunk = lineage.get("chunk")
    if not chunk:
        return None
    start, end = _span(payload)
    return {
        "kind": "chunk", "id": chunk["id"], "label": f"Chunk {chunk['ordinal']}",
        "locator": chunk["locator"], "page_number": chunk["page_number"],
        "extraction_method": chunk["extraction_method"],
        "excerpt": _excerpt(chunk["text"] or "", start, end),
    }


def _document_refs(lineage: dict) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    doc, source = lineage.get("document"), lineage.get("source")
    if doc:
        refs.append({"kind": "document", "id": doc["id"], "label": doc["filename"], "sha256": doc["sha256"], "mime_type": doc["mime_type"]})
    if source:
        refs.append({"kind": "source", "id": source["id"], "label": source["title"], "url": source["url"], "source_type": source["source_type"]})
    return refs


def _provider_ref(provenance: dict) -> dict[str, Any] | None:
    if not provenance.get("provider"):
        return None
    return {
        "kind": "provider", "id": provenance.get("provider_entity_id") or provenance.get("provider_document_id"),
        "label": f"{provenance['provider']} {provenance.get('provider_schema') or 'record'}",
        "provider": provenance["provider"], "collection_id": provenance.get("collection_id"),
        "provider_document_id": provenance.get("provider_document_id"),
        "provider_entity_id": provenance.get("provider_entity_id"),
    }


def _chunk_method_reason(chunk_ref: dict | None) -> str | None:
    if not chunk_ref:
        return None
    method = chunk_ref.get("extraction_method")
    where = chunk_ref.get("locator") or "an unlabelled location"
    if method == "ocr":
        return f"The chunk text at {where} was produced by OCR of a scanned page."
    if method == "native_pdf":
        return f"The chunk text at {where} is the PDF's own embedded text layer."
    if method == "openaleph_ingest_file":
        return f"The chunk text at {where} is page text returned by OpenAleph."
    return f"The chunk text at {where} was read directly from the file."


def _part(pid: str, label: str, value: Any, reasoning: Sequence[str | None], sources: Sequence[dict | None]) -> dict[str, Any]:
    return {"id": pid, "label": label, "value": value, "reasoning": [r for r in reasoning if r], "sources": [s for s in sources if s]}


def _recorded_or_reconstructed(payload: dict, reconstruct: dict[str, Any]) -> tuple[dict[str, Any], str]:
    stored = payload.get("rationale")
    if isinstance(stored, dict) and stored.get("rule"):
        return stored, "recorded"
    return reconstruct, "reconstructed"


def _explain_evidence(candidate: ExtractionCandidate, payload: dict, lineage: dict, provenance: dict) -> dict[str, Any]:
    chunk = _chunk_ref(lineage, payload)
    provider = _provider_ref(provenance)
    quote = payload.get("quote") or ""
    if provenance.get("extraction_method") == "openaleph_ingest_file":
        method, basis = "openaleph_ingest_file", "provider"
    else:
        rationale, basis = _recorded_or_reconstructed(payload, {"rule": "whole_chunk"})
        method = rationale.get("rule", "whole_chunk")
    caveats = ["Accepting records this text as evidence of what the document says. It does not establish that the statement is true."]
    if chunk and chunk.get("extraction_method") == "ocr":
        caveats.append("OCR text can contain recognition errors; compare the quote against the original page before accepting.")
    parts = [
        _part("quote", "Quote", quote, [
            f"The quote is the complete text of the chunk ({len(quote)} characters); it was not summarized or trimmed.",
            _chunk_method_reason(chunk),
        ], [chunk, provider]),
        _part("locator", "Locator", payload.get("locator") or (chunk or {}).get("locator"), [
            "The locator is where the chunk sits in the original document (page, line range or section), recorded when the document was extracted.",
        ], [chunk]),
    ]
    return {
        "summary": f"Evidence quote from {(chunk or {}).get('locator') or 'the document'}",
        "method_id": method, "rationale_basis": basis, "parts": parts, "caveats": caveats,
        "confidence_basis": "Fixed value of 1.0 for verbatim quotes: it measures that the text is copied exactly from the extracted document, not how reliable the statement is.",
    }


def _explain_claim(candidate: ExtractionCandidate, payload: dict, lineage: dict, provenance: dict) -> dict[str, Any]:
    text = payload.get("text") or ""
    match = CLAIM_TRIGGER_RE.search(text)
    rationale, basis = _recorded_or_reconstructed(payload, {
        "rule": "sentence_assertion", "trigger": match.group(1) if match else None, "length": len(text),
    })
    chunk = _chunk_ref(lineage, payload)
    trigger = rationale.get("trigger")
    length = rationale.get("length", len(text))
    reasoning = [
        "It is one sentence of the chunk, split at sentence-ending punctuation.",
        f"Its length ({length} characters) is within the {CLAIM_MIN_CHARS}–{CLAIM_MAX_CHARS} character range the rule requires.",
        f"It contains the assertion verb “{trigger}”." if trigger else "No assertion verb from the current rule list is present in this text.",
    ]
    parts = [_part("text", "Claim text", text, reasoning, [chunk])]
    caveats = [
        "This is a text-pattern match. The rule does not check who is making the statement, whether it is quoted or attributed, negated, hypothetical, or true.",
        "Accepting creates a claim with the status you choose (default: lead) and stores this exact sentence as evidence linked to it as supporting.",
    ]
    return {
        "summary": "Claim sentence proposed from the document text",
        "method_id": "sentence_assertion", "rationale_basis": basis, "parts": parts, "caveats": caveats,
        "confidence_basis": "Fixed value of 0.55 assigned to every sentence this rule matches. It is not computed per sentence and is not a probability that the claim is true.",
    }


def _explain_entity(candidate: ExtractionCandidate, payload: dict, lineage: dict, provenance: dict) -> dict[str, Any]:
    caption = payload.get("caption") or ""
    schema = payload.get("suggested_schema") or "Thing"
    chunk = _chunk_ref(lineage, payload)
    provider = _provider_ref(provenance)
    caveats: list[str] = []
    if provenance.get("extraction_method") == "openaleph_ftm_analyze":
        method, basis = "openaleph_ftm_analyze", "provider"
        name_reasoning = ["OpenAleph's ftm-analyze step returned this name as a mention detected in the document."]
        schema_reasoning = [f"OpenAleph reported the detected schema, normalized here to {schema}."]
        if chunk is None:
            caveats.append("OpenAleph returned no page locator for this mention; find it in the document before accepting.")
    else:
        suffix = ORG_SUFFIX.search(caption)
        rationale, basis = _recorded_or_reconstructed(payload, {
            "rule": "capitalized_name_sequence",
            "schema_basis": "organization_suffix" if suffix else "no_organization_suffix",
            "matched_suffix": suffix.group(1) if suffix else None,
        })
        method = "capitalized_name_sequence"
        name_reasoning = [f"The text “{caption}” is a run of capitalized words in the chunk, which the rule treats as a possible name."]
        if rationale.get("schema_basis") == "organization_suffix":
            schema_reasoning = [f"The name contains the organizational suffix “{rationale.get('matched_suffix')}”, so the rule proposed Organization."]
        else:
            schema_reasoning = ["The name contains no organizational suffix, so the rule fell back to Person. This is a default, not evidence that it is a person."]
        caveats.append("Capitalized-word matching also catches sentence starts, titles, places and headings; check that this is a real name.")
    parts = [
        _part("caption", "Name", caption, name_reasoning, [chunk, provider]),
        _part("schema", "Suggested type", schema, schema_reasoning, [provider]),
    ]
    resolved = provenance.get("provider_resolved_entity_id") or payload.get("provider_resolved_entity_id")
    if resolved:
        parts.append(_part("provider_resolution", "Provider entity link", resolved, [
            "OpenAleph linked this mention to one of its own entities. That link is a lead only; it does not select or merge a Workbench entity.",
        ], [provider]))
    caveats.append("If a likely match to an existing entity exists, accepting requires you to choose same, different, or create new. Nothing is merged automatically.")
    return {
        "summary": f"{schema} named “{caption}”",
        "method_id": method, "rationale_basis": basis, "parts": parts, "caveats": caveats,
        "confidence_basis": ("Fixed value of 1.0 set on import: it records that OpenAleph returned this mention, not how likely the identification is correct."
                             if method == "openaleph_ftm_analyze" else
                             "Fixed value of 0.40 assigned to every name this rule matches. It is not computed per name."),
    }


def _entity_ref(db: Session, entity_id: Any) -> tuple[dict[str, Any] | None, Entity | None]:
    entity = db.get(Entity, entity_id) if isinstance(entity_id, str) else None
    if entity is None:
        return None, None
    return {"kind": "entity", "id": entity.id, "label": entity.caption, "schema": entity.schema}, entity


def _explain_relationship(db: Session, candidate: ExtractionCandidate, payload: dict, lineage: dict, provenance: dict) -> dict[str, Any]:
    chunk = _chunk_ref(lineage, payload)
    src_ref, src = _entity_ref(db, payload.get("source_entity_id"))
    tgt_ref, tgt = _entity_ref(db, payload.get("target_entity_id"))
    claim = db.get(Claim, payload["claim_id"]) if isinstance(payload.get("claim_id"), str) else None
    evidence = db.get(Evidence, payload["evidence_id"]) if isinstance(payload.get("evidence_id"), str) else None
    evidence_source = db.get(Source, evidence.source_id) if evidence else None
    claim_ref = {"kind": "claim", "id": claim.id, "label": claim.text, "status": claim.status} if claim else None
    evidence_ref = ({"kind": "evidence", "id": evidence.id, "label": evidence.quote or evidence.notes or "Evidence record", "locator": evidence.locator,
                     "source_id": evidence.source_id, "source_title": evidence_source.title if evidence_source else None} if evidence else None)
    schema = payload.get("schema") or "Relationship"
    caveats: list[str] = []
    missing = [name for name, ref in (("source entity", src), ("target entity", tgt), ("claim", claim)) if ref is None]
    if missing:
        caveats.append("Referenced record(s) no longer found: " + ", ".join(missing) + ".")
    if evidence is None:
        caveats.append("No supporting evidence link is attached; the relationship would rest on the claim alone.")
    elif claim is not None:
        link = db.scalar(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id, ClaimEvidenceLink.evidence_id == evidence.id))
        if link is not None and link.stance != "supports":
            caveats.append(f"The attached evidence is linked to the claim with stance “{link.stance}”, not “supports”.")
    caveats.append("Accepting creates a canonical relationship edge in the graph.")
    parts = [
        _part("schema", "Relationship type", schema, ["Chosen by the reporter when staging the proposal."], []),
        _part("source", "From", src.caption if src else payload.get("source_entity_id"),
              [f"Chosen by the reporter; existing {src.schema} entity." if src else "Chosen by the reporter; the entity is no longer found."], [src_ref]),
        _part("target", "To", tgt.caption if tgt else payload.get("target_entity_id"),
              [f"Chosen by the reporter; existing {tgt.schema} entity." if tgt else "Chosen by the reporter; the entity is no longer found."], [tgt_ref]),
        _part("claim", "Supporting claim", claim.text if claim else payload.get("claim_id"),
              [f"The claim was accepted from document extraction and currently has status “{claim.status}”." if claim else "The claim is no longer found."],
              [claim_ref, chunk]),
        _part("evidence", "Supporting evidence", (evidence.quote or evidence.notes) if evidence else None,
              (["Attached when the proposal was staged: either chosen explicitly, or by default the earliest evidence linked to the claim as supporting it." if evidence else "None attached."]
               + ([f"Located at {evidence.locator}."] if evidence and evidence.locator else [])),
              [evidence_ref]),
    ]
    props = payload.get("properties") if isinstance(payload.get("properties"), dict) else {}
    if props:
        parts.append(_part("properties", "Properties", props, ["Entered by the reporter when staging the proposal."], []))
    if payload.get("note"):
        parts.append(_part("note", "Staging note", payload.get("note"), ["Written when the proposal was staged."], []))
    summary = f"{schema}: {src.caption if src else 'unknown'} → {tgt.caption if tgt else 'unknown'}"
    return {
        "summary": summary, "method_id": "reporter_staged", "rationale_basis": "reporter", "parts": parts, "caveats": caveats,
        "confidence_basis": "No extractor confidence: every part of this proposal was chosen by a reporter.",
    }


def explain_extraction_candidate(db: Session, candidate: ExtractionCandidate) -> dict[str, Any]:
    """Return the per-part reasoning and sources behind one extraction candidate. Read-only."""
    payload = candidate.payload if isinstance(candidate.payload, dict) else {}
    raw_provenance = payload.get("provenance")
    provenance: dict = raw_provenance if isinstance(raw_provenance, dict) else {}
    lineage = serialize_extraction_lineage(db, candidate)
    kind = candidate.candidate_type
    if kind == "evidence":
        body = _explain_evidence(candidate, payload, lineage, provenance)
    elif kind == "claim":
        body = _explain_claim(candidate, payload, lineage, provenance)
    elif kind == "entity":
        body = _explain_entity(candidate, payload, lineage, provenance)
    elif kind == "relationship":
        body = _explain_relationship(db, candidate, payload, lineage, provenance)
    else:
        body = {"summary": f"{kind} proposal", "method_id": "unknown", "rationale_basis": "reconstructed", "parts": [],
                "caveats": [f"No explanation is defined for “{kind}” proposals."], "confidence_basis": "Unknown."}
    caveats = list(body["caveats"])
    if body["rationale_basis"] == "reconstructed" and kind in {"evidence", "claim", "entity"}:
        caveats.insert(0, "This proposal was created before the extractor recorded its reasoning. The reasoning shown was reconstructed by applying the current rules to the stored text.")
    method_id = body["method_id"]
    method = {"id": method_id, **METHODS.get(method_id, METHODS["unknown"])}
    sources = _document_refs(lineage)
    provider = _provider_ref(provenance)
    if provider:
        sources.append(provider)
    return {
        "candidate_id": candidate.id,
        "candidate_type": kind,
        "review_status": candidate.review_status,
        "summary": body["summary"],
        "method": method,
        "rationale_basis": body["rationale_basis"],
        "confidence": {"value": candidate.confidence, "basis": body["confidence_basis"]},
        "parts": body["parts"],
        "sources": sources,
        "caveats": caveats,
        "review_rule": "Nothing in this proposal is in the investigation until a reporter accepts it.",
    }


def serialize_candidate(candidate: ExtractionCandidate) -> dict[str, Any]:
    return {
        "id": candidate.id, "investigation_id": candidate.investigation_id, "document_id": candidate.document_id,
        "chunk_id": candidate.chunk_id, "candidate_type": candidate.candidate_type, "payload": candidate.payload or {},
        "confidence": candidate.confidence, "review_status": candidate.review_status,
        "accepted_record_type": candidate.accepted_record_type, "accepted_record_id": candidate.accepted_record_id,
        "reviewer_note": candidate.reviewer_note, "created_at": candidate.created_at, "reviewed_at": candidate.reviewed_at,
    }
