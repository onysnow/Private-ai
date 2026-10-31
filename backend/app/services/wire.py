"""The Wire (See; prototype docs/design/see-the-wire, SEE_THE_WIRE_PROTOTYPE.md): the
case's parties and links as one map the reporter flies over.

What the screen needs, read from the reviewed records and nothing else:

- every party, with its kind, its Red Flags, the group it falls in and a place on
  the map. Groups come from community detection (networkx greedy modularity) on
  the links, with bank accounts counted as their holder's, so an account never
  splits a group. Places come from a spring layout of the groups, then one of
  each group's members, both seeded so the map is the same each time it opens.
- every link, with its family (owns, runs, money, other), amount, currency, date,
  role or purpose and the first three quotes that show it.
- the dated events, for the time strip.

Nothing here writes. Parties merged into another record are left out, and so is
a link that loses an end that way.

`link_sources` is SEE_1's link panel: for one link, each piece of evidence on it with
the page its quote stands on (so the screen can draw the scan with the words lit), the
latest review of it, and the open Red Flags that rest on the link."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

import networkx as nx
from followthemoney import model
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.documents import DocumentChunk
from app.models.domain import Entity, PatternFlag, TimelineEvent
from app.models.relationships import (
    RelationshipEdge,
    RelationshipEvidenceAttachment,
    RelationshipEvidenceReviewEvent,
)
from app.models.sources import Evidence, Source
from app.services.claim_done import _document_of
from app.services.custody_chain import _anchor, _passage
from app.services.relationships import investigation_relationships
from app.services.payment_kinds import is_owed

KIND = {"Person": "person", "Company": "company", "Organization": "org", "PublicBody": "org", "Vessel": "vehicle", "Vehicle": "vehicle",
        "Airplane": "vehicle", "RealEstate": "property", "Asset": "property", "BankAccount": "account", "LegalEntity": "other"}
FAMILY = {"Ownership": "owns", "Directorship": "runs", "Employment": "runs", "Membership": "runs", "Payment": "money"}
MAP = (120, 2280, 120, 1380)        # x0, x1, y0, y1 of the map, in the screen's world units


def _first(props: dict[str, Any], *names: str) -> str:
    for name in names:
        for value in props.get(name) or []:
            if str(value).strip():
                return str(value).strip()
    return ""


def _amount(props: dict[str, Any]) -> float | None:
    try:
        return float(_first(props, "amount").replace(",", ""))
    except ValueError:
        return None


def _short(caption: str) -> str:
    """The name without its bracketed abbreviation, cut at a word past 32 characters."""
    text = re.sub(r"\s*\(.*?\)", "", caption).strip() or caption
    return text if len(text) <= 32 else text[:31].rsplit(" ", 1)[0] + "…"


def _layout(graph: nx.Graph, groups: list[set[str]]) -> dict[str, tuple[float, float]]:
    """Groups placed by a spring layout of how they link to each other; each
    group's members by their own spring layout, in a patch sized to the group."""
    group_of = {n: i for i, members in enumerate(groups) for n in members}
    between = nx.Graph()
    between.add_nodes_from(range(len(groups)))
    for u, v in graph.edges():
        a, b = group_of[u], group_of[v]
        if a != b:
            weight = between.get_edge_data(a, b, {"weight": 0})["weight"]
            between.add_edge(a, b, weight=weight + 1)
    centres = nx.spring_layout(between, seed=7, k=3.2, weight="weight") if len(groups) > 1 else {0: (0.0, 0.0)}
    pos: dict[str, tuple[float, float]] = {}
    for i, members in enumerate(groups):
        sub = graph.subgraph(members)
        local = nx.spring_layout(sub, seed=3, k=1.6, iterations=200) if len(members) > 1 else {next(iter(members)): (0.0, 0.0)}
        r = 0.15 + 0.065 * math.sqrt(len(members))
        for n, (x, y) in local.items():
            pos[n] = (centres[i][0] + x * r, centres[i][1] * 0.75 + y * r * 0.8)
    if not pos:
        return {}
    xs, ys = [p[0] for p in pos.values()], [p[1] for p in pos.values()]
    def scale(v: float, lo: float, hi: float, a: float, b: float) -> float:
        return (a + b) / 2 if hi == lo else a + (v - lo) / (hi - lo) * (b - a)
    x0, x1, y0, y1 = MAP
    return {n: (round(scale(x, min(xs), max(xs), x0, x1)), round(scale(y, min(ys), max(ys), y0, y1))) for n, (x, y) in pos.items()}


