"""BO-032 Apparently unrelated parties share an address, phone or email:
two parties whose records give the same address, phone number or email
address, with no link between them in the records. The catalogue gives no
number, so a shared detail between unlinked parties meets the published
definition as worded: Textbook."""

from __future__ import annotations

import re
from collections import defaultdict

from app.patterns.graph import CaseGraph
from app.patterns.rules import Occurrence

INDICATOR = "BO-032"
VERSION = 1
WEAK = False
FIELDS = {"address": "address", "phone": "phone", "email": "email"}


def _norm(kind: str, value: str) -> str:
    v = value.strip().lower()
    if kind == "phone":
        return re.sub(r"\D", "", v)
    return re.sub(r"[\s,.]+", " ", v).strip()


def run(graph: CaseGraph) -> list[Occurrence]:
    linked = {frozenset((l.source, l.target)) for l in graph.links}
    holders: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for party in graph.parties.values():
        for prop, kind in FIELDS.items():
            for value in party.properties.get(prop) or []:
                key = _norm(kind, str(value))
                if len(key) >= 5:
                    holders[(kind, key)][party.id] = str(value)
    out = []
    for (kind, _), who in sorted(holders.items()):
        ids = sorted(who)
        if len(ids) < 2:
            continue
        unlinked = [p for p in ids if not any(frozenset((p, q)) in linked for q in ids if q != p)]
        if len(unlinked) < 2:
            continue
        value = who[unlinked[0]]
        out.append(Occurrence("textbook", unlinked, [], {"kind": kind, "value": value},
                              f"{', '.join(graph.name(p) for p in unlinked)} share the {kind} “{value}” and no link joins them in the records."))
    return out
