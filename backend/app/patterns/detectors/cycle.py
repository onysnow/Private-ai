"""A loop of links of one kind: ownership that comes back to where it
started, money that goes round and back (BO-001, ML-023)."""

from __future__ import annotations

from itertools import islice

import networkx as nx
from pydantic import BaseModel, Field

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph, first

NAME = "cycle"
VERSION = 1

# Loops in a dense case multiply fast: ten parties paying every other one make over a million. The search looks at
# no more than MAX_SEARCHED, keeps the MAX_KEPT shortest of those, and says so on each one it keeps ("loops_cut_short"),
# so a case-home read never builds them all.
MAX_SEARCHED = 2000
MAX_KEPT = 200


class Params(BaseModel):
    link: str = Field(description="FtM link schema, e.g. Ownership or Payment")
    min_parties: int = 1


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    g = graph.directed(p.link)
    out = []
    found = list(islice(nx.simple_cycles(nx.DiGraph(g)), MAX_SEARCHED + 1))
    cut_short = len(found) > MAX_SEARCHED
    rings = sorted((list(c) for c in found[:MAX_SEARCHED] if len(c) >= p.min_parties), key=len)
    cut_short = cut_short or len(rings) > MAX_KEPT
    for ring in rings[:MAX_KEPT]:
        links, amounts = [], []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            key = sorted(g.get_edge_data(a, b).keys())[0]
            links.append(key)
            link = g.get_edge_data(a, b)[key]["link"]
            amounts.append(f"{first(link.properties, 'amount') or '?'} {first(link.properties, 'currency') or ''}".strip())
        facts = {"loop": [graph.name(x) for x in ring], "path": " → ".join(graph.name(x) for x in ring + ring[:1]), "parties_in_loop": len(ring)}
        if p.link == "Payment":
            facts["amounts"] = amounts
        if cut_short:
            facts["loops_cut_short"] = True
        out.append(Measure(ring, links, float(len(ring)), facts))
    return out
