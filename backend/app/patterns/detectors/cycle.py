"""A loop of links of one kind: ownership that comes back to where it
started, money that goes round and back (BO-001, ML-023)."""

from __future__ import annotations

import networkx as nx
from pydantic import BaseModel, Field

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph, first

NAME = "cycle"
VERSION = 1


class Params(BaseModel):
    link: str = Field(description="FtM link schema, e.g. Ownership or Payment")
    min_parties: int = 1


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    g = graph.directed(p.link)
    out = []
    for cycle in nx.simple_cycles(nx.DiGraph(g)):
        ring = list(cycle)
        if len(ring) < p.min_parties:
            continue
        links, amounts = [], []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            key = sorted(g.get_edge_data(a, b).keys())[0]
            links.append(key)
            link = g.get_edge_data(a, b)[key]["link"]
            amounts.append(f"{first(link.properties, 'amount') or '?'} {first(link.properties, 'currency') or ''}".strip())
        facts = {"loop": [graph.name(x) for x in ring], "path": " → ".join(graph.name(x) for x in ring + ring[:1]), "parties_in_loop": len(ring)}
        if p.link == "Payment":
            facts["amounts"] = amounts
        out.append(Measure(ring, links, float(len(ring)), facts))
    return out