def wire(db: Session, investigation_id: str) -> dict[str, Any]:
    # A link is stored as an FtM entity too (an edge schema: Payment, Ownership...); only parties are drawn.
    entities = {e.id: e for e in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id,
                                                                 Entity.merged_into_entity_id.is_(None)))
                if not getattr(model.get(e.schema), "edge", False)}
    rows = [r for r in investigation_relationships(db, investigation_id, include_reconciled_duplicates=False)
            if r.get("source") and r.get("target") and r["source"]["id"] in entities and r["target"]["id"] in entities]

    # An account is drawn on its holder: the party that owns it.
    holder: dict[str, str] = {}
    for r in rows:
        if r["schema"] == "Ownership" and entities[r["target"]["id"]].schema == "BankAccount":
            holder.setdefault(r["target"]["id"], r["source"]["id"])
    degree: Counter[str] = Counter()
    for r in rows:
        degree.update([r["source"]["id"], r["target"]["id"]])

    links = []
    for r in rows:
        props = r.get("properties") or {}
        attachments = (r.get("provenance") or {}).get("evidence_attachments") or []
        quotes = []
        for att in attachments[:3]:
            ev = att.get("evidence") or {}
            if ev.get("quote"):
                quotes.append({"doc": ((ev.get("source") or {}).get("title") or ""), "loc": ev.get("locator") or "", "q": str(ev["quote"])[:260],
                               "evidence_id": ev.get("id")})
        links.append({
            "id": r["id"], "s": r["source"]["id"], "t": r["target"]["id"], "schema": r["schema"], "fam": FAMILY.get(r["schema"], "other"),
            "amount": _amount(props), "cur": _first(props, "currency").upper(), "date": _first(props, "date", "startDate")[:10],
            "role": _first(props, "role", "purpose", "summary")[:160], "pct": _first(props, "percentage"), "ev": quotes,
            # A payment's kind (app/services/payment_kinds.py), and whether it is an amount owed: a price, a fine or
            # an order records what was set, not money that moved, so the screen keeps it out of what it adds up.
            "payment_kind": r.get("payment_kind") if r["schema"] == "Payment" else None,
            "owed": r["schema"] == "Payment" and is_owed(r.get("payment_kind")),
        })

    graph = nx.Graph()
    for link in links:
        a, b = holder.get(link["s"], link["s"]), holder.get(link["t"], link["t"])
        if a != b:
            graph.add_edge(a, b)
    graph.add_nodes_from(n for n in entities if n not in holder)
    linked = [n for n in graph.nodes if graph.degree(n) > 0]
    groups = [set(c) for c in nx.algorithms.community.greedy_modularity_communities(graph.subgraph(linked), resolution=1.1)] if linked else []
    group_of = {n: i for i, c in enumerate(groups) for n in c}
    pos = _layout(graph.subgraph(linked), groups)
    # Unlinked parties: a row along the bottom of the map (the screen labels it).
    loose = sorted((n for n in graph.nodes if graph.degree(n) == 0), key=lambda n: entities[n].caption.casefold())
    for i, n in enumerate(loose):
        pos[n] = (260 + (i % 9) * 200, 1560 + (i // 9) * 110)
        group_of[n] = -1
    for account, owner in holder.items():
        pos[account] = pos.get(owner, (0, 0))
        group_of[account] = group_of.get(owner, -1)

    flags: dict[str, dict[str, Any]] = {}
    for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.status == "open",
                                                  PatternFlag.gone_at.is_(None)).order_by(PatternFlag.weight.desc())):
        for party in f.parties or []:
            if party not in entities:
                continue
            slot = flags.setdefault(party, {"faint": 0, "strong": 0, "textbook": 0, "items": []})
            if f.level in ("faint", "strong", "textbook"):
                slot[f.level] += 1
            if len(slot["items"]) < 6:
                slot["items"].append({"level": f.level, "id": f.indicator_id, "text": str((f.facts or {}).get("summary") or ""), "flag_id": f.id})

    out_entities = []
    for eid, e in entities.items():
        props = e.properties or {}
        x, y = pos.get(eid, (MAP[0], MAP[3]))
        out_entities.append({
            "id": eid, "name": e.caption, "short": _short(e.caption), "kind": KIND.get(e.schema, "other"), "schema": e.schema,
            "note": _first(props, "notes", "summary", "description")[:220], "deg": degree[eid], "holder": holder.get(eid),
            "c": group_of.get(eid, -1), "x": x, "y": y, "jur": _first(props, "jurisdiction", "country", "nationality").lower(),
            "flags": flags.get(eid),
        })
    out_entities.sort(key=lambda e: str(e["id"]))

    events = [{"date": ev.date_start[:10], "title": ev.title, "entity": ev.entity_id}
              for ev in db.scalars(select(TimelineEvent).where(TimelineEvent.investigation_id == investigation_id)
                                   .order_by(TimelineEvent.date_start))
              if ev.date_start and ev.date_start[:4].isdigit()]
    return {"investigation_id": investigation_id, "entities": out_entities, "links": links, "events": events}


