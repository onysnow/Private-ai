"""A link of one kind whose record leaves a property empty: a payment with
no stated purpose (BO-033)."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph, first

NAME = "missing_property"
VERSION = 1


class Params(BaseModel):
    link: str
    property: str


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    out = []
    for link in graph.links:
        if link.schema != p.link or str(first(link.properties, p.property) or "").strip():
            continue
        amount = f"{first(link.properties, 'amount') or ''} {first(link.properties, 'currency') or ''}".strip()
        out.append(Measure([link.source, link.target], [link.id], None, {
            "source": graph.name(link.source), "target": graph.name(link.target), "amount": amount or None,
            "amount_text": f" {amount}" if amount else "", "date": first(link.properties, "date")}))
    return out
