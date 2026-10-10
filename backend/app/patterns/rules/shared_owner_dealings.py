"""BO-031 Dealings between companies with the same owners or directors: a
payment between two parties that share an owner or a director (someone
holds an Ownership or Directorship link to both). The records cannot show
whether there was a business reason, so the flag is Faint (indicators.md,
"Partial matches are Faint"). A payer that itself owns the payee is not
counted here: that is a parent paying its own company."""

from __future__ import annotations

from collections import defaultdict

from app.patterns.graph import CaseGraph
from app.patterns.rules import Occurrence

INDICATOR = "BO-031"
VERSION = 1
WEAK = False
HOLDS = {"Ownership", "Directorship"}  # owner -> asset; director -> organization


def run(graph: CaseGraph) -> list[Occurrence]:
    holders: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))  # company -> holder -> links
    for link in graph.links:
        if link.schema in HOLDS:
            holders[link.target][link.source].append(link)
    payments: dict[frozenset[str], list] = defaultdict(list)
    for link in graph.links:
        if link.schema == "Payment" and link.source != link.target:
            payments[frozenset((link.source, link.target))].append(link)
    out = []
    for pair, paid in payments.items():
        a, b = sorted(pair)
        if a in holders[b] or b in holders[a]:
            continue
        shared = sorted(set(holders[a]) & set(holders[b]))
        if not shared:
            continue
        roles = [f"{graph.name(h)} ({' and '.join(sorted({l.schema.lower() for l in holders[a][h] + holders[b][h]}))})" for h in shared]
        held = [l.id for h in shared for l in holders[a][h] + holders[b][h]]
        out.append(Occurrence(
            "faint", [a, b, *shared], [l.id for l in paid] + held,
            {"payments": len(paid), "shared": shared},
            f"{len(paid)} payment{'s' if len(paid) != 1 else ''} between {graph.name(a)} and {graph.name(b)}; "
            f"both are held or run by {', '.join(roles)}.",
            ["whether there was a business reason for the payments"]))
    return out
