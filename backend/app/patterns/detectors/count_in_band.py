"""Links of one kind whose amount falls in a band, counted per party (the
payer or the payee): repeated payments just under a reporting threshold
(ML-021). No source sets a time window, so every link in the records counts;
count_in_window adds one when a source gives it."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import number
from app.patterns.graph import CaseGraph, first

NAME = "count_in_band"
VERSION = 1


class Params(BaseModel):
    link: str = "Payment"
    property: str = "amount"
    currency: str | None = None
    low: float  # inclusive
    high: float  # exclusive
    by: str = "source"  # source (payer) or target (payee)


def needs(p: Params) -> list[str]:
    return [p.link]


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    groups: dict[str, list] = defaultdict(list)
    for link in graph.links:
        if link.schema != p.link:
            continue
        if p.currency and str(first(link.properties, "currency") or "").upper() != p.currency.upper():
            continue
        value = number(link.properties, p.property)
        if value is not None and p.low <= value < p.high:
            groups[link.source if p.by == "source" else link.target].append((link, value))
    out = []
    for key, items in groups.items():
        others = list(dict.fromkeys((l.target if p.by == "source" else l.source) for l, _ in items))
        total = sum(v for _, v in items)
        dates = sorted(d for l, _ in items if (d := first(l.properties, "date")))
        out.append(Measure([key, *others], [l.id for l, _ in items], float(len(items)), {
            "party": graph.name(key), "count": len(items), "payments": len(items), "total": total, "total_text": f"{total:,.0f}",
            "first_date": dates[0] if dates else None, "last_date": dates[-1] if dates else None,
            "period": f" from {dates[0]} to {dates[-1]}" if len(dates) > 1 else ""}))
    return out
