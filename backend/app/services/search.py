from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.domain import (
    Investigation, Entity, Statement, Source, Evidence, ClaimEvidenceLink, Claim, Lead, LeadProfile, ReportingTask,
    ConnectorFinding, RelationshipEdge, TimelineEvent, Document, DocumentChunk, ExtractionCandidate,
)
from app.services.entity_aliases import resolve_active_entity
from app.services.post_merge_reconciliation import reconciliation_preference_map
from app.services.relationships import serialize_relationship


SEARCH_GROUPS = {
    "entity": "canonical",
    "statement": "canonical",
    "relationship": "canonical",
    "source": "evidence",
    "evidence": "evidence",
    "document": "evidence",
    "document_chunk": "evidence",
    "claim": "reporting",
    "timeline_event": "reporting",
    "lead": "workflow",
    "reporting_task": "workflow",
    "extraction_candidate": "review",
    "connector_finding": "external_lead",
}


@dataclass
class SearchHit:
    type: str
    id: str
    investigation_id: str
    title: str
    snippet: str
    score: float
    provenance: dict
    metadata: dict

    def as_dict(self) -> dict:
        return {
            "type": self.type,
            "group": SEARCH_GROUPS.get(self.type, "other"),
            "id": self.id,
            "investigation_id": self.investigation_id,
            "title": self.title,
            "snippet": self.snippet,
            "score": round(self.score, 4),
            "provenance": self.provenance,
            "metadata": self.metadata,
        }


def _tokens(query: str) -> list[str]:
    return [part.casefold() for part in query.split() if part.strip()]


def _prefilter(tokens: list[str], *columns):
    """SQL-level, portable (SQLite/PostgreSQL) "any token is a substring of any of
    these columns, case-insensitively" predicate (STRUCT-0036).

    This narrows a SELECT to rows _score() could possibly give a nonzero score to,
    so the DB does the elimination instead of fetching and scoring every row in the
    investigation in Python. It is only ever safe to add to a query whose full
    fetched set isn't ALSO relied on elsewhere as a lookup table (e.g. entities and
    sources are deliberately NOT prefiltered this way -- see the comment above
    entities_stmt/sources_stmt below) -- adding this to one of those would silently
    drop, say, a statement hit whose own text matches but whose parent entity's
    caption doesn't.

    Correctness argument: _score(query, *values) only returns a nonzero score when
    either the full stripped query, or one of _tokens(query)'s words, is found as a
    substring of `primary` (values[0]) or of `text` (all values joined). Since
    `primary` is always itself a substring of `text`, and every token is by
    construction a substring of the full query, ANY nonzero-score condition implies
    at least one token is a literal substring of `text` -- so "does any token appear
    in any of the same columns _score() was given" is a safe superset, never a
    stricter, condition than _score()'s own check. JSON columns are cast to text so
    their keys/values stay substring-searchable, mirroring the str(...)-based text
    _score() builds from them in Python.
    """
    exprs: list = []
    for column in columns:
        text_col = func.lower(cast(column, String))
        exprs.extend(text_col.contains(token) for token in tokens)
    return or_(*exprs)


def _score(query: str, *values: object) -> float:
    """Deterministic relevance scorer shared by SQLite and PostgreSQL.

    The first value is treated as the record's primary human-facing field (caption, title,
    quote, claim text, etc.). Exact/leading primary-field matches outrank incidental body
    matches, while token coverage still allows useful partial results. This remains database
    agnostic so local SQLite and production PostgreSQL return the same ordering.
    """
    q = query.strip().casefold()
    if not q:
        return 0.0
    normalized = [str(v).strip().casefold() for v in values if v is not None and str(v).strip()]
    if not normalized:
        return 0.0
    primary = normalized[0]
    text = " ".join(normalized)
    words = _tokens(query)

    score = 0.0
    if primary == q:
        score += 12.0
    elif primary.startswith(q):
        score += 8.0
    elif q in primary:
        score += 6.0
    elif q in text:
        score += 4.0

    if words:
        primary_matches = sum(1 for word in words if word in primary)
        all_matches = sum(1 for word in words if word in text)
        score += 4.0 * (primary_matches / len(words))
        score += 2.0 * (all_matches / len(words))

    # Small deterministic specificity bonus: matching a compact primary field should beat
    # the same phrase buried in a very large metadata blob.
    if q in primary and len(primary) <= max(80, len(q) * 4):
        score += 1.0
    return score


