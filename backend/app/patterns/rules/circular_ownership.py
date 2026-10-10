"""BO-001 Circular ownership: a loop in the directed graph of Ownership
links (patterns.md 1). The catalogue gives no number, so a loop meets the
published definition as worded: Textbook."""

from __future__ import annotations

import networkx as nx

from app.patterns.graph import CaseGraph
from app.patterns.rules import Occurrence

INDICATOR = "BO-001"
VERSION = 1
WEAK = False


def run(graph: CaseGraph) -> list[Occurrence]:
    g = graph.directed("Ownership")
    out = []
    for cycle in nx.simple_cycles(nx.DiGraph(g)):
        ring = list(cycle)
        links = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            links.append(sorted(g.get_edge_data(a, b).keys())[0])
        names = " → ".join(graph.name(p) for p in ring + ring[:1])
        out.append(Occurrence("textbook", ring, links, {"loop": [graph.name(p) for p in ring]}, f"Ownership runs in a loop: {names}."))
    return out
