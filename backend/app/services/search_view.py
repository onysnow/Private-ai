"""What the redesigned search shows for each result, and the facets down the
side (docs/discovery/README.md "Search"; system-design.md §3.2).

``investigation_search`` (app/services/search.py) finds and scores records;
this module then:

- keeps one result per thing: a relationship is found once, as a link, not a
  second time as the FollowTheMoney entity that carries it;
- puts names in place of FollowTheMoney ids in titles and snippets;
- gives each result its kind of record, the parties it is about, how sure it
  is, its date, which fields matched, and the reporter's tags and note count;
- counts the facets (kind of record, party kind, how sure, tag) and applies
  the filters the reporter chose.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity, RelationshipEdge
from app.services.annotations import marks_for

# Kind of record: the left edge of a result card and its group in the list
# (README "Colour roles", kind of record). Search types -> kind.
KIND_OF_TYPE = {
    "entity": "party", "statement": "party",
    "relationship": "link",
    "evidence": "evidence", "source": "evidence",
    "claim": "claim_event", "timeline_event": "claim_event",
    "lead": "lead_task", "reporting_task": "lead_task",
    "document": "document", "document_chunk": "document", "extraction_candidate": "document",
    "connector_finding": "outside",
}
KIND_ORDER = ["party", "link", "evidence", "claim_event", "lead_task", "document", "outside"]

# Search types -> the record types tags and notes use (app/services/annotations.py).
MARK_TYPE = {
    "entity": "entity", "relationship": "relationship", "evidence": "evidence", "source": "source", "claim": "claim",
    "timeline_event": "event", "document": "document", "lead": "lead", "reporting_task": "task", "connector_finding": "finding",
}

# How sure (README "Colour roles"): supported, not yet shown, disputed, rejected.
SURE_OF_CLAIM = {"supported": "supported", "confirmed": "supported", "lead": "not_yet", "unverified": "not_yet",
                 "disputed": "disputed", "rejected": "rejected"}
SURE_OF_EVENT = {"verified": "supported", "asserted": "not_yet", "approximate": "not_yet", "unresolved": "not_yet",
                 "disputed": "disputed"}
SURE_OF_LINK = {"independent_support": "supported", "challenged_support": "disputed", "mixed_support": "disputed",
                "no_supporting_claim": "not_yet", "no_claim_dependency": "not_yet"}
SURE_ORDER = ["supported", "not_yet", "disputed", "rejected"]

# Party kind: the same schema -> kind table the charts use (frontend
# lib/viz-tokens.ts partyKind). A bare LegalEntity is "other".
KIND_OF_SCHEMA = {
    "Person": "person", "Company": "company", "Organization": "organisation", "PublicBody": "organisation",
    "Vessel": "vehicle", "Airplane": "vehicle", "Vehicle": "vehicle",
    "RealEstate": "property", "Asset": "property", "Security": "property",
}


def party_kind_of(schema: str | None) -> str:
    return KIND_OF_SCHEMA.get(schema or "", "other")


# FtM ids are long tokens of letters, digits, dots, dashes and underscores.
_ID_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,}")


def _names(db: Session, investigation_ids: set[str]) -> tuple[dict[str, str], dict[str, Any], set[str]]:
    """Captions by entity id and by FtM id, entity rows by id, and the ids of
    entities that only carry a relationship (the interstitial FtM entity)."""
    if not investigation_ids:
        return {}, {}, set()
    rows = db.execute(select(Entity.id, Entity.ftm_id, Entity.caption, Entity.schema)
                      .where(Entity.investigation_id.in_(investigation_ids))).all()
    captions: dict[str, str] = {}
    by_id: dict[str, Any] = {}
    for row in rows:
        by_id[row.id] = row
        if row.caption:
            captions[row.id] = row.caption
            if row.ftm_id:
                captions[row.ftm_id] = row.caption
    carriers = set(db.scalars(select(RelationshipEdge.relationship_entity_id)
                              .where(RelationshipEdge.investigation_id.in_(investigation_ids))))
    return captions, by_id, carriers


def _named(text: str, captions: dict[str, str]) -> str:
    if not text or not captions:
        return text
    return _ID_TOKEN.sub(lambda m: captions.get(m.group(0), m.group(0)), text)


def _party(row: Any) -> dict[str, str]:
    return {"id": row.id, "name": row.caption or row.id, "schema": row.schema}


def _sure(hit: dict[str, Any]) -> str | None:
    meta = hit["metadata"]
    if hit["type"] == "claim":
        return SURE_OF_CLAIM.get(meta.get("status") or "")
    if hit["type"] == "timeline_event":
        return SURE_OF_EVENT.get(meta.get("verification_status") or "")
    if hit["type"] == "relationship":
        return SURE_OF_LINK.get(((meta.get("advisory") or {}).get("support_state")) or "")
    return None


def _date(hit: dict[str, Any]) -> str | None:
    meta = hit["metadata"]
    value = meta.get("date_start") if hit["type"] == "timeline_event" else meta.get("due_date") if hit["type"] == "reporting_task" else None
    return str(value) if value else None


def _parties(hit: dict[str, Any], by_id: dict[str, Any]) -> list[dict[str, str]]:
    meta, prov = hit["metadata"], hit["provenance"]
    ids: list[str | None] = []
    if hit["type"] == "entity":
        ids = [meta.get("active_entity_id") or hit["id"]]
    elif hit["type"] == "statement":
        ids = [prov.get("entity_id")]
    elif hit["type"] == "relationship":
        ids = [meta.get("source_entity_id"), meta.get("target_entity_id")]
    elif hit["type"] == "timeline_event":
        ids = [meta.get("entity_id")]
    return [_party(by_id[i]) for i in ids if i and i in by_id]


def _matched_fields(query: str, fields: Iterable[tuple[str, Any]]) -> list[str]:
    words = [w.casefold() for w in query.split() if w.strip()]
    q = query.strip().casefold()
    out = []
    for label, value in fields:
        text = str(value).casefold() if value is not None else ""
        if text and (q in text or any(w in text for w in words)):
            out.append(label)
    return out


def _fields(hit: dict[str, Any]) -> list[tuple[str, Any]]:
    """The labelled fields each kind of result is scored on (the same values
    app/services/search.py passes to _score), so "why it matched" can name them."""
    t, meta, prov = hit["type"], hit["metadata"], hit["provenance"]
    if t == "entity":
        props = meta.get("properties") or {}
        return [("name", hit["title"]), ("kind", meta.get("schema")), ("id", prov.get("ftm_id")),
                *((f"property: {k}", " ".join(str(v) for v in (vals or []))) for k, vals in props.items())]
    if t == "statement":
        return [("property", meta.get("prop")), ("value", meta.get("value")), ("dataset", prov.get("dataset"))]
    if t == "source":
        return [("title", hit["title"]), ("address", prov.get("url")), ("type", meta.get("source_type"))]
    if t == "evidence":
        return [("quote", meta.get("quote")), ("locator", prov.get("locator")), ("notes", meta.get("notes")),
                ("source", hit["title"]), ("address", prov.get("source_url"))]
    if t == "claim":
        return [("claim", hit["snippet"]), ("status", meta.get("status"))]
    if t == "lead":
        return [("title", hit["title"]), ("detail", hit["snippet"]), ("next action", meta.get("next_action")),
                ("owner", meta.get("owner")), ("status", meta.get("status"))]
    if t == "reporting_task":
        return [("title", hit["title"]), ("detail", hit["snippet"]), ("owner", meta.get("owner")), ("status", meta.get("status"))]
    if t == "document":
        return [("file name", meta.get("filename")), ("source", hit["title"]), ("file type", meta.get("mime_type"))]
    if t == "document_chunk":
        return [("text", hit["snippet"]), ("locator", prov.get("locator"))]
    if t == "extraction_candidate":
        return [("proposal", hit["snippet"]), ("proposal type", meta.get("candidate_type"))]
    if t == "connector_finding":
        return [("name", hit["title"]), ("properties", hit["snippet"]), ("provider", prov.get("provider"))]
    if t == "timeline_event":
        return [("title", hit["title"]), ("description", hit["snippet"]), ("date", meta.get("date_start"))]
    if t == "relationship":
        return [("link", hit["title"]), ("kind", meta.get("schema")), ("details", hit["snippet"])]
    return []


def shape_results(db: Session, query: str, hits: list[dict[str, Any]], *, kind: str | None = None,
                  party_kind: str | None = None, sure: str | None = None, tag: str | None = None,
                  date_from: str | None = None, date_to: str | None = None) -> tuple[list[dict[str, Any]], dict[str, dict[str, int]]]:
    """Deduplicate, name, enrich; count facets over every result the words
    found; then apply the chosen filters. Returns (results, facets)."""
    investigation_ids = {h["investigation_id"] for h in hits}
    captions, by_id, carriers = _names(db, investigation_ids)

    # A party found by its name and by one of its details is one result: the
    # detail's field joins the party's "why it matched". A detail with a
    # reviewed-duplicate decision on it stays its own result, so the reporter
    # still sees which copy was preferred (app/services/post_merge_reconciliation.py).
    party_hits = {h["provenance"].get("canonical_entity_id") or h["id"] for h in hits if h["type"] == "entity"}

    def folds(h: dict[str, Any]) -> bool:
        return h["type"] == "statement" and h["provenance"].get("entity_id") in party_hits and not h["provenance"].get("reconciliation")

    folded: dict[str, list[str]] = defaultdict(list)
    for h in hits:
        if folds(h):
            folded[h["provenance"]["entity_id"]].append(f"property: {h['metadata'].get('prop')}")

    shaped: list[dict[str, Any]] = []
    for hit in hits:
        if folds(hit):
            continue
        # One result per thing: the FtM entity that only carries a link is the link.
        if hit["type"] == "entity" and hit["id"] in carriers:
            continue
        if hit["type"] == "statement" and hit["provenance"].get("entity_id") in carriers:
            continue
        hit = dict(hit)
        hit["title"] = _named(hit["title"], captions)
        hit["snippet"] = _named(hit["snippet"], captions)
        hit["kind"] = KIND_OF_TYPE.get(hit["type"], "document")
        hit["parties"] = _parties(hit, by_id)
        hit["sure"] = _sure(hit)
        hit["date"] = _date(hit)
        hit["matched_fields"] = _matched_fields(query, _fields(hit))
        if hit["type"] == "entity":
            extra = folded.get(hit["provenance"].get("canonical_entity_id") or hit["id"], [])
            hit["matched_fields"] += [f for f in extra if f not in hit["matched_fields"]]
        hit["record_type"] = MARK_TYPE.get(hit["type"])
        hit["tags"], hit["note_count"] = [], 0
        shaped.append(hit)

    # The reporter's tags and note counts, per investigation, in two queries each.
    keys_by_inv: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for hit in shaped:
        if hit["record_type"]:
            keys_by_inv[hit["investigation_id"]].append((hit["record_type"], hit["id"]))
    for inv, keys in keys_by_inv.items():
        marks = marks_for(db, inv, keys)
        for hit in shaped:
            mark = marks.get((hit["record_type"], hit["id"])) if hit["investigation_id"] == inv else None
            if mark:
                hit["tags"], hit["note_count"] = mark["tags"], mark["note_count"]

    facets: dict[str, Counter[str]] = {"kind": Counter(), "party_kind": Counter(), "sure": Counter(), "tag": Counter()}
    for hit in shaped:
        facets["kind"][hit["kind"]] += 1
        for p in hit["parties"][:1] if hit["kind"] == "party" else []:
            facets["party_kind"][party_kind_of(p["schema"])] += 1
        if hit["sure"]:
            facets["sure"][hit["sure"]] += 1
        for t in hit["tags"]:
            facets["tag"][t["id"]] += 1

    def keep(hit: dict[str, Any]) -> bool:
        if kind and hit["kind"] != kind:
            return False
        if party_kind and not (hit["kind"] == "party" and hit["parties"] and party_kind_of(hit["parties"][0]["schema"]) == party_kind):
            return False
        if sure and hit["sure"] != sure:
            return False
        if tag and not any(t["id"] == tag for t in hit["tags"]):
            return False
        if date_from or date_to:
            d = (hit["date"] or "")[:10]
            # Compare at the precision the reporter gave: "2024" takes every date in 2024.
            if not d or (date_from and d[:len(date_from)] < date_from) or (date_to and d[:len(date_to)] > date_to):
                return False
        return True

    return [h for h in shaped if keep(h)], {name: dict(counter) for name, counter in facets.items()}


# --- the peek card: a result on hover, without leaving the page ---------------

PEEK_NEIGHBOURS = 8


def peek(db: Session, investigation_id: str, record_type: str, record_id: str) -> dict[str, Any]:
    """A small picture of one record: the parties it links to (up to eight),
    its evidence counted by stance, and its latest dated event."""
    from app.models.domain import ClaimEvidenceLink, Evidence, TimelineEvent
    from app.services.annotations import caption_for, find_record
    from app.services.relationships import serialize_relationship

    row = find_record(db, investigation_id, record_type, record_id)
    neighbours: list[dict[str, Any]] = []
    stance: Counter[str] = Counter()
    events = select(TimelineEvent).where(TimelineEvent.investigation_id == investigation_id)
    link_count = 0

    def add_review_counts(edge: RelationshipEdge) -> None:
        counts = (serialize_relationship(db, edge).get("advisory") or {}).get("relationship_evidence_review_counts") or {}
        stance.update({k: v for k, v in counts.items() if v})

    if record_type == "entity":
        edges = list(db.scalars(select(RelationshipEdge).where(
            RelationshipEdge.investigation_id == investigation_id,
            (RelationshipEdge.source_entity_id == record_id) | (RelationshipEdge.target_entity_id == record_id))
            .order_by(RelationshipEdge.created_at)))
        link_count = len(edges)
        others = {e.target_entity_id if e.source_entity_id == record_id else e.source_entity_id for e in edges}
        names = {e.id: e for e in db.scalars(select(Entity).where(Entity.id.in_(others)))} if others else {}
        for edge in edges[:PEEK_NEIGHBOURS]:
            other_id = edge.target_entity_id if edge.source_entity_id == record_id else edge.source_entity_id
            other = names.get(other_id)
            if other is not None:
                neighbours.append({"id": other.id, "name": other.caption or other.id, "schema": other.schema,
                                   "link": edge.schema, "outgoing": edge.source_entity_id == record_id})
        for edge in edges:
            add_review_counts(edge)
        events = events.where(TimelineEvent.entity_id == record_id)
    elif record_type == "relationship":
        link_count = 1
        for end_id, outgoing in ((row.source_entity_id, False), (row.target_entity_id, True)):
            end = db.get(Entity, end_id)
            if end is not None:
                neighbours.append({"id": end.id, "name": end.caption or end.id, "schema": end.schema, "link": row.schema, "outgoing": outgoing})
        add_review_counts(row)
        events = events.where(TimelineEvent.relationship_entity_id == row.relationship_entity_id)
    elif record_type == "claim":
        stance.update(link.stance for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == record_id)))
        events = events.where(TimelineEvent.claim_id == record_id)
    elif record_type == "evidence":
        stance.update(link.stance for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id == record_id)))
        events = events.where(TimelineEvent.evidence_id == record_id)
    elif record_type == "source":
        evidence_ids = [e.id for e in db.scalars(select(Evidence).where(Evidence.source_id == record_id))]
        if evidence_ids:
            stance.update(link.stance for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_(evidence_ids))))
        events = events.where(TimelineEvent.source_id == record_id)
    elif record_type == "lead":
        events = events.where(TimelineEvent.lead_id == record_id)
    elif record_type == "event":
        events = events.where(TimelineEvent.id == record_id)
    else:
        events = events.where(TimelineEvent.id.is_(None))

    latest = db.scalars(events.where(TimelineEvent.date_start.is_not(None)).order_by(TimelineEvent.date_start.desc())).first()
    return {
        "record_type": record_type, "record_id": record_id, "caption": caption_for(db, record_type, record_id),
        "link_count": link_count, "neighbours": neighbours, "evidence_by_stance": dict(stance),
        "latest_event": None if latest is None else {"id": latest.id, "title": latest.title, "date": latest.date_start},
    }
