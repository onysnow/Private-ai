"""A link of one kind whose record leaves a property empty: a payment with
no stated purpose (BO-033)."""

from __future__ import annotations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import amount_words
from app.patterns.graph import CaseGraph, first

NAME = "missing_property"
VERSION = 2  # 2: amounts written with thousands separators


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
        amount = amount_words(link.properties)
        out.append(Measure([link.source, link.target], [link.id], None, {
            "source": graph.name(link.source), "target": graph.name(link.target), "amount": amount or None,
            "amount_text": f" {amount}" if amount else "", "date": first(link.properties, "date")}))
    return out
