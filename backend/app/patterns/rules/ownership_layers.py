"""BO-002 Long or unnecessarily complex ownership chain. The catalogue's
levels give numbers, each with its source: Faint at more than 3 layers
between the top owner and the company (the World Bank's Puppet Masters
"three-layer test"), Strong at more than 5 (Tax Justice Network 2020; Open
Ownership). Textbook ("complexity with no commercial sense") needs a
person's judgement, so the rule never sets it."""

from __future__ import annotations

import networkx as nx

from app.patterns.graph import CaseGraph
from app.patterns.rules import Occurrence

INDICATOR = "BO-002"
VERSION = 1
WEAK = False
FAINT_OVER = 3
STRONG_OVER = 5


def run(graph: CaseGraph) -> list[Occurrence]:
    g = nx.DiGraph(graph.directed("Ownership"))
    if not nx.is_directed_acyclic_graph(g):
        # A loop is BO-001; layers are counted on the acyclic part only.
        g = nx.DiGraph(g)
        g.remove_edges_from([e for cycle in nx.simple_cycles(g) for e in zip(cycle, cycle[1:] + cycle[:1])])
    multi = graph.directed("Ownership")
    out = []
    bottoms = [n for n in g.nodes if g.in_degree(n) > 0 and g.out_degree(n) == 0]
    for bottom in bottoms:
        # The longest chain of owners above this company.
        best: list[str] = []
        for top in nx.ancestors(g, bottom):
            if g.in_degree(top):
                continue
            for path in nx.all_simple_paths(g, top, bottom):
                if len(path) > len(best):
                    best = path
        layers = len(best) - 1
        if layers <= FAINT_OVER:
            continue
        level = "strong" if layers > STRONG_OVER else "faint"
        links = [sorted(multi.get_edge_data(a, b).keys())[0] for a, b in zip(best, best[1:])]
        chain = " → ".join(graph.name(p) for p in best)
        out.append(Occurrence(level, best, links, {"layers": layers, "faint_over": FAINT_OVER, "strong_over": STRONG_OVER},
                              f"{layers} layers of ownership above {graph.name(bottom)}: {chain}."))
    return out
