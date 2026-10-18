"""One record that gives two different values for a property that should
have one: two dates of birth, two incorporation dates, two nationalities on
one passport. Values are compared after trimming and ignoring case."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "conflicting_values"
VERSION = 1


class Params(BaseModel):
    record: str
    property: str


def needs(p: Params) -> list[str]:
    return [p.record]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    out = []
    for party in graph.parties.values():
        if party.schema != p.record:
            continue
        values = list(dict.fromkeys(str(v).strip() for v in party.properties.get(p.property) or [] if str(v).strip()))
        distinct = {v.lower() for v in values}
        if len(distinct) > 1:
            out.append(Measure([party.id], [], float(len(distinct)), {"party": party.name, "property": p.property, "values": " and ".join(values)}))
    return out
