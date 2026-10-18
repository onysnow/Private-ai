"""A party of one kind with no link of the kinds that should exist: a company
with no named director or owner in the records, a payment with no contract.
Absence in the records is not absence in the world, so specs on this family
are Faint and say so."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "missing_link"
VERSION = 1


class Params(BaseModel):
    record: str  # party schema, e.g. Company
    links: list[str]  # link schemas, e.g. [Directorship, Ownership]
    end: str = "target"  # the party is the link's target (owned, directed) or source
    only_if_linked: bool = True  # only parties that appear in some other link, so stray names are not flagged


def needs(p: Params) -> list[str]:
    return [p.record]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    has = {getattr(l, p.end) for l in graph.links if l.schema in p.links}
    anywhere = {x for l in graph.links for x in (l.source, l.target)}
    out = []
    for party in graph.parties.values():
        if party.schema != p.record or party.id in has:
            continue
        if p.only_if_linked and party.id not in anywhere:
            continue
        out.append(Measure([party.id], [], 1.0, {"party": party.name, "missing": " or ".join(x.lower() for x in p.links)}))
    return out
