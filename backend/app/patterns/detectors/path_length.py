"""The longest chain of links of one kind above each party at the bottom of
a chain: layers of ownership (BO-002). A loop is left to the cycle family;
layers are counted on the acyclic part."""

from __future__ import annotations

import networkx as nx
from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "path_length"
VERSION = 1


class Params(BaseModel):
    link: str


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    multi = graph.directed(p.link)
    g = nx.DiGraph(multi)
    if not nx.is_directed_acyclic_graph(g):
        g.remove_edges_from([e for cycle in nx.simple_cycles(nx.DiGraph(g)) for e in zip(cycle, cycle[1:] + cycle[:1])])
    out = []
    for bottom in [n for n in g.nodes if g.in_degree(n) > 0 and g.out_degree(n) == 0]:
        best: list[str] = []
        for top in nx.ancestors(g, bottom):
            if g.in_degree(top):
                continue
            for path in nx.all_simple_paths(g, top, bottom):
                if len(path) > len(best):
                    best = path
        if len(best) < 2:
            continue
        layers = len(best) - 1
        links = [sorted(multi.get_edge_data(a, b).keys())[0] for a, b in zip(best, best[1:])]
        out.append(Measure(best, links, float(layers), {
            "layers": layers, "bottom": graph.name(bottom), "chain": " → ".join(graph.name(x) for x in best)}))
    return out
