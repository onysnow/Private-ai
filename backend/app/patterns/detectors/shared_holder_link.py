"""A link of one kind between parties that share an owner or a director
(someone holds an Ownership or Directorship link to both): dealings between
companies with the same owners or directors (BO-031). A party that itself
holds the other is not counted: that is a parent dealing with its own company."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "shared_holder_link"
VERSION = 1


class Params(BaseModel):
    link: str = "Payment"
    holder_links: list[str] = ["Ownership", "Directorship"]


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    holders: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for link in graph.links:
        if link.schema in p.holder_links:
            holders[link.target][link.source].append(link)
    dealings: dict[frozenset[str], list] = defaultdict(list)
    for link in graph.links:
        if link.schema == p.link and link.source != link.target:
            dealings[frozenset((link.source, link.target))].append(link)
    out = []
    for pair, found in dealings.items():
        a, b = sorted(pair)
        if a in holders[b] or b in holders[a]:
            continue
        shared = sorted(set(holders[a]) & set(holders[b]))
        if not shared:
            continue
        roles = [f"{graph.name(h)} ({' and '.join(sorted({l.schema.lower() for l in holders[a][h] + holders[b][h]}))})" for h in shared]
        held = [l.id for h in shared for l in holders[a][h] + holders[b][h]]
        out.append(Measure([a, b, *shared], [l.id for l in found] + held, float(len(found)), {
            "payments": len(found), "shared": shared, "a": graph.name(a), "b": graph.name(b), "holders": ", ".join(roles),
            "count_text": f"{len(found)} payment{'s' if len(found) != 1 else ''}"}))
    return out
