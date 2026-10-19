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
- each quote's document and page, when the evidence comes from a document the case
  holds (the passage found as Chain of Custody finds it), so the screen can draw the
  page with the words lit.
- the open Red Flags each link is part of, with the flag's first innocent explanation.
- links the app works out (``worked_out``), never stored and never reviewed: an
  owner's indirect stake in a company it does not own directly, through a chain of
  ownership links (the arithmetic of ownership_chain.py: the percentages multiplied
  along each path and the paths added; not known when a link has no percentage, has
  ended or the ownership runs in a circle). Each says its rule, the stored links it
  was worked out from and, when those links make a circular-ownership Red Flag, that flag.

Nothing here writes. Parties merged into another record are left out, and so is
a link that loses an end that way."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import date
from typing import Any

import networkx as nx
from followthemoney import model
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity, PatternFlag, TimelineEvent
from app.models.sources import Evidence, Source
from app.services.relationships import investigation_relationships

KIND = {"Person": "person", "Company": "company", "Organization": "org", "PublicBody": "org", "Vessel": "vehicle", "Vehicle": "vehicle",
        "Airplane": "vehicle", "RealEstate": "property", "Asset": "property", "BankAccount": "account", "LegalEntity": "other"}
FAMILY = {"Ownership": "owns", "Directorship": "runs", "Employment": "runs", "Membership": "runs", "Payment": "money"}
MAP = (120, 2280, 120, 1380)        # x0, x1, y0, y1 of the map, in the screen's world units
WORKED_OUT_MAX = 30                  # worked-out links drawn at most, largest known share first
WORKED_OUT_DEPTH = 3                 # links in the longest chain a worked-out link stands for
INDIRECT_RULE = ("indirect_ownership", "Indirect ownership",
                 "An owner's stake through a chain of ownership links: the percentages multiplied along each path "
                 "and the paths added together (HMRC's indirect ownership interest; 47 CFR 1.5002). Not worked out "
                 "when a link on a path has no percentage, has ended, or the ownership runs in a circle.")


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

    flags_on_link = _flags_on_links(db, investigation_id)
    links = []
    for r in rows:
        props = r.get("properties") or {}
        attachments = (r.get("provenance") or {}).get("evidence_attachments") or []
        quotes = []
        for att in attachments[:3]:
            ev = att.get("evidence") or {}
            if ev.get("quote"):
                quotes.append({"doc": ((ev.get("source") or {}).get("title") or ""), "loc": ev.get("locator") or "", "q": str(ev["quote"])[:260],
                               "evidence_id": ev.get("id"), **_page_of(db, ev.get("id"), str(ev["quote"]))})
        links.append({
            "id": r["id"], "s": r["source"]["id"], "t": r["target"]["id"], "schema": r["schema"], "fam": FAMILY.get(r["schema"], "other"),
            "amount": _amount(props), "cur": _first(props, "currency").upper(), "date": _first(props, "date", "startDate")[:10],
            "role": _first(props, "role", "purpose", "summary")[:160], "pct": _first(props, "percentage"), "ev": quotes,
            "flags": flags_on_link.get(r["id"], []),
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
    return {"investigation_id": investigation_id, "entities": out_entities, "links": links, "events": events,
            "worked_out": worked_out(db, investigation_id, set(entities), flags_on_link)}


def _page_of(db: Session, evidence_id: str | None, quote: str) -> dict[str, Any]:
    """The document a quote comes from and the page its passage is on, found as Chain of Custody finds it
    (custody_chain._passage); a document that is not a PDF has no page to draw."""
    from app.services.claim_done import _document_of
    from app.services.custody_chain import _passage

    ev = db.get(Evidence, evidence_id) if evidence_id else None
    if ev is None:
        return {"document_id": None, "page": None, "pdf": False}
    doc = _document_of(db, ev, db.get(Source, ev.source_id) if ev.source_id else None)
    if doc is None:
        return {"document_id": None, "page": None, "pdf": False}
    chunk = _passage(db, doc, quote, None)
    pdf = (doc.mime_type or "").lower() == "application/pdf" or doc.filename.lower().endswith(".pdf")
    return {"document_id": doc.id, "page": chunk.page_number if chunk else None, "pdf": pdf}


def _flags_on_links(db: Session, investigation_id: str) -> dict[str, list[dict[str, Any]]]:
    """Per link id: the open Red Flags whose records include it, strongest first, each with its first
    innocent explanation (the indicator's own words)."""
    from app.patterns.engine import indicator

    out: dict[str, list[dict[str, Any]]] = {}
    for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.status == "open",
                                                  PatternFlag.gone_at.is_(None)).order_by(PatternFlag.weight.desc(), PatternFlag.id)):
        found = indicator(f.indicator_id)
        ind = found[0] if found else None
        item = {"flag_id": f.id, "id": f.indicator_id, "level": f.level, "name": ind.name if ind else f.indicator_id,
                "text": str((f.facts or {}).get("summary") or ""), "path": str((f.facts or {}).get("path") or ""),
                "innocent": (ind.innocent_explanations[0] if ind and ind.innocent_explanations else "")}
        for link_id in f.links or []:
            slot = out.setdefault(str(link_id), [])
            if len(slot) < 4:
                slot.append(item)
    return out


