"""ML-023 Circular payments: money that leaves a party and comes back to it
through others (a loop of Payment links). The catalogue gives no number, so
a loop meets the published definition as worded: Textbook."""

from __future__ import annotations

import networkx as nx

from app.patterns.graph import CaseGraph, first
from app.patterns.rules import Occurrence

INDICATOR = "ML-023"
VERSION = 1
WEAK = False


def run(graph: CaseGraph) -> list[Occurrence]:
    g = graph.directed("Payment")
    out = []
    for cycle in nx.simple_cycles(nx.DiGraph(g)):
        ring = list(cycle)
        if len(ring) < 2:
            continue
        links, amounts = [], []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            key = sorted(g.get_edge_data(a, b).keys())[0]
            links.append(key)
            link = g.get_edge_data(a, b)[key]["link"]
            amounts.append(f"{first(link.properties, 'amount') or '?'} {first(link.properties, 'currency') or ''}".strip())
        names = " → ".join(graph.name(p) for p in ring + ring[:1])
        out.append(Occurrence("textbook", ring, links, {"loop": [graph.name(p) for p in ring], "amounts": amounts},
                              f"Money goes round and back: {names}."))
    return out