def link_sources(db: Session, edge: RelationshipEdge) -> dict[str, Any]:
    """One link's evidence for SEE_1's link panel, oldest attachment first. The page is where the quote's anchor is
    now (ADR-0015), else the first passage that says it; a quote with no document or no page has none."""
    rows = []
    for att in db.scalars(select(RelationshipEvidenceAttachment).where(RelationshipEvidenceAttachment.relationship_edge_id == edge.id)
                          .order_by(RelationshipEvidenceAttachment.created_at)):
        ev = db.get(Evidence, att.evidence_id)
        if ev is None:
            continue
        source = db.get(Source, ev.source_id) if ev.source_id else None
        doc = _document_of(db, ev, source)
        page = None
        if doc is not None and ev.quote:
            _, chunk_id = _anchor(db, ev, doc)
            chunk = db.get(DocumentChunk, chunk_id) if chunk_id else _passage(db, doc, ev.quote, None)
            page = chunk.page_number if chunk else None
        review = db.scalar(select(RelationshipEvidenceReviewEvent).where(RelationshipEvidenceReviewEvent.relationship_edge_id == edge.id,
                                                                         RelationshipEvidenceReviewEvent.evidence_id == ev.id)
                           .order_by(RelationshipEvidenceReviewEvent.created_at.desc()))
        rows.append({"evidence_id": ev.id, "quote": ev.quote or "", "locator": ev.locator or "",
                     "source_title": source.title if source else "", "document_id": doc.id if doc else None,
                     "filename": doc.filename if doc else "", "page": page,
                     "stance": review.stance if review else None, "reviewed_at": review.created_at if review else None})
    flags = [{"flag_id": f.id, "id": f.indicator_id, "level": f.level, "text": str((f.facts or {}).get("summary") or "")}
             for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == edge.investigation_id, PatternFlag.status == "open",
                                                           PatternFlag.gone_at.is_(None)).order_by(PatternFlag.weight.desc()))
             if edge.id in (f.links or [])]
    return {"relationship_id": edge.id, "evidence": rows, "flags": flags}