def _trace(record_type: str, record_id: str) -> dict:
    return {"trace_record_type": record_type, "trace_record_id": record_id}


def _snippet(text: str | None, query: str, limit: int = 260) -> str:
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= limit:
        return text
    needle = query.strip().casefold()
    idx = text.casefold().find(needle) if needle else -1
    if idx < 0:
        return text[: limit - 1] + "…"
    start = max(0, idx - limit // 3)
    end = min(len(text), start + limit)
    prefix = "…" if start else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix


def investigation_search(db: Session, query: str, investigation_id: str | None = None, limit: int = 50, allowed_investigation_ids: set[str] | frozenset[str] | None = None, include_reconciled_duplicates: bool = False) -> dict:
    query = query.strip()
    if not query:
        return {"query": query, "investigation_id": investigation_id, "total": 0, "results": [], "counts": {}}

    if investigation_id and db.get(Investigation, investigation_id) is None:
        raise ValueError("Investigation not found")

    # Computed once and reused by every _prefilter() call below (STRUCT-0036).
    tokens = _tokens(query)
    hits: list[SearchHit] = []

    # STRUCT-0036 cycle 4: entities/sources are split into a lightweight, ALWAYS-
    # unfiltered lookup query (feeding entity_by_id/source_by_id, used only to
    # resolve a statement's/evidence's PARENT record for hit construction) and a
    # separately prefiltered scoring query (used only to decide which entities/
    # sources become entity-type/source-type hits in their own right). This is
    # safe -- unlike prefiltering entities_stmt/sources_stmt as a single query
    # would be -- because every entity_by_id.get(...)/source_by_id.get(...) call
    # site in this function (read in full before making this change) only ever
    # touches investigation_id/caption/schema (entities) or
    # investigation_id/title/url (sources): the lookup dicts never need the
    # heavier properties/metadata_json JSON columns that only the entity's/
    # source's OWN hit-scoring reads. The scoring queries can be prefiltered
    # because they score each row on its OWN fields only (never a merged-alias
    # target's fields), which is exactly the same self-contained shape as
    # claims_stmt below -- the shared-lookup hazard was specific to the lookup
    # dicts, not to entity/source scoring itself.
    entity_lookup_stmt = select(Entity.id, Entity.investigation_id, Entity.caption, Entity.schema)
    entity_scoring_stmt = select(Entity).where(_prefilter(
        tokens, Entity.caption, Entity.schema, Entity.ftm_id, Entity.properties,
    ))
    source_lookup_stmt = select(Source.id, Source.investigation_id, Source.title, Source.url)
    source_scoring_stmt = select(Source).where(_prefilter(
        tokens, Source.title, Source.url, Source.source_type, Source.metadata_json,
    ))
    # STRUCT-0036: claims are self-contained -- nothing downstream needs the full
    # unfiltered set, so a SQL prefilter here can't drop a hit like the
    # entities/sources shared-lookup case can (see _prefilter's docstring).
    claims_stmt = select(Claim).where(_prefilter(tokens, Claim.text, Claim.status))
    # STRUCT-0036 cycle 5: a lead's score also reads its (optional) profile's
    # priority/owner/next_action, so the prefilter outer-joins LeadProfile and
    # covers those columns too -- same joined-column rule as evidence/Source below.
    leads_stmt = (
        select(Lead)
        .outerjoin(LeadProfile, LeadProfile.lead_id == Lead.id)
        .where(_prefilter(
            tokens, Lead.title, Lead.detail, Lead.provider, Lead.provider_record_id, Lead.status,
            LeadProfile.priority, LeadProfile.owner, LeadProfile.next_action,
        ))
    )
    findings_stmt = select(ConnectorFinding).where(_prefilter(
        tokens, ConnectorFinding.caption, ConnectorFinding.schema, ConnectorFinding.properties,
        ConnectorFinding.provider, ConnectorFinding.provider_record_id, ConnectorFinding.source_url,
    ))
    # STRUCT-0036 cycle 5: a relationship's score is built from its source/target
    # captions (or their raw ids when an entity is missing), its schema, and the
    # interstitial relationship entity's caption/properties. Join all three under
    # aliases so the prefilter sees exactly the columns _score() will, and so the
    # three db.get(Entity) calls per edge (3 x N queries, matched or not) become
    # one batched lookup for the matched edges only.
    rel_src, rel_tgt, rel_ent = aliased(Entity), aliased(Entity), aliased(Entity)
    rels_stmt = (
        select(RelationshipEdge)
        .join(rel_ent, rel_ent.id == RelationshipEdge.relationship_entity_id)  # edges without one are skipped below anyway
        .outerjoin(rel_src, rel_src.id == RelationshipEdge.source_entity_id)
        .outerjoin(rel_tgt, rel_tgt.id == RelationshipEdge.target_entity_id)
        .where(_prefilter(
            tokens, rel_src.caption, rel_tgt.caption, RelationshipEdge.source_entity_id, RelationshipEdge.target_entity_id,
            RelationshipEdge.schema, rel_ent.caption, rel_ent.properties,
        ))
    )
    timeline_stmt = select(TimelineEvent).where(_prefilter(
        tokens, TimelineEvent.title, TimelineEvent.description, TimelineEvent.date_start,
        TimelineEvent.date_end, TimelineEvent.verification_status, TimelineEvent.dataset, TimelineEvent.origin,
    ))
    tasks_stmt = select(ReportingTask).where(_prefilter(
        tokens, ReportingTask.title, ReportingTask.detail, ReportingTask.status,
        ReportingTask.priority, ReportingTask.owner, ReportingTask.due_date,
    ))
    # STRUCT-0036 cycle 5: documents no longer need a full fetch. Three prefiltered
    # queries replace it: documents whose OWN fields (plus joined source title)
    # match, chunks whose text/locator match, and extraction candidates whose
    # payload matches -- the latter two scoped by a join to Document rather than by
    # an `in_(all document ids)` list. The parent Document rows a chunk/candidate
    # hit needs for its title are then loaded once, by id, for matched rows only.
    documents_stmt = (
        select(Document)
        .outerjoin(Source, Source.id == Document.source_id)
        .where(_prefilter(tokens, Document.filename, Document.mime_type, Document.sha256, Source.title))
    )
    chunks_stmt = (
        select(DocumentChunk)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(_prefilter(tokens, DocumentChunk.text, DocumentChunk.locator))
    )
    candidates_stmt = (
        select(ExtractionCandidate)
        .join(Document, Document.id == ExtractionCandidate.document_id)
        .where(_prefilter(tokens, ExtractionCandidate.payload, ExtractionCandidate.candidate_type, ExtractionCandidate.review_status))
    )
    if investigation_id:
        entity_lookup_stmt = entity_lookup_stmt.where(Entity.investigation_id == investigation_id)
        entity_scoring_stmt = entity_scoring_stmt.where(Entity.investigation_id == investigation_id)
        source_lookup_stmt = source_lookup_stmt.where(Source.investigation_id == investigation_id)
        source_scoring_stmt = source_scoring_stmt.where(Source.investigation_id == investigation_id)
        claims_stmt = claims_stmt.where(Claim.investigation_id == investigation_id)
        leads_stmt = leads_stmt.where(Lead.investigation_id == investigation_id)
        findings_stmt = findings_stmt.where(ConnectorFinding.investigation_id == investigation_id)
        rels_stmt = rels_stmt.where(RelationshipEdge.investigation_id == investigation_id)
        timeline_stmt = timeline_stmt.where(TimelineEvent.investigation_id == investigation_id)
        tasks_stmt = tasks_stmt.where(ReportingTask.investigation_id == investigation_id)
        documents_stmt = documents_stmt.where(Document.investigation_id == investigation_id)
        chunks_stmt = chunks_stmt.where(Document.investigation_id == investigation_id)
        candidates_stmt = candidates_stmt.where(Document.investigation_id == investigation_id)

    if allowed_investigation_ids is not None:
        allowed = tuple(sorted(allowed_investigation_ids))
        entity_lookup_stmt = entity_lookup_stmt.where(Entity.investigation_id.in_(allowed))
        entity_scoring_stmt = entity_scoring_stmt.where(Entity.investigation_id.in_(allowed))
        source_lookup_stmt = source_lookup_stmt.where(Source.investigation_id.in_(allowed))
        source_scoring_stmt = source_scoring_stmt.where(Source.investigation_id.in_(allowed))
        claims_stmt = claims_stmt.where(Claim.investigation_id.in_(allowed))
        leads_stmt = leads_stmt.where(Lead.investigation_id.in_(allowed))
        findings_stmt = findings_stmt.where(ConnectorFinding.investigation_id.in_(allowed))
        rels_stmt = rels_stmt.where(RelationshipEdge.investigation_id.in_(allowed))
        timeline_stmt = timeline_stmt.where(TimelineEvent.investigation_id.in_(allowed))
        tasks_stmt = tasks_stmt.where(ReportingTask.investigation_id.in_(allowed))
        documents_stmt = documents_stmt.where(Document.investigation_id.in_(allowed))
        chunks_stmt = chunks_stmt.where(Document.investigation_id.in_(allowed))
        candidates_stmt = candidates_stmt.where(Document.investigation_id.in_(allowed))

    entity_by_id = {row.id: row for row in db.execute(entity_lookup_stmt).all()}
    statement_pref_cache: dict[str, dict] = {}
    relationship_pref_cache: dict[str, dict] = {}
    def pref_map(inv_id: str, kind: str) -> dict:
        cache = statement_pref_cache if kind == "statement" else relationship_pref_cache
        if inv_id not in cache:
            cache[inv_id] = reconciliation_preference_map(db, inv_id, kind)
        return cache[inv_id]
    entities = db.scalars(entity_scoring_stmt).all()
    for entity_row in entities:
        properties_text = " ".join(
            [prop] + [str(v) for v in (values or [])]
            for prop, values in (entity_row.properties or {}).items()
        ) if False else " ".join(
            f"{prop} {' '.join(str(v) for v in (values or []))}" for prop, values in (entity_row.properties or {}).items()
        )
        score = _score(query, entity_row.caption, entity_row.schema, entity_row.ftm_id, properties_text)
        if score:
            active, alias_chain = resolve_active_entity(db, entity_row)
            if active is None:
                continue
            is_alias = bool(alias_chain)
            hits.append(SearchHit(
                "entity", entity_row.id, entity_row.investigation_id,
                entity_row.caption if not is_alias else f"{entity_row.caption} → {active.caption}",
                _snippet(properties_text or entity_row.caption, query), score,
                {
                    "kind": "merged_alias" if is_alias else "canonical",
                    "ftm_id": entity_row.ftm_id,
                    "requested_entity_id": entity_row.id,
                    "canonical_entity_id": active.id,
                    **_trace("entity", active.id),
                },
                {
                    "schema": entity_row.schema, "properties": entity_row.properties or {},
                    "merged_alias": is_alias,
                    "active_entity_id": active.id,
                    "active_caption": active.caption,
                },
            ))

    # Canonical statements may contain searchable provenance not present in materialized properties.
    if entity_by_id:
        # STRUCT-0036: statements are self-contained for prefiltering purposes --
        # nothing downstream needs the full unfiltered statement set for a given
        # entity, only the ones whose own text could actually score.
        statements = db.scalars(
            select(Statement)
            .where(Statement.entity_id.in_(entity_by_id.keys()))
            .where(_prefilter(tokens, Statement.prop, Statement.value, Statement.dataset, Statement.origin, Statement.original_value))
        ).all()
        for statement_row in statements:
            entity = entity_by_id.get(statement_row.entity_id)
            if entity is None:
                continue
            score = _score(query, statement_row.prop, statement_row.value, statement_row.dataset, statement_row.origin, statement_row.original_value)
            if score:
                reconciliation = pref_map(entity.investigation_id, "statement").get(statement_row.id)
                if reconciliation and reconciliation.get("suppressed_duplicate") and not include_reconciled_duplicates:
                    continue
                hits.append(SearchHit(
                    "statement", statement_row.id, entity.investigation_id,
                    f"{entity.caption} · {statement_row.prop}", _snippet(statement_row.value, query), score,
                    {"kind": "statement", "dataset": statement_row.dataset, "origin": statement_row.origin, "entity_id": entity.id, "reconciliation": reconciliation, **_trace("entity", entity.id)},
                    {"prop": statement_row.prop, "value": statement_row.value, "schema": entity.schema, "reconciliation": reconciliation},
                ))

    source_by_id = {row.id: row for row in db.execute(source_lookup_stmt).all()}
    sources = db.scalars(source_scoring_stmt).all()
    for source_row in sources:
        score = _score(query, source_row.title, source_row.url, source_row.source_type, source_row.metadata_json)
        if score:
            hits.append(SearchHit(
                "source", source_row.id, source_row.investigation_id, source_row.title,
                _snippet(source_row.url or str(source_row.metadata_json or ""), query), score,
                {"kind": "source", "url": source_row.url, **_trace("source", source_row.id)},
                {"source_type": source_row.source_type, "metadata": source_row.metadata_json or {}},
            ))

    if source_by_id:
        # STRUCT-0036: evidence's own unfiltered set isn't relied on as a lookup
        # elsewhere, but its score also depends on the joined source's title/url
        # (see below), so the prefilter must cover those same joined columns too.
        evidence_rows = db.scalars(
            select(Evidence)
            .join(Source, Evidence.source_id == Source.id)
            .where(Evidence.source_id.in_(source_by_id.keys()))
            .where(_prefilter(tokens, Evidence.quote, Evidence.locator, Evidence.notes, Source.title, Source.url))
        ).all()
        # One query for every matched row's claim links instead of one per row.
        links_by_evidence_id: dict[str, list[ClaimEvidenceLink]] = {}
        if evidence_rows:
            for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_([r.id for r in evidence_rows]))).all():
                links_by_evidence_id.setdefault(link.evidence_id, []).append(link)
        for evidence_row in evidence_rows:
            source = source_by_id.get(evidence_row.source_id)
            if source is None:
                continue
            score = _score(query, evidence_row.quote, evidence_row.locator, evidence_row.notes, source.title, source.url)
            if score:
                linked_claims = [
                    {"claim_id": link.claim_id, "stance": link.stance, "note": link.note}
                    for link in links_by_evidence_id.get(evidence_row.id, [])
                ]
                hits.append(SearchHit(
                    "evidence", evidence_row.id, source.investigation_id,
                    source.title, _snippet(evidence_row.quote or evidence_row.notes or evidence_row.locator, query), score,
                    {"kind": "evidence", "source_id": source.id, "source_url": source.url, "locator": evidence_row.locator, "claim_links": linked_claims, **_trace("evidence", evidence_row.id)},
                    {"quote": evidence_row.quote, "notes": evidence_row.notes},
                ))

    for claim_row in db.scalars(claims_stmt).all():
        score = _score(query, claim_row.text, claim_row.status, claim_row.confidence)
        if score:
            hits.append(SearchHit(
                "claim", claim_row.id, claim_row.investigation_id, "Claim", _snippet(claim_row.text, query), score,
                {"kind": "reporter_claim", **_trace("claim", claim_row.id)}, {"status": claim_row.status, "confidence": claim_row.confidence},
            ))

    # Batch-load lead profiles instead of one query per lead (previous N+1: a query
    # per lead regardless of whether that lead's own fields even matched the query).
    leads = db.scalars(leads_stmt).all()
    lead_profile_by_lead_id: dict[str, LeadProfile] = {}
    if leads:
        for loaded_profile in db.scalars(select(LeadProfile).where(LeadProfile.lead_id.in_([row.id for row in leads]))).all():
            lead_profile_by_lead_id[loaded_profile.lead_id] = loaded_profile
    for lead_row in leads:
        profile = lead_profile_by_lead_id.get(lead_row.id)
        score = _score(query, lead_row.title, lead_row.detail, lead_row.provider, lead_row.provider_record_id, lead_row.status,
                       profile.priority if profile else None, profile.owner if profile else None, profile.next_action if profile else None)
        if score:
            hits.append(SearchHit(
                "lead", lead_row.id, lead_row.investigation_id, lead_row.title, _snippet(lead_row.detail or (profile.next_action if profile else None), query), score,
                {"kind": "lead", "provider": lead_row.provider, "provider_record_id": lead_row.provider_record_id, **_trace("lead", lead_row.id)},
                {"status": lead_row.status, "priority": profile.priority if profile else "normal",
                 "owner": profile.owner if profile else None, "next_action": profile.next_action if profile else None},
            ))

    # Matched chunks/candidates first; then the parent documents they need, union the
    # documents that match on their own fields -- each loaded exactly once.
    chunks_by_document_id: dict[str, list[DocumentChunk]] = {}
    candidates_by_document_id: dict[str, list[ExtractionCandidate]] = {}
    for chunk in db.scalars(chunks_stmt).all():
        chunks_by_document_id.setdefault(chunk.document_id, []).append(chunk)
    for candidate in db.scalars(candidates_stmt).all():
        candidates_by_document_id.setdefault(candidate.document_id, []).append(candidate)
    documents = list(db.scalars(documents_stmt).all())
    loaded_document_ids = {doc.id for doc in documents}
    parent_ids = (set(chunks_by_document_id) | set(candidates_by_document_id)) - loaded_document_ids
    if parent_ids:
        documents.extend(db.scalars(select(Document).where(Document.id.in_(parent_ids))).all())
    documents.sort(key=lambda doc: doc.id)  # deterministic hit order before the global sort
    for doc in documents:
        source = source_by_id.get(doc.source_id)  # lookup rows carry .title, which is all this loop reads
        score = _score(query, doc.filename, doc.mime_type, doc.sha256, source.title if source else None)
        if score:
            hits.append(SearchHit(
                "document", doc.id, doc.investigation_id, source.title if source else doc.filename,
                _snippet(doc.filename, query), score,
                {"kind": "document", "source_id": doc.source_id, "sha256": doc.sha256, **_trace("document", doc.id)},
                {"filename": doc.filename, "mime_type": doc.mime_type, "extraction_status": doc.extraction_status},
            ))
        for chunk in chunks_by_document_id.get(doc.id, []):
            cscore = _score(query, chunk.text, chunk.locator)
            if cscore:
                hits.append(SearchHit(
                    "document_chunk", chunk.id, doc.investigation_id, source.title if source else doc.filename,
                    _snippet(chunk.text, query), cscore,
                    {"kind": "extracted_text", "document_id": doc.id, "source_id": doc.source_id, "locator": chunk.locator, **_trace("document", doc.id)},
                    {"page_number": chunk.page_number, "ordinal": chunk.ordinal},
                ))
        for candidate in candidates_by_document_id.get(doc.id, []):
            ptext = str(candidate.payload or {})
            cscore = _score(query, ptext, candidate.candidate_type, candidate.review_status)
            if cscore:
                hits.append(SearchHit(
                    "extraction_candidate", candidate.id, doc.investigation_id,
                    f"{candidate.candidate_type.title()} candidate · {source.title if source else doc.filename}",
                    _snippet(ptext, query), cscore,
                    {"kind": "proposal", "document_id": doc.id, "chunk_id": candidate.chunk_id, **_trace("document", doc.id)},
                    {"candidate_type": candidate.candidate_type, "review_status": candidate.review_status, "confidence": candidate.confidence},
                ))

    for task_row in db.scalars(tasks_stmt).all():
        score = _score(query, task_row.title, task_row.detail, task_row.status, task_row.priority, task_row.owner, task_row.due_date)
        if score:
            hits.append(SearchHit(
                "reporting_task", task_row.id, task_row.investigation_id, task_row.title, _snippet(task_row.detail or task_row.due_date, query), score,
                {"kind": "reporting_task", "lead_id": task_row.lead_id, **_trace("task", task_row.id)},
                {"status": task_row.status, "priority": task_row.priority, "owner": task_row.owner, "due_date": task_row.due_date},
            ))

    for finding_row in db.scalars(findings_stmt).all():
        props = " ".join(f"{k} {' '.join(str(v) for v in (vals or []))}" for k, vals in (finding_row.properties or {}).items())
        score = _score(query, finding_row.caption, finding_row.schema, props, finding_row.provider, finding_row.provider_record_id, finding_row.source_url)
        if score:
            hits.append(SearchHit(
                "connector_finding", finding_row.id, finding_row.investigation_id, finding_row.caption, _snippet(props, query), score,
                {"kind": "external_finding", "provider": finding_row.provider, "provider_record_id": finding_row.provider_record_id, "source_url": finding_row.source_url},
                {"schema": finding_row.schema, "review_status": finding_row.review_status},
            ))


    for event_row in db.scalars(timeline_stmt).all():
        score = _score(query, event_row.title, event_row.description, event_row.date_start, event_row.date_end, event_row.verification_status, event_row.dataset, event_row.origin)
        if score:
            hits.append(SearchHit(
                "timeline_event", event_row.id, event_row.investigation_id, event_row.title,
                _snippet(event_row.description or event_row.date_start, query), score,
                {"kind": "reporter_timeline_event", "origin": event_row.origin, "dataset": event_row.dataset, **(
                    _trace("claim", event_row.claim_id) if event_row.claim_id else
                    _trace("evidence", event_row.evidence_id) if event_row.evidence_id else
                    _trace("source", event_row.source_id) if event_row.source_id else
                    _trace("lead", event_row.lead_id) if event_row.lead_id else
                    _trace("entity", event_row.entity_id) if event_row.entity_id else {}
                )},
                {"date_start": event_row.date_start, "date_end": event_row.date_end, "precision": event_row.precision,
                 "verification_status": event_row.verification_status, "entity_id": event_row.entity_id,
                 "relationship_entity_id": event_row.relationship_entity_id, "source_id": event_row.source_id,
                 "evidence_id": event_row.evidence_id, "claim_id": event_row.claim_id, "lead_id": event_row.lead_id},
            ))

    # Relationship hits point back to the canonical interstitial FtM entity.
    edges = db.scalars(rels_stmt).all()
    edge_entity_ids = {i for e in edges for i in (e.relationship_entity_id, e.source_entity_id, e.target_entity_id) if i}
    edge_entities = {ent.id: ent for ent in db.scalars(select(Entity).where(Entity.id.in_(edge_entity_ids))).all()} if edge_entity_ids else {}
    for edge in edges:
        rel_entity = edge_entities.get(edge.relationship_entity_id)
        source_entity = edge_entities.get(edge.source_entity_id)
        target_entity = edge_entities.get(edge.target_entity_id)
        if rel_entity is None:
            continue
        label = f"{source_entity.caption if source_entity else edge.source_entity_id} — {edge.schema} → {target_entity.caption if target_entity else edge.target_entity_id}"
        score = _score(query, label, edge.schema, rel_entity.caption, rel_entity.properties)
        if score:
            reconciliation = pref_map(edge.investigation_id, "relationship").get(edge.id)
            if reconciliation and reconciliation.get("suppressed_duplicate") and not include_reconciled_duplicates:
                continue
            hits.append(SearchHit(
                "relationship", edge.id, edge.investigation_id, label,
                _snippet(str(rel_entity.properties or {}), query), score,
                {"kind": "ftm_relationship", "relationship_entity_id": edge.relationship_entity_id, "reconciliation": reconciliation, **_trace("relationship", edge.id)},
                {"schema": edge.schema, "source_entity_id": edge.source_entity_id, "target_entity_id": edge.target_entity_id, "reconciliation": reconciliation, "advisory": serialize_relationship(db, edge).get("advisory")},
            ))

    hits.sort(key=lambda hit: (-hit.score, hit.type, hit.title.casefold(), hit.id))
    total_matches = len(hits)
    counts: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    for hit in hits:
        counts[hit.type] = counts.get(hit.type, 0) + 1
        group = SEARCH_GROUPS.get(hit.type, "other")
        group_counts[group] = group_counts.get(group, 0) + 1
    hits = hits[: max(1, min(limit, 200))]
    return {
        "query": query,
        "investigation_id": investigation_id,
        "total": total_matches,
        "returned": len(hits),
        "counts": counts,
        "group_counts": group_counts,
        "results": [hit.as_dict() for hit in hits],
    }
