"""ML-021 Structuring below reporting thresholds: the same payer makes two
or more payments in US dollars between $9,000 and $10,000, the band US
Treasury reports show in most past structuring cases (TIGTA 2017; a FinCEN
case example; the catalogue's threshold note says it is not a rule). The
records cannot show whether the money was cash or whether it was split to
avoid the report, so the flag is Faint (indicators.md, "Partial matches are
Faint"). No source sets a time window, so every payment in the records counts."""

from __future__ import annotations

from collections import defaultdict

from app.patterns.graph import CaseGraph, first
from app.patterns.rules import Occurrence
from app.patterns.rules.amounts import amount

INDICATOR = "ML-021"
VERSION = 1
WEAK = False
BAND = (9_000.0, 10_000.0)  # catalogue ML-021 threshold note: $9,000 up to, not including, $10,000
REPEATED = 2  # "repeated" read as twice or more (ML-021 threshold note)


def run(graph: CaseGraph) -> list[Occurrence]:
    by_payer: dict[str, list] = defaultdict(list)
    for link in graph.links:
        if link.schema != "Payment" or str(first(link.properties, "currency") or "").upper() != "USD":
            continue
        value = amount(link.properties)
        if value is not None and BAND[0] <= value < BAND[1]:
            by_payer[link.source].append((link, value))
    out = []
    for payer, payments in by_payer.items():
        if len(payments) < REPEATED:
            continue
        beneficiaries = list(dict.fromkeys(l.target for l, _ in payments))
        total = sum(v for _, v in payments)
        dates = sorted(d for l, _ in payments if (d := first(l.properties, "date")))
        out.append(Occurrence(
            "faint", [payer, *beneficiaries], [l.id for l, _ in payments],
            {"payments": len(payments), "total": total, "first_date": dates[0] if dates else None, "last_date": dates[-1] if dates else None},
            f"{graph.name(payer)} made {len(payments)} payments between $9,000 and $10,000 (${total:,.0f} in all)"
            f"{f' from {dates[0]} to {dates[-1]}' if len(dates) > 1 else ''}, each just under the $10,000 reporting threshold.",
            ["whether the money was cash", "whether it was split to avoid the report"]))
    return out
