"""A party or link whose property has one of a listed set of values: a
jurisdiction on a published list, a role, a legal form, a status. The spec
holds the list, cited to its source."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "attribute_in_set"
VERSION = 1


class Params(BaseModel):
    record: str  # party schema (Company) or link schema (Directorship)
    property: str
    values: list[str]
    match: str = "exact"  # exact (ignoring case) or contains


def needs(p: Params) -> list[str]:
    return [p.record]


def _hit(value: str, p: Params) -> str | None:
    v = value.strip().lower()
    for want in p.values:
        w = want.strip().lower()
        if (p.match == "contains" and w in v) or v == w:
            return want
    return None


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    out = []
    for party in graph.parties.values():
        if party.schema == p.record:
            for value in party.properties.get(p.property) or []:
                if (hit := _hit(str(value), p)) is not None:
                    out.append(Measure([party.id], [], 1.0, {"party": party.name, "property": p.property, "value": str(value), "listed_as": hit}))
                    break
    for link in graph.links:
        if link.schema == p.record:
            for value in link.properties.get(p.property) or []:
                if (hit := _hit(str(value), p)) is not None:
                    out.append(Measure([link.source, link.target], [link.id], 1.0, {
                        "source": graph.name(link.source), "target": graph.name(link.target), "property": p.property, "value": str(value), "listed_as": hit}))
                    break
    return out
