"""A number on a link or a party, read for the bands: an amount, a share, a
count a record states. The spec's bands carry the published numbers."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import number
from app.patterns.graph import CaseGraph, first

NAME = "property_threshold"
VERSION = 1


class Params(BaseModel):
    record: str  # a link schema (Payment) or a party schema (Company)
    property: str
    currency: str | None = None



def needs(p: Params) -> list[str]:
    return [p.record]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    out = []
    for link in graph.links:
        if link.schema != p.record:
            continue
        if p.currency and str(first(link.properties, "currency") or "").upper() != p.currency.upper():
            continue
        value = number(link.properties, p.property)
        if value is not None:
            out.append(Measure([link.source, link.target], [link.id], value, {
                "value": value, "value_text": f"{value:,.0f}", "source": graph.name(link.source), "target": graph.name(link.target)}))
    for party in graph.parties.values():
        if party.schema != p.record:
            continue
        value = number(party.properties, p.property)
        if value is not None:
            out.append(Measure([party.id], [], value, {"value": value, "value_text": f"{value:,.0f}", "party": party.name}))
    return out
