"""A party's recent activity against its own earlier activity: how many
times more it paid out (or received) in the latest window than in an
average window before it. A party with no earlier activity in the records
gives no value: there is nothing to compare with."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import day, number
from app.patterns.graph import CaseGraph

NAME = "baseline_change"
VERSION = 1


class Params(BaseModel):
    link: str = "Payment"
    by: str = "source"
    recent_days: int = 30
    measure: str = "sum"  # sum of amounts, or count
    property: str = "amount"


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    groups: dict[str, list] = defaultdict(list)
    for link in graph.links:
        if link.schema == p.link and (when := day(link.properties)) is not None:
            groups[link.source if p.by == "source" else link.target].append((when, link))
    out = []
    for key, items in groups.items():
        items.sort(key=lambda x: x[0])
        end = items[-1][0]
        start = end - timedelta(days=p.recent_days)
        recent = [l for d, l in items if d > start]
        before = [(d, l) for d, l in items if d <= start]
        if not before:
            continue
        span_days = max(p.recent_days, (start - before[0][0]).days + 1)
        windows = span_days / p.recent_days
        val = (lambda ls: float(len(ls)) if p.measure == "count" else sum(number(l.properties, p.property) or 0.0 for l in ls))
        earlier = val([l for _, l in before]) / windows
        if earlier <= 0:
            continue
        ratio = val(recent) / earlier
        out.append(Measure([key], [l.id for l in recent], round(ratio, 2), {
            "party": graph.name(key), "times": f"{ratio:.1f}", "recent_days": p.recent_days, "window_end": end.isoformat()}))
    return out
