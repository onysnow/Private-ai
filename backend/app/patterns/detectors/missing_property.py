"""A link of one kind whose record gives no value for a property: a payment
with no purpose (BO-033).

Two different things look alike here. A record can say the payment had no
purpose ("none stated", "no purpose"), which is what the indicator describes.
Or the records can simply hold no purpose yet, which may mean only that no one
has recorded it. The first measures 2, the second 1, so the spec can give them
different levels and words. Found on the 1MDB case: 31 payments were Textbook
only because their purposes had not been entered."""

from __future__ import annotations

import re

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import amount_words
from app.patterns.graph import CaseGraph, first

NAME = "missing_property"
VERSION = 3  # 3: a value stated as absent (2) is told apart from no value recorded (1)

STATED_ABSENT = 2.0
NOT_RECORDED = 1.0


class Params(BaseModel):
    link: str
    property: str
    # Values that state the property is absent, rather than give it.
    absent: list[str] = ["none", "none stated", "no purpose", "no stated purpose", "not stated", "unstated", "without purpose",
                         "no business purpose", "no legitimate purpose"]


def needs(p: Params) -> list[str]:
    return [p.link]


def _norm(value: str) -> str:
    return re.sub(r"[\s.,;:]+", " ", value.strip().lower()).strip()


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    absent = {_norm(v) for v in p.absent}
    out = []
    for link in graph.links:
        if link.schema != p.link:
            continue
        given = str(first(link.properties, p.property) or "").strip()
        if given and _norm(given) not in absent:
            continue
        stated = bool(given)
        amount = amount_words(link.properties)
        out.append(Measure([link.source, link.target], [link.id], STATED_ABSENT if stated else NOT_RECORDED, {
            "source": graph.name(link.source), "target": graph.name(link.target), "amount": amount or None,
            "amount_text": f" {amount}" if amount else "", "date": first(link.properties, "date"),
            "stated": stated, "finding": f"and the record says “{given}”" if stated else "and no purpose is found in the records yet"}))
    return out
