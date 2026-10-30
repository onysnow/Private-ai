"""Links of one kind whose records give no value for a property: payments with
no purpose (BO-033), one measure per payer and payee.

Two different things look alike here. A record can say the payment had no
purpose ("none stated", "no purpose"), which is what the indicator describes.
Or the records can simply hold no purpose yet, which may mean only that no one
has recorded it. The first measures 2, the second 1, so the spec can give them
different levels and words. Found on the 1MDB case: 31 payments were Textbook
only because their purposes had not been entered.

The payments from one payer to one payee are one measure (one for those the
records say had no purpose, one for those with none recorded yet), carrying
every such payment, their count, the total per currency (never added across
currencies) and the dates they span. One flag per payment buried the board:
31 of 37 flags on 1MDB, 144 on Anise, whose payments go to five accounts."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from pydantic import BaseModel

from app.patterns.detectors import Measure
from app.patterns.detectors._util import amount_words, money, number
from app.patterns.graph import CaseGraph, Link, first

NAME = "missing_property"
# 3: a value stated as absent (2) is told apart from no value recorded (1).
# 4: one measure per payer and payee (stated and not recorded apart), not one per link.
VERSION = 4

STATED_ABSENT = 2.0
NOT_RECORDED = 1.0


class Params(BaseModel):
    link: str
    property: str
    # Values that state the property is absent, rather than give it.
    absent: list[str] = ["none", "none stated", "no purpose", "no stated purpose", "not stated", "unstated", "without purpose",
                         "no business purpose", "no legitimate purpose"]


def needs(p: Params) -> list[str]:
    return [p.link]


def _norm(value: str) -> str:
    return re.sub(r"[\s.,;:]+", " ", value.strip().lower()).strip()


def _date(link: Link) -> str:
    return str(first(link.properties, "date") or first(link.properties, "startDate") or "").strip()


def _totals(links: list[Link]) -> tuple[dict[str, float], int]:
    """The total per currency (never added across currencies), and how many links have no amount to add."""
    totals: dict[str, float] = defaultdict(float)
    no_amount = 0
    for link in links:
        value = number(link.properties)
        if value is None:
            no_amount += 1
        else:
            totals[str(first(link.properties, "currency") or "").strip().upper()] += value
    return dict(sorted(totals.items())), no_amount


def _paid_text(links: list[Link], totals: dict[str, float], no_amount: int, dates: list[str]) -> str:
    """What was paid, as the summary reads it after "A paid B": " 5,000 EUR" for one payment;
    " 3 times, 12,000 EUR and 5,000 USD in all, from 2014-01-03 to 2015-03-09" for several."""
    if len(links) == 1:
        amount = amount_words(links[0].properties)
        return f" {amount}" if amount else ""
    text = f" {len(links)} times"
    spent = " and ".join(money(v, c) for c, v in totals.items())
    if spent:
        text += f", {spent} in all"
    if no_amount:
        text += f" ({no_amount} with no amount)"
    if dates:
        text += f", from {dates[0]} to {dates[-1]}" if dates[0] != dates[-1] else f", on {dates[0]}"
        if len(dates) < len(links):
            text += f" ({len(links) - len(dates)} undated)"
    return text


def _finding(count: int, givens: list[str]) -> str:
    said = list(dict.fromkeys(g for g in givens if g))
    if said:
        quoted = "”, “".join(said)
        return f"and the record says “{quoted}”" if count == 1 else f"and the records say “{quoted}”"
    return "and no purpose is found in the records yet" if count == 1 else "and no purpose is found in the records for any of them yet"


def measure(graph: CaseGraph, p: Params) -> list[Measure]:
    absent = {_norm(v) for v in p.absent}
    groups: dict[tuple[str, str, bool], list[tuple[Link, str]]] = defaultdict(list)
    for link in graph.links:
        if link.schema != p.link:
            continue
        given = str(first(link.properties, p.property) or "").strip()
        if given and _norm(given) not in absent:
            continue
        groups[(link.source, link.target, bool(given))].append((link, given))
    out = []
    for (source, target, stated), found in groups.items():
        found.sort(key=lambda x: (_date(x[0]) or "~", x[0].id))  # by date; undated last
        links = [l for l, _ in found]
        totals, no_amount = _totals(links)
        dates = sorted(d for l in links if (d := _date(l)))
        one = links[0] if len(links) == 1 else None
        facts: dict[str, Any] = {
            "source": graph.name(source), "target": graph.name(target), "stated": stated, "payments": len(links),
            "totals": totals, "no_amount": no_amount, "date_from": dates[0] if dates else None, "date_to": dates[-1] if dates else None,
            # One payment's own amount and date, as before; none for several (the totals and dates above say it).
            "amount": (amount_words(one.properties) or None) if one else None, "date": first(one.properties, "date") if one else None,
            "amount_text": _paid_text(links, totals, no_amount, dates), "finding": _finding(len(links), [g for _, g in found]),
        }
        out.append(Measure([source, target], [l.id for l in links], STATED_ABSENT if stated else NOT_RECORDED, facts))
    return out
