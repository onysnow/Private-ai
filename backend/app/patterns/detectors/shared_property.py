"""Parties whose records give the same address, phone or email with no link
between them in the records (BO-032)."""

from __future__ import annotations

import re
from collections import defaultdict

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "shared_property"
VERSION = 1


class Params(BaseModel):
    properties: dict[str, str]  # FtM property -> what it is (address, phone, email)
    unlinked_only: bool = True
    min_length: int = 5


def needs(p: Params) -> list[str]:
    return []  # any party can carry these properties


def _norm(kind: str, value: str) -> str:
    v = value.strip().lower()
    return re.sub(r"\D", "", v) if kind == "phone" else re.sub(r"[\s,.]+", " ", v).strip()


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    linked = {frozenset((l.source, l.target)) for l in graph.links}
    holders: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for party in graph.parties.values():
        for prop, kind in p.properties.items():
            for value in party.properties.get(prop) or []:
                key = _norm(kind, str(value))
                if len(key) >= p.min_length:
                    holders[(kind, key)][party.id] = str(value)
    out = []
    for (kind, _), who in sorted(holders.items()):
        ids = sorted(who)
        if len(ids) < 2:
            continue
        group = [x for x in ids if not any(frozenset((x, q)) in linked for q in ids if q != x)] if p.unlinked_only else ids
        if len(group) < 2:
            continue
        out.append(Measure(group, [], float(len(group)), {
            "kind": kind, "value": who[group[0]], "names": ", ".join(graph.name(x) for x in group)}))
    return out
