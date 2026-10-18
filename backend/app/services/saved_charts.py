"""Charts a reporter builds by hand (the chart builder), kept in a deck or a
write-up.

The builder sends only the order slip -- the question, the query, the kind
and the title -- never numbers. The chart is cooked, drawn and checked here
by the same gate the AI's charts pass (app/ai/chart_check.py resolve_chart),
from the investigation the deck or write-up belongs to, so a saved chart is
always the Workbench's own reading of that investigation's records. A chart
that fails the checks is refused with the rules it broke, as the preview
already showed them.
"""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

from app.ai.chart_check import resolve_chart
from app.models.decks import Deck
from app.models.writeups import Writeup
from app.services.decks import update_deck
from app.services.writeups import update_writeup
from app.visuals.spec import VisualSpec


class ChartRefused(ValueError):
    """The chart could not be drawn or failed the design checks."""

    def __init__(self, reason: str, errors: list[dict[str, Any]]):
        super().__init__(reason)
        self.reason = reason
        self.errors = errors


def _resolved(db: Session, investigation_id: str, spec: VisualSpec, style: dict | None) -> dict:
    visual, outcome = resolve_chart(db, investigation_id, {"spec": spec.model_dump(mode="json")})
    if visual is None:
        raise ChartRefused(str(outcome.get("reason") or "the chart could not be drawn"), list(outcome.get("errors") or []))
    if style:
        # Kept as the catalogue allows it (app/services/decks.py
        # normalize_chart_style runs when the deck is saved).
        visual["style"] = style
    return visual


def add_chart_to_deck(db: Session, deck: Deck, spec: VisualSpec, *, heading: str | None = None,
                      style: dict | None = None) -> Deck:
    """A new content slide at the end of the deck, holding the chart. The
    deck then draws and checks it again in its own theme, as it does on
    every save."""
    visual = _resolved(db, deck.investigation_id, spec, style)
    slide = {"kind": "content", "heading": (heading or "").strip() or spec.title, "bullets": [], "evidence": [],
             "notes": visual["text"].get("description") or "", "visual": visual}
    return update_deck(db, deck, {"slides_json": [*copy.deepcopy(deck.slides_json or []), slide]})


def add_chart_to_writeup(db: Session, writeup: Writeup, spec: VisualSpec, *, style: dict | None = None) -> Writeup:
    """The chart at the end of the write-up, as the node the editor and the
    Word export already know (evidenceVisual). Its records count as the
    write-up's citations."""
    visual = _resolved(db, writeup.investigation_id, spec, style)
    doc = copy.deepcopy(writeup.content_json or {"type": "doc", "content": []})
    doc.setdefault("type", "doc")
    doc["content"] = [*(doc.get("content") or []), {"type": "evidenceVisual", "attrs": {"visual": visual}}]
    return update_writeup(db, writeup, {"content_json": doc})
