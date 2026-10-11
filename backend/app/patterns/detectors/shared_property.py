"""Parties whose records give the same address, phone or email with no link
between them in the records (BO-032)."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from itertools import combinations

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.graph import CaseGraph

NAME = "shared_property"
# 2: a city or country alone is not a shared address.
# 3: one address written two ways is one address ("44 Esplanade, St. Helier" and
#    "Esplanade 44, Saint Helier"); a holder linked to one co-holder no longer hides
#    an unlinked pair among the others.
VERSION = 3


class Params(BaseModel):
    properties: dict[str, str]  # FtM property -> what it is (address, phone, email)
    unlinked_only: bool = True
    min_length: int = 5


def needs(p: Params) -> list[str]:
    return []  # any party can carry these properties


# One spelling for words addresses abbreviate. "St." is a street ("Kozhinoy St.")
# or a saint ("St. Helier"); it cannot be told apart word by word, so street, str,
# st and saint all become one word: two addresses that differ only there are one.
_WORDS = {
    "street": "st", "str": "st", "saint": "st", "ul": "st", "ulitsa": "st",
    "road": "rd", "avenue": "ave", "av": "ave", "boulevard": "blvd", "drive": "dr",
    "lane": "ln", "square": "sq", "place": "pl", "tower": "twr", "floor": "fl",
    "building": "bldg", "suite": "ste", "apartment": "apt", "number": "no",
    "prospekt": "pr", "prospect": "pr",
}


def address_key(value: str) -> str:
    """The key two spellings of one address share: case folded, accents and
    punctuation gone, common abbreviations spelt one way, and the words in sorted
    order so a house number before or after the street ("44 Esplanade",
    "Esplanade 44") makes no difference. Every word and number is kept, so "44
    Esplanade" and "45 Esplanade", or two postcodes, stay two addresses."""
    v = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().casefold()
    v = re.sub(r"['’`]", "", v)  # "Queen's" -> "queens"
    words = [_WORDS.get(w, w) for w in re.split(r"[^a-z0-9]+", v) if w]
    return " ".join(sorted(words))


def _norm(kind: str, value: str) -> str:
    v = value.strip().lower()
    if kind == "phone":
        return re.sub(r"\D", "", v)
    if kind == "address":
        return address_key(value)
    return re.sub(r"[\s,.]+", " ", v).strip()


def _specific(kind: str, key: str) -> bool:
    """A city or a country is not a shared address: an address counts only when it
    names a place a party could be found at, which in practice carries a number
    (a street number, a postcode, a PO box). Found on the 1MDB case: "New York,
    New York" joined Goldman Sachs and two apartments."""
    return kind != "address" or any(ch.isdigit() for ch in key)


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    linked = {frozenset((l.source, l.target)) for l in graph.links}
    holders: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for party in graph.parties.values():
        for prop, kind in p.properties.items():
            for value in party.properties.get(prop) or []:
                key = _norm(kind, str(value))
                if len(key) >= p.min_length and _specific(kind, key):
                    holders[(kind, key)].setdefault(party.id, str(value))
    out = []
    for (kind, _), who in sorted(holders.items()):
        ids = sorted(who)
        if len(ids) < 2:
            continue
        unlinked = [(a, b) for a, b in combinations(ids, 2) if frozenset((a, b)) not in linked]
        # A holder stays when at least one other holder has no link to it: a party
        # linked to every other holder adds nothing a reader does not already see.
        group = sorted({x for pair in unlinked for x in pair} if p.unlinked_only else ids, key=lambda x: (graph.name(x), x))
        if len(group) < 2:
            continue
        value = who[group[0]]
        spellings = list(dict.fromkeys(who[x] for x in group))
        pairs = [(a, b) for a, b in combinations(group, 2) if frozenset((a, b)) not in linked]
        all_apart = len(pairs) == len(group) * (len(group) - 1) // 2
        out.append(Measure(group, [], float(len(group)), {
            "kind": kind, "value": value, "names": ", ".join(graph.name(x) for x in group),
            "spellings": spellings,
            "as_written": "; ".join(f"{graph.name(x)}: “{who[x]}”" for x in group),
            "also_written": "".join(f", also written “{s}”" for s in spellings[1:]),
            "no_link": "no link joins them in the records" if all_apart or not p.unlinked_only else
                       "no link in the records joins " + "; ".join(f"{graph.name(a)} and {graph.name(b)}" for a, b in pairs),
        }))
    return out
