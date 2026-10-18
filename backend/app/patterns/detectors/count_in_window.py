"""Links of one kind counted, or their amounts added up, per party within a
sliding window of days: bursts of activity. Only links dated to the day
count; the facts say how many were left out for want of a day."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import day, number
from app.patterns.graph import CaseGraph

NAME = "count_in_window"
VERSION = 1


class Params(BaseModel):
    link: str = "Payment"
    days: int
    by: str = "source"
    measure: str = "count"  # count or sum
    property: str = "amount"


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    groups: dict[str, list] = defaultdict(list)
    undated: dict[str, int] = defaultdict(int)
    for link in graph.links:
        if link.schema != p.link:
            continue
        key = link.source if p.by == "source" else link.target
        when = day(link.properties)
        if when is None:
            undated[key] += 1
            continue
        groups[key].append((when, link))
    out = []
    for key, items in groups.items():
        items.sort(key=lambda x: x[0])
        best: tuple[float, list] = (0.0, [])
        start = 0
        for end in range(len(items)):
            while (items[end][0] - items[start][0]).days > p.days:
                start += 1
            window = items[start:end + 1]
            value = float(len(window)) if p.measure == "count" else sum(number(l.properties, p.property) or 0.0 for _, l in window)
            if value > best[0]:
                best = (value, window)
        value, window = best
        if not window:
            continue
        others = list(dict.fromkeys((l.target if p.by == "source" else l.source) for _, l in window))
        out.append(Measure([key, *others], [l.id for _, l in window], value, {
            "party": graph.name(key), "value": value, "first_date": window[0][0].isoformat(), "last_date": window[-1][0].isoformat(),
            "days": p.days, "left_out_undated": undated.get(key, 0)}))
    return out
