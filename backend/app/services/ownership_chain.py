"""Who owns and controls a company, and what it owns (visuals pass 4: the
design doc's "Ownership and control chain"; drawn by the app with React
Flow and dagre).

From one entity, the chain follows the investigation's Ownership links up
(its owners, their owners, ...) and down (what it owns, and so on), and
names its directors (Directorship links into it and into each company the
chain passes through, one step, as a corporate structure chart shows the
board beside the company). It walks at most MAX_DEPTH steps each way.

Each Ownership link carries what the records say: its percentage
(FollowTheMoney's ``percentage``, a number in percent), its role and its
dates; an ownership whose end date has passed is marked ended rather than
left out, since a former owner is often the story. A reconciled duplicate
of a link (post-merge reconciliation) is not followed, so a stake is never
counted twice.

For every owner above the entity the chain works out the share it holds
through all the paths that lead to it: the percentages multiplied along each
path and the paths added together, as HMRC's guidance computes an indirect
ownership interest ("multiply these percentages for each entity up the
chain in turn"; "the aggregate of these interests" over several chains:
https://www.gov.uk/hmrc-internal-manuals/multinational-top-up-tax-and-domestic-top-up-tax/mtt17040)
and the FCC's rule for equity through intervening companies ("successive
multiplication of the equity percentages for each link", 47 CFR 1.5002).
It does so only when every link on every path states a percentage, none
has ended and none runs in a circle; otherwise it says the share is not
known and why, and never guesses. This is equity arithmetic, not a finding
of control or beneficial ownership, which the reporter decides.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.domain import Entity

MAX_DEPTH = 6
MAX_PATHS = 200          # paths followed per owner; past this the share is not worked out


@dataclass
class _Link:
    id: str
    schema: str
    source: str
    target: str
    percentage: float | None
    role: str | None
    start_date: str | None
    end_date: str | None
    ended: bool
    circular: bool = False


@dataclass
class Chain:
    nodes: dict[str, dict[str, Any]] = field(default_factory=dict)
    links: dict[str, _Link] = field(default_factory=dict)


def _first(properties: Any, name: str) -> str | None:
    values = properties.get(name) if isinstance(properties, dict) else None
    if isinstance(values, list):
        for value in values:
            text = str(value).strip()
            if text:
                return text
    return None


def parse_percentage(text: str | None) -> float | None:
    """'25', '25.5', '25 %' -> 25.0; anything else, or outside 0-100, is not known."""
    if text is None:
        return None
    cleaned = text.replace("%", "").replace(",", ".").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if 0 < value <= 100 else None


def _ended(end_date: str | None, today: date) -> bool:
    if not end_date:
        return False
    text = end_date[:10]
    # A year alone ends at the end of that year; a month at the end of that month.
    padded = text + "-12-31" if len(text) == 4 else (text + "-28" if len(text) == 7 else text)
    try:
        return date.fromisoformat(padded) < today
    except ValueError:
        return False


def _links(db: Session, investigation_id: str, today: date) -> list[_Link]:
    from app.services.relationships import investigation_relationships

    rows = investigation_relationships(db, investigation_id, {"Ownership", "Directorship"}, include_reconciled_duplicates=False)
    out = []
    for row in rows:
        source, target = row.get("source") or {}, row.get("target") or {}
        if not source.get("id") or not target.get("id"):
            continue
        props = row.get("properties") or {}
        end = _first(props, "endDate")
        out.append(_Link(id=str(row["id"]), schema=str(row["schema"]), source=str(source["id"]), target=str(target["id"]),
                         percentage=parse_percentage(_first(props, "percentage")) if row["schema"] == "Ownership" else None,
                         role=_first(props, "role"), start_date=_first(props, "startDate"), end_date=end, ended=_ended(end, today)))
    return sorted(out, key=lambda link: link.id)


def ownership_chain(db: Session, entity: Entity, *, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    links = _links(db, entity.investigation_id, today)
    owned_by: dict[str, list[_Link]] = defaultdict(list)    # asset -> its Ownership links
    owns: dict[str, list[_Link]] = defaultdict(list)        # owner -> its Ownership links
    directors_of: dict[str, list[_Link]] = defaultdict(list)
    for link in links:
        if link.schema == "Ownership":
            owned_by[link.target].append(link)
            owns[link.source].append(link)
        else:
            directors_of[link.target].append(link)

    level: dict[str, int] = {entity.id: 0}
    kept: dict[str, _Link] = {}
    truncated = False

    def walk(start: str, step: int, follow: dict[str, list[_Link]], far_end: str) -> None:
        """Breadth first from `start`, `step` -1 going up to owners, +1 down."""
        nonlocal truncated
        frontier = [start]
        for depth in range(1, MAX_DEPTH + 1):
            nxt = []
            for node in frontier:
                for link in follow.get(node, []):
                    other = getattr(link, far_end)
                    if other in level:
                        kept.setdefault(link.id, link)    # converging paths, or a circle (marked below)
                        continue
                    level[other] = depth * step
                    kept[link.id] = link
                    nxt.append(other)
            frontier = nxt
            if not frontier:
                break
        else:
            truncated = truncated or any(follow.get(node) for node in frontier)

    walk(entity.id, -1, owned_by, "source")   # owners, drawn above (negative levels)
    walk(entity.id, 1, owns, "target")        # what it owns, below
    _mark_circles(kept)
    companies = list(level)
    for company in companies:
        for link in directors_of.get(company, []):
            kept.setdefault(link.id, link)
            level.setdefault(link.source, level[company] - 1)

    nodes = []
    for entity_id, at in sorted(level.items(), key=lambda kv: (kv[1], kv[0])):
        row = db.get(Entity, entity_id)
        if row is None:
            continue
        nodes.append({"id": row.id, "caption": row.caption, "schema": row.schema, "level": at, "is_subject": row.id == entity.id})
    owners = _effective_shares(entity.id, owned_by, level)
    return {
        "entity_id": entity.id, "nodes": nodes,
        "links": [{"id": l.id, "schema": l.schema, "source": l.source, "target": l.target, "percentage": l.percentage, "role": l.role,
                   "start_date": l.start_date, "end_date": l.end_date, "ended": l.ended, "circular": l.circular}
                  for l in sorted(kept.values(), key=lambda l: l.id)],
        "owners": owners, "max_depth": MAX_DEPTH, "truncated": truncated,
    }


def _mark_circles(kept: dict[str, _Link]) -> None:
    """An Ownership link is circular when its owner can be reached again by
    following ownership on from the asset (A owns B, B owns A; or longer)."""
    onward: dict[str, set[str]] = defaultdict(set)
    for link in kept.values():
        if link.schema == "Ownership":
            onward[link.source].add(link.target)
    for link in kept.values():
        if link.schema != "Ownership":
            continue
        seen, stack = {link.target}, [link.target]
        while stack and not link.circular:
            for nxt in onward.get(stack.pop(), ()):
                if nxt == link.source:
                    link.circular = True
                    break
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)


def _effective_shares(subject: str, owned_by: dict[str, list[_Link]], level: dict[str, int]) -> list[dict[str, Any]]:
    """Every owner above the subject: the share it holds through every path
    (product along a path, sum over paths), or why it is not known."""
    paths: dict[str, list[list[_Link]]] = defaultdict(list)
    overflow: set[str] = set()

    def climb(node: str, path: list[_Link], seen: set[str]) -> None:
        for link in owned_by.get(node, []):
            owner = link.source
            if owner in seen or owner not in level:
                continue
            here = [*path, link]
            if len(paths[owner]) >= MAX_PATHS:
                overflow.add(owner)
                continue
            paths[owner].append(here)
            if len(here) < MAX_DEPTH:
                climb(owner, here, seen | {owner})

    climb(subject, [], {subject})
    out = []
    for owner, routes in sorted(paths.items()):
        missing = sum(1 for route in routes if any(l.percentage is None for l in route))
        ended = sum(1 for route in routes if any(l.ended for l in route))
        circle = any(l.circular for route in routes for l in route)
        if owner in overflow:
            share, reason = None, f"more than {MAX_PATHS} paths lead to it"
        elif circle:
            share, reason = None, "the ownership runs in a circle, so the shares cannot be added up"
        elif missing:
            share, reason = None, f"{missing} of {len(routes)} path(s) have a link with no percentage"
        elif ended:
            share, reason = None, f"{ended} of {len(routes)} path(s) pass through an ownership that has ended"
        else:
            total = 0.0
            for route in routes:
                product = 1.0
                for link in route:
                    product *= (link.percentage or 0.0) / 100
                total += product
            share, reason = round(total * 100, 2), None
        out.append({"entity_id": owner, "paths": len(routes), "direct": any(len(route) == 1 for route in routes),
                    "effective_percentage": share, "not_known_because": reason})
    return out
