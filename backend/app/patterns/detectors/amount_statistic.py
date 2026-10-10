"""A statistic over the amounts of many links: the share of round amounts,
or how far first digits stray from Benford's law (mean absolute deviation,
Nigrini's measure). Needs enough amounts to mean anything; below the spec's
minimum it gives no value."""

from __future__ import annotations

import math
from collections import Counter

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import number
from app.patterns.graph import CaseGraph

NAME = "amount_statistic"
VERSION = 1


class Params(BaseModel):
    link: str = "Payment"
    property: str = "amount"
    test: str  # round_share or benford_mad
    round_to: float = 1000.0
    min_count: int = 30
    by: str | None = None  # source or target to test each party's links apart; None tests them all together


def needs(p: Params) -> list[str]:
    return [p.link]


def _first_digit(x: float) -> int | None:
    x = abs(x)
    if x <= 0:
        return None
    return int(str(f"{x:e}")[0])


def _stat(amounts: list[float], p: Params) -> float:
    if p.test == "round_share":
        return sum(1 for a in amounts if a and a % p.round_to == 0) / len(amounts)
    digits = Counter(d for a in amounts if (d := _first_digit(a)))
    n = sum(digits.values())
    return sum(abs(digits.get(d, 0) / n - math.log10(1 + 1 / d)) for d in range(1, 10)) / 9


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    groups: dict[str | None, list] = {}
    for link in graph.links:
        if link.schema == p.link and (a := number(link.properties, p.property)) is not None:
            key = None if p.by is None else (link.source if p.by == "source" else link.target)
            groups.setdefault(key, []).append((a, link))
    out = []
    for key, items in groups.items():
        if len(items) < p.min_count:
            continue
        value = _stat([a for a, _ in items], p)
        parties = [key] if key else []
        out.append(Measure(parties, [l.id for _, l in items], round(value, 4), {
            "party": graph.name(key) if key else "these records", "count": len(items),
            "share_text": f"{round(100 * value)}%", "value": round(value, 4)}))
    return out