def worked_out(db: Session, investigation_id: str, parties: set[str], flags_on_link: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Ownership the app works out: for each owner and each company it reaches through 2 to WORKED_OUT_DEPTH
    ownership links but does not own directly, the stake through every path (ownership_chain's arithmetic),
    or why it is not known. Each names its rule and the stored links it rests on; it is never stored."""
    from app.services.ownership_chain import MAX_DEPTH, _links, _mark_circles

    today = date.today()
    owns = [link for link in _links(db, investigation_id, today) if link.schema == "Ownership"
            and link.source in parties and link.target in parties and link.source != link.target]
    _mark_circles({link.id: link for link in owns})
    onward: dict[str, list[Any]] = defaultdict(list)
    direct: set[tuple[str, str]] = set()
    for link in owns:
        onward[link.source].append(link)
        direct.add((link.source, link.target))
    accounts = {e.id for e in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.schema == "BankAccount"))}
    out: list[dict[str, Any]] = []
    for owner in sorted(onward):
        routes: dict[str, list[list[Any]]] = defaultdict(list)
        stack: list[tuple[str, list[Any], frozenset[str]]] = [(owner, [], frozenset({owner}))]
        while stack:
            at, path, seen = stack.pop()
            for link in onward.get(at, []):
                if link.target in seen:
                    continue
                here = [*path, link]
                if len(here) >= 2 and len(routes[link.target]) < 200:
                    routes[link.target].append(here)
                if len(here) < MAX_DEPTH:
                    stack.append((link.target, here, seen | {link.target}))
        for target, paths in sorted(routes.items()):
            if (owner, target) in direct or target in accounts or min(len(p) for p in paths) > WORKED_OUT_DEPTH:
                continue
            used = [link for p in paths for link in p]
            if any(link.circular for link in used):
                share, why = None, "the ownership runs in a circle, so the shares cannot be added up"
            elif any(link.percentage is None for link in used):
                share, why = None, f"{sum(1 for p in paths if any(link.percentage is None for link in p))} of {len(paths)} path(s) have a link with no percentage"
            elif any(link.ended for link in used):
                share, why = None, f"{sum(1 for p in paths if any(link.ended for link in p))} of {len(paths)} path(s) pass through an ownership that has ended"
            else:
                total = sum(math.prod((link.percentage or 0.0) / 100 for link in p) for p in paths)
                share, why = round(total * 100, 2), ""
            shortest = min(paths, key=len)
            inputs = list(dict.fromkeys([link.id for link in shortest] + sorted(link.id for link in used)))
            # A path through a circle: the Red Flag that names that circle (its facts carry the loop's path).
            ring = next((f for i in inputs for f in flags_on_link.get(i, []) if f["path"]), None) if any(link.circular for link in used) else None
            out.append({
                "id": f"worked:{owner}:{target}", "s": owner, "t": target, "schema": "Ownership", "fam": "owns",
                "pct": "" if share is None else f"{share:g}", "share_unknown_because": why,
                "rule": INDIRECT_RULE[0], "rule_name": INDIRECT_RULE[1], "rule_text": INDIRECT_RULE[2],
                "inputs": inputs, "paths": len(paths), "steps": min(len(p) for p in paths),
                "via": [link.target for link in shortest[:-1]],
                "flag_id": ring["flag_id"] if ring else None,
            })
    out.sort(key=lambda w: (w["pct"] == "", -float(str(w["pct"]) or 0), str(w["id"])))
    return out[:WORKED_OUT_MAX]
