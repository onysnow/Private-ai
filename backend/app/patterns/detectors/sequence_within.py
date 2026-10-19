"""One kind of link or event, then another, involving the same party, within
a number of days: a company created then paid soon after; a director
appointed then a contract won. Only records dated to the day count."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import day
from app.patterns.graph import CaseGraph

NAME = "sequence_within"
VERSION = 1


class Params(BaseModel):
    first: str  # link schema of the first step
    then: str  # link schema of the second step
    days: int
    join: str = "target_then_source"  # which end of each link is the shared party: <first end>_then_<then end>


def needs(p: Params) -> list[str]:
    return [p.first, p.then]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    first_end, then_end = p.join.split("_then_")
    firsts = [(day(l.properties), l) for l in graph.links if l.schema == p.first]
    thens = [(day(l.properties), l) for l in graph.links if l.schema == p.then]
    out = []
    for d1, a in firsts:
        if d1 is None:
            continue
        party = getattr(a, first_end)
        for d2, b in thens:
            if d2 is None or getattr(b, then_end) != party:
                continue
            gap = (d2 - d1).days
            if 0 <= gap <= p.days:
                out.append(Measure([a.source, a.target, b.source, b.target], [a.id, b.id], float(gap), {
                    "party": graph.name(party), "gap_days": gap, "first_date": d1.isoformat(), "then_date": d2.isoformat()}))
    return out
