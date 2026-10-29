"""The orders things usually happen in (research §2.9, Innovation 1; SYN_VIZ C8): the timeline checks a case's events
against them and says when one comes before a step that should precede it ("The €42,000 payment comes before any
recorded award"). An out-of-order pair is said, never made a lead on its own: the reporter presses Make a lead.

A rule is a list of steps in their usual order. Each step is recognised by the record's FollowTheMoney schema, a
record date's property, or words in a title. A step marked `needed` is one whose absence before a later step is the
finding; the others only set the scene (a payment with no tender before it is not out of order: nothing says a
tender was held).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Step:
    name: str
    schemas: tuple[str, ...] = ()
    props: tuple[str, ...] = ()
    words: str = ""  # a regular expression over the title, whole words
    needed: bool = False


@dataclass(frozen=True)
class Rule:
    key: str
    name: str
    steps: tuple[Step, ...]
    say: str
    # "party": only events sharing a party with the later event count; "case": any event in the case.
    scope: str = "case"
    source: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


RULES: tuple[Rule, ...] = (
    Rule("procurement", "A public contract",
         (Step("tender", words=r"tender|call for bids|invitation to bid|procurement notice"),
          Step("bid", words=r"bids?|offer|tendered"),
          Step("award", schemas=("ContractAward",), words=r"award(?:ed)?|won the contract", needed=True),
          Step("contract", schemas=("Contract",), words=r"contract signed|signed the contract"),
          Step("payment", schemas=("Payment",), words=r"paid|payment|transfer(?:red)?")),
         "A tender is usually followed by an award, then a contract, then payment.",
         source="Open Contracting Data Standard, the stages of a contracting process (planning, tender, award, contract, "
                "implementation)"),
    Rule("company", "A company's life",
         (Step("formed", props=("incorporationDate",), words=r"incorporat\w*|registered|formed|founded", needed=True),
          Step("director", schemas=("Directorship",), words=r"appointed|director"),
          Step("payment", schemas=("Payment",), words=r"paid|payment")),
         "A company is formed before it appoints directors or pays anyone.",
         scope="party", source="A company cannot act before it exists: its register entry gives the date."),
)


def step_of(rule: Rule, event: dict[str, Any]) -> int | None:
    """The index of the step this event is in the rule, or None."""
    schema = event.get("schema")
    prop = (event.get("prop") or "")
    title = event.get("title") or ""
    for i, step in reversed(list(enumerate(rule.steps))):  # the later step wins: "payment for the award" is a payment
        if schema and schema in step.schemas:
            return i
        if prop and prop in step.props:
            return i
    if schema:  # a record with a schema is that record, not what its title mentions
        return None
    for i, step in reversed(list(enumerate(rule.steps))):
        if step.words and re.search(rf"\b(?:{step.words})\b", title, re.IGNORECASE):
            return i
    return None


def _bounds(text: str) -> tuple[str, str]:
    """The first and last day a date known to the day, month or year can be."""
    text = text[:10]
    if len(text) == 4:
        return f"{text}-01-01", f"{text}-12-31"
    if len(text) == 7:
        return f"{text}-01", f"{text}-31"  # compared as text: no month has a day after its 31st
    return text, text


def _span(event: dict[str, Any]) -> tuple[str, str]:
    """The earliest and latest day the event can be on, from how exact its date is."""
    start = str(event.get("date_start") or "")
    return _bounds(start)[0], _bounds(str(event.get("date_end") or start))[1]


def check(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Each event that comes before a needed step of a rule that it should follow, with the rule, the missing step, and
    the nearest earlier step that is there. An event is "before" another only when its latest possible day is before
    the other's earliest; a needed step whose dates overlap the event's may be before it, so a month-only date that
    overlaps is not said to be out of order."""
    out: list[dict[str, Any]] = []
    dated = [e for e in events if e.get("date_start") and not e.get("placeholder")]
    for rule in RULES:
        steps = {id(e): step_of(rule, e) for e in dated}
        for later in dated:
            k = steps[id(later)]
            if k is None or k == 0:
                continue
            later_lo, later_hi = _span(later)
            parties = set(later.get("parties") or [])
            pool = [e for e in dated if e is not later and steps[id(e)] is not None
                    and (rule.scope == "case" or parties & set(e.get("parties") or []))]
            before = [e for e in pool if _span(e)[1] < later_lo]
            for j, step in enumerate(rule.steps[:k]):
                if not step.needed:
                    continue
                # A needed step that is, or may be (their dates overlap), before the event: in order.
                if any(steps[id(e)] == j and _span(e)[0] <= later_hi for e in pool):
                    continue
                # Said only when the scene is set: an earlier step is there, or (for a needed first step) the step is
                # recorded at all but only later.
                scene = [e for e in before if (steps[id(e)] or 0) < j]
                later_needed = [e for e in pool if steps[id(e)] == j]
                if not scene and not later_needed:
                    continue
                nearest = max(scene, key=lambda e: _span(e)[0]) if scene else None
                out.append({
                    "event_id": later["id"], "rule": rule.key, "rule_name": rule.name, "missing": step.name,
                    "after_id": nearest["id"] if nearest else None,
                    "found_later_id": later_needed[0]["id"] if later_needed else None,
                    "say": f"{later.get('title')} comes before any recorded {step.name}.",
                    "why": rule.say, "basis": rule.source,
                    "steps": [s.name for s in rule.steps],
                })
                break
    return out
