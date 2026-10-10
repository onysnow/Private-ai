"""BO-033 Payments with no stated purpose: a Payment link whose record
states no purpose. The catalogue gives no number, so a payment without a
stated purpose meets the published definition as worded: Textbook. The
other half of the indicator (false or mismatched invoices) needs a person
reading the invoices."""

from __future__ import annotations

from app.patterns.graph import CaseGraph, first
from app.patterns.rules import Occurrence

INDICATOR = "BO-033"
VERSION = 1
WEAK = False


def run(graph: CaseGraph) -> list[Occurrence]:
    out = []
    for link in graph.links:
        if link.schema != "Payment" or (first(link.properties, "purpose") or "").strip():
            continue
        amount = f"{first(link.properties, 'amount') or ''} {first(link.properties, 'currency') or ''}".strip()
        out.append(Occurrence("textbook", [link.source, link.target], [link.id],
                              {"amount": amount or None, "date": first(link.properties, "date")},
                              f"{graph.name(link.source)} paid {graph.name(link.target)}{f' {amount}' if amount else ''} with no stated purpose."))
    return out
